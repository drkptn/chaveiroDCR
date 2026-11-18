/**
 * Modo anfitrião do Vinlancord: o servidor completo rodando no PC de quem hospeda.
 *
 * Roda dentro do app desktop (utilityProcess do Electron) ou direto no Node:
 *   VL_DATA_DIR=./dados node runtime.mjs
 *
 * Passos: segredos → certificado próprio → rede/UPnP → banco embutido → migrações → servidor (HTTPS).
 * Mensagens de status vão para o processo pai (app) ou para o terminal.
 */
import { randomBytes, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpsRequest } from 'node:https';
import { generate } from 'selfsigned';
import type { Gateway } from '@achingbrain/nat-port-mapper';
import { LocalPostgres } from './postgres';
import { migrate } from './migrate';
import { isCgnat, isPublicIPv4, localAddresses, openPorts, publicIpFromWeb, type VpnKind } from './network';

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const DATA = env.VL_DATA_DIR || join(process.cwd(), 'vinlancord-anfitriao');
const PORT = Number(env.VL_PORT || 47800);
const MEDIA_PORT = Number(env.VL_MEDIA_PORT || 47801);
const PG_PORT = Number(env.VL_PG_PORT || 47810);
const USE_UPNP = env.VL_UPNP !== '0';
/** 'internet' (padrão) | 'lan' | 'radmin' | 'hamachi' | 'zerotier' | 'tailscale' */
const NETWORK = (env.VL_NETWORK || 'internet') as 'internet' | 'lan' | VpnKind;

export type UpnpState = 'ok' | 'failed' | 'cgnat' | 'off';
export interface HostStatus {
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  step?: string;
  message?: string;
  url?: string;
  localUrl?: string;
  publicIp?: string | null;
  lanIp?: string;
  port?: number;
  mediaPort?: number;
  upnp?: UpnpState;
  upnpError?: string;
  fingerprint?: string;
  network?: string;
}

type ParentPort = { postMessage(m: unknown): void; on(ev: 'message', fn: (e: { data: { type?: string } }) => void): void };
const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
let last: HostStatus = { state: 'starting' };
function emit(s: Partial<HostStatus>) {
  last = { ...last, ...s };
  if (parentPort) parentPort.postMessage({ type: 'status', status: last });
  else console.log(`[anfitrião] ${s.state ?? last.state}${s.step ? ` — ${s.step}` : ''}${s.message ? ` — ${s.message}` : ''}${s.url ? ` — ${s.url}` : ''}`);
}

let db: LocalPostgres | null = null;
let gateway: Gateway | null = null;
let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  emit({ state: 'stopping', step: 'Desligando…' });
  await gateway?.stop().catch(() => {});
  await db?.stop().catch(() => {});
  emit({ state: 'stopped', step: 'Servidor desligado.' });
}

function secrets(): { pg: string; secretKey: string } {
  const file = join(DATA, 'segredos.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const s = { pg: randomBytes(18).toString('hex'), secretKey: randomBytes(32).toString('hex') };
  writeFileSync(file, JSON.stringify(s), { mode: 0o600 });
  return s;
}

async function certificate() {
  const dir = join(DATA, 'tls');
  mkdirSync(dir, { recursive: true });
  const certFile = join(dir, 'cert.pem');
  const keyFile = join(dir, 'key.pem');
  if (!existsSync(certFile) || !existsSync(keyFile)) {
    emit({ step: 'Gerando certificado de segurança (só na primeira vez)…' });
    const now = new Date();
    const pems = await generate([{ name: 'commonName', value: 'Vinlancord (anfitrião)' }], {
      keySize: 2048,
      algorithm: 'sha256',
      notBeforeDate: new Date(now.getTime() - 86400_000),
      notAfterDate: new Date(now.getTime() + 3650 * 86400_000),
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] },
      ],
    } as Parameters<typeof generate>[1]);
    writeFileSync(keyFile, pems.private, { mode: 0o600 });
    writeFileSync(certFile, pems.cert);
  }
  const fingerprint = new X509Certificate(readFileSync(certFile)).fingerprint256.replace(/:/g, '').toLowerCase();
  return { certFile, keyFile, fingerprint };
}

