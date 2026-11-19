/**
 * Modo anfitrião no app: liga/desliga o servidor completo (resources/host/runtime.mjs)
 * num utilityProcess, guarda os certificados confiáveis (pinning) e faz o próprio
 * anfitrião acessar o servidor pelo endereço local (sem depender do roteador).
 */
import { app, session, utilityProcess, type UtilityProcess } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

function logTail(file: string, lines = 25) {
  try {
    return readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '';
  }
}
import { join } from 'node:path';

export interface HostStatus {
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  step?: string;
  message?: string;
  url?: string;
  localUrl?: string;
  publicIp?: string | null;
  lanIp?: string;
  port?: number;
  mediaPort?: number;
  upnp?: 'ok' | 'failed' | 'cgnat' | 'off';
  upnpError?: string;
  fingerprint?: string;
  network?: string;
  invite?: string;
  /** últimas linhas do log quando dá erro */
  details?: string;
}

/* ───────────── certificados confiáveis (servidores só com IP) ───────────── */

const pinsFile = () => join(app.getPath('userData'), 'servidores-confiaveis.json');
let pins: Record<string, string> = {};

export function loadPins(builtin: Record<string, string>) {
  try {
    pins = { ...JSON.parse(readFileSync(pinsFile(), 'utf8')), ...builtin };
  } catch {
    pins = { ...builtin };
  }
  return pins;
}
export const currentPins = () => pins;

/** Confia no certificado (impressão SHA-256) de um servidor. O usuário confirma antes no app. */
export function trustServer(url: string, fingerprint: string) {
  const host = new URL(url).hostname.toLowerCase();
  const fp = fingerprint.replace(/[^0-9a-f]/gi, '').toLowerCase();
  if (fp.length !== 64) throw new Error('Impressão digital inválida.');
  pins[host] = fp;
  mkdirSync(app.getPath('userData'), { recursive: true });
  const saved = (() => {
    try {
      return JSON.parse(readFileSync(pinsFile(), 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  })();
  writeFileSync(pinsFile(), JSON.stringify({ ...saved, [host]: fp }, null, 2));
}

/* ───────────── servidor do anfitrião ───────────── */

let proc: UtilityProcess | null = null;
let status: HostStatus = { state: 'stopped' };
let listener: (s: HostStatus) => void = () => {};
let redirectInstalled = '';

export const hostAvailable = () => existsSync(runtimePath());
const runtimePath = () => (app.isPackaged ? join(process.resourcesPath, 'host', 'dist', 'runtime.mjs') : join(__dirname, '..', '..', 'host', 'dist', 'runtime.mjs'));

export function onHostStatus(fn: (s: HostStatus) => void) {
  listener = fn;
}
export const hostStatus = () => status;

function set(s: HostStatus) {
  status = s;
  if (s.state === 'running' && s.url && s.fingerprint) {
    const u = new URL(s.url);
    trustServer(s.url, s.fingerprint);
    trustServer(s.localUrl ?? `https://127.0.0.1:${s.port}`, s.fingerprint);
    status.invite = `vinlancord://servidor?url=${encodeURIComponent(s.url)}&pin=${s.fingerprint}`;
    // o próprio anfitrião fala com o servidor pelo endereço local (o roteador pode não fazer "loopback")
    if (u.hostname !== '127.0.0.1' && redirectInstalled !== s.url) {
      redirectInstalled = s.url;
      const from = `${u.protocol}//${u.host}`;
      session.defaultSession.webRequest.onBeforeRequest({ urls: [`https://${u.host}/*`, `wss://${u.host}/*`] }, (d, cb) => {
        if (status.state !== 'running') return cb({});
        const scheme = d.url.startsWith('wss:') ? 'wss:' : 'https:';
        cb({ redirectURL: d.url.replace(from.replace('https:', scheme), `${scheme}//127.0.0.1:${s.port}`) });
      });
    }
  }
  listener(status);
}

export function startHost(opts: { network?: string; upnp?: boolean } = {}) {
  if (proc) return status;
  if (!hostAvailable()) {
    set({ state: 'error', message: 'Esta versão do app não inclui o modo anfitrião.' });
    return status;
  }
  set({ state: 'starting', step: 'Preparando…' });
  const data = join(app.getPath('userData'), 'anfitriao');
  mkdirSync(data, { recursive: true });
  proc = utilityProcess.fork(runtimePath(), [], {
    serviceName: 'Vinlancord Servidor',
    stdio: 'pipe',
    env: {
      ...process.env,
      VL_DATA_DIR: data,
      VL_NETWORK: opts.network ?? 'internet',
      VL_UPNP: opts.upnp === false ? '0' : '1',
    },
  });
  const logFile = join(data, 'anfitriao.log');
  try {
    writeFileSync(logFile, `\n===== ${new Date().toISOString()} · Vinlancord ${app.getVersion()} =====\n`, { flag: 'a' });
  } catch {
    /* sem log */
  }
  const log = (b: Buffer) => {
    try {
      writeFileSync(logFile, b, { flag: 'a' });
    } catch {
      /* sem log */
    }
  };
  proc.stdout?.on('data', log);
  proc.stderr?.on('data', log);
  proc.on('message', (m: { type?: string; status?: HostStatus }) => {
    if (m?.type === 'status' && m.status) set({ ...status, ...m.status });
  });
  proc.on('exit', (code) => {
    proc = null;
    if (status.state === 'error') return set({ ...status, details: logTail(logFile) });
    if (code === 0 || status.state === 'stopping') return set({ state: 'stopped' });
    set({ state: 'error', message: `O servidor parou inesperadamente (código ${code}).`, details: logTail(logFile) });
  });
  return status;
}

export function stopHost(): Promise<void> {
  if (!proc) return Promise.resolve();
  const p = proc;
  set({ ...status, state: 'stopping', step: 'Desligando…' });
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      p.kill();
      resolve();
    }, 20_000);
    p.once('exit', () => {
      clearTimeout(t);
      resolve();
    });
    p.postMessage({ type: 'stop' });
  });
}
