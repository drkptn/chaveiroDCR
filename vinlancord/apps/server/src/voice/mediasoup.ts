/**
 * Workers do mediasoup (SFU). Cada worker é um processo C++ que roteia mídia
 * WebRTC; um WebRtcServer por worker concentra tudo em uma única porta UDP/TCP,
 * o que simplifica firewall/Docker (abra MEDIASOUP_PORT..+N-1 em UDP e TCP).
 */
import { networkInterfaces } from 'node:os';
import { createHmac } from 'node:crypto';
import * as mediasoup from 'mediasoup';
import type { types } from 'mediasoup';
import type { IceServerConfig } from '@vinlancord/shared';
import { config } from '../config';

export const mediaCodecs: types.RouterRtpCodecCapability[] = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90000, parameters: { 'x-google-start-bitrate': 1000 } },
  { kind: 'video', mimeType: 'video/VP9', clockRate: 90000, parameters: { 'profile-id': 0, 'x-google-start-bitrate': 1000 } },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: { 'packetization-mode': 1, 'profile-level-id': '42e01f', 'level-asymmetry-allowed': 1, 'x-google-start-bitrate': 1000 },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: { 'packetization-mode': 1, 'profile-level-id': '4d0032', 'level-asymmetry-allowed': 1, 'x-google-start-bitrate': 1000 },
  },
];

interface WorkerEntry {
  worker: types.Worker;
  server: types.WebRtcServer;
  routers: number;
  index: number;
}

const workers: WorkerEntry[] = [];
let onWorkerDied: (index: number) => void = () => {};
export function setWorkerDiedHandler(fn: (index: number) => void) {
  onWorkerDied = fn;
}

export function detectAnnouncedAddress(): string {
  if (config.MEDIASOUP_ANNOUNCED_IP) return config.MEDIASOUP_ANNOUNCED_IP;
  if (config.MEDIASOUP_LISTEN_IP !== '0.0.0.0' && config.MEDIASOUP_LISTEN_IP !== '::') return config.MEDIASOUP_LISTEN_IP;
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) if (ni.family === 'IPv4' && !ni.internal) return ni.address;
  }
  return '127.0.0.1';
}

async function spawnWorker(index: number): Promise<WorkerEntry> {
  const worker = await mediasoup.createWorker({ logLevel: config.MEDIASOUP_LOG_LEVEL, appData: { index } });
  const announcedAddress = detectAnnouncedAddress();
  const port = config.MEDIASOUP_PORT + index;
  const server = await worker.createWebRtcServer({
    listenInfos: [
      { protocol: 'udp', ip: config.MEDIASOUP_LISTEN_IP, announcedAddress, port },
      { protocol: 'tcp', ip: config.MEDIASOUP_LISTEN_IP, announcedAddress, port },
    ],
  });
  const entry: WorkerEntry = { worker, server, routers: 0, index };
  worker.on('died', (err) => {
    console.error(`[voice] worker ${index} morreu: ${err?.message}. Recriando em 2s…`);
    onWorkerDied(index);
    setTimeout(() => {
      spawnWorker(index)
        .then((e) => (workers[index] = e))
        .catch((e) => console.error('[voice] falha ao recriar worker', e));
    }, 2000);
  });
  return entry;
}

export async function initWorkers() {
  for (let i = 0; i < config.MEDIASOUP_WORKERS; i++) workers[i] = await spawnWorker(i);
  console.info(
    `🎙️  Voz: ${workers.length} worker(s) mediasoup em ${detectAnnouncedAddress()}:${config.MEDIASOUP_PORT}-${config.MEDIASOUP_PORT + workers.length - 1} (UDP/TCP)`,
  );
}

/** Escolhe o worker com menos salas. */
export async function createRouter() {
  const entry = [...workers].filter(Boolean).sort((a, b) => a.routers - b.routers)[0];
  if (!entry) throw new Error('Nenhum worker de mídia disponível');
  const router = await entry.worker.createRouter({ mediaCodecs, appData: { workerIndex: entry.index } });
  entry.routers++;
  router.on('workerclose', () => {});
  router.observer.on('close', () => entry.routers--);
  return { router, webRtcServer: entry.server, workerIndex: entry.index };
}

export function workerCount() {
  return workers.filter((w) => w && !w.worker.closed).length;
}

export async function closeWorkers() {
  for (const w of workers) w?.worker.close();
}

/** Credenciais temporárias de TURN (REST API do coturn: use-auth-secret). */
export function iceServersFor(userId: string): IceServerConfig[] {
  const out: IceServerConfig[] = config.STUN_URLS.map((urls) => ({ urls }));
  if (config.TURN_URLS.length && config.TURN_SECRET) {
    const username = `${Math.floor(Date.now() / 1000) + config.TURN_TTL}:${userId}`;
    const credential = createHmac('sha1', config.TURN_SECRET).update(username).digest('base64');
    out.push({ urls: config.TURN_URLS, username, credential });
  }
  return out;
}