async function network() {
  const { lan, vpns } = localAddresses();
  if (NETWORK === 'lan') return { address: lan, publicIp: null, upnp: 'off' as UpnpState, lan };
  if (NETWORK !== 'internet') {
    const vpn = vpns.find((v) => v.kind === NETWORK);
    if (!vpn) throw new Error(`Não encontrei a rede ${NETWORK} neste PC. Instale e conecte o programa primeiro.`);
    return { address: vpn.ip, publicIp: null, upnp: 'off' as UpnpState, lan };
  }
  let upnp: UpnpState = 'off';
  let upnpError: string | undefined;
  let upnpIp: string | null = null;
  if (USE_UPNP) {
    emit({ step: 'Abrindo as portas no roteador (UPnP)…' });
    const r = await openPorts(lan, [
      { port: PORT, protocol: 'tcp' },
      { port: MEDIA_PORT, protocol: 'udp' },
      { port: MEDIA_PORT, protocol: 'tcp' },
    ]);
    gateway = r.gateway;
    upnpIp = r.externalIp;
    upnp = r.ok ? 'ok' : 'failed';
    upnpError = r.error;
  }
  emit({ step: 'Descobrindo o seu IP público…' });
  const webIp = env.VL_PUBLIC_IP || (await publicIpFromWeb());
  // o roteador recebeu um IP privado/compartilhado: a operadora usa CGNAT e ninguém de fora alcança este PC
  if (upnpIp && (isCgnat(upnpIp) || !isPublicIPv4(upnpIp) || (webIp && upnpIp !== webIp))) upnp = 'cgnat';
  const publicIp = webIp ?? upnpIp;
  return { address: publicIp ?? lan, publicIp, upnp, upnpError, lan };
}

async function main() {
  mkdirSync(DATA, { recursive: true });
  emit({ state: 'starting', step: 'Preparando…' });
  const keys = secrets();
  const tls = await certificate();
  const net = await network();
  emit({ upnp: net.upnp, upnpError: 'upnpError' in net ? net.upnpError : undefined, publicIp: net.publicIp, lanIp: net.lan, network: NETWORK });

  db = new LocalPostgres(join(DATA, 'banco'), PG_PORT, 'vinlancord', keys.pg);
  await db.start((m) => emit({ step: m }));
  const migrations = env.VL_MIGRATIONS_DIR || join(here, 'migrations');
  const applied = await migrate(db.url, migrations, (m) => emit({ step: m }));
  if (applied) emit({ step: `${applied} atualização(ões) do banco aplicada(s).` });

  const url = `https://${net.address}:${PORT}`;
  const web = env.VL_WEB_DIR || join(here, 'web');
  Object.assign(env, {
    VINLANCORD_SKIP_DOTENV: '1',
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    PORT: String(PORT),
    PUBLIC_URL: url,
    DATABASE_URL: db.url,
    REDIS_URL: '',
    SECRET_KEY: keys.secretKey,
    TLS_CERT_FILE: tls.certFile,
    TLS_KEY_FILE: tls.keyFile,
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: join(DATA, 'arquivos'),
    MAIL_OUTBOX_DIR: join(DATA, 'emails'),
    MEDIASOUP_LISTEN_IP: '0.0.0.0',
    MEDIASOUP_ANNOUNCED_IP: net.address,
    MEDIASOUP_LAN_ANNOUNCED_IP: net.lan,
    MEDIASOUP_PORT: String(MEDIA_PORT),
    MEDIASOUP_WORKERS: '1',
    LOG_LEVEL: env.LOG_LEVEL || 'warn',
    REGISTRATION_ENABLED: 'true',
    ...(existsSync(join(web, 'index.html')) ? { SERVE_WEB: web } : {}),
  });
  (globalThis as { __vlBeforeExit?: () => Promise<void> }).__vlBeforeExit = cleanup;

  emit({ step: 'Ligando o servidor de chat e voz…' });
  serverLoaded = true;
  await import('../../server/src/index');
  // espera responder de verdade (certificado próprio: aqui só checamos se está no ar)
  for (let i = 0; i < 120 && !(await healthy()); i++) await new Promise((r) => setTimeout(r, 500));
  emit({
    state: 'running',
    step: 'Servidor no ar!',
    url,
    localUrl: `https://127.0.0.1:${PORT}`,
    port: PORT,
    mediaPort: MEDIA_PORT,
    fingerprint: tls.fingerprint,
  });
}

function healthy() {
  return new Promise<boolean>((resolve) => {
    const req = httpsRequest({ host: '127.0.0.1', port: PORT, path: '/api/v1/health', rejectUnauthorized: false, timeout: 3000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => req.destroy());
    req.end();
  });
}

let serverLoaded = false;
async function stop() {
  // com o servidor no ar, o desligamento dele chama cleanup() (via __vlBeforeExit) e encerra o processo
  if (serverLoaded) process.emit('SIGTERM');
  else {
    await cleanup();
    process.exit(0);
  }
}
parentPort?.on('message', (e) => {
  if (e.data?.type === 'stop') void stop();
});
if (!parentPort) {
  process.once('SIGINT', () => void stop());
}
process.on('uncaughtException', (e) => emit({ state: 'error', message: e.message }));

main().catch(async (e: Error) => {
  emit({ state: 'error', message: e.message });
  await cleanup();
  process.exit(1);
});
