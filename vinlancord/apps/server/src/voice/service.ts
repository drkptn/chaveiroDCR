/**
 * Serviço de voz/vídeo/tela do Além-Mar.
 *
 * Arquitetura SFU: cada participante envia sua mídia uma única vez ao servidor,
 * que a encaminha aos demais. Isso mantém o uso de CPU/banda do cliente baixo
 * mesmo com muitos participantes (ótimo para PCs intermediários) e permite
 * qualidade adaptativa por espectador (simulcast/SVC + escolha de camadas).
 */
import type { types } from 'mediasoup';
import {
  P,
  has,
  isTimedOut,
  type ActiveCall,
  type GatewayEventName,
  type GatewayEvents,
  type ProducerInfo,
  type SourceType,
  type VoiceState,
} from '@vinlancord/shared';
import { config } from '../config';
import { prisma } from '../lib/db';
import { ApiError, badRequest, forbidden, notFound } from '../lib/errors';
import { bus } from '../services/bus';
import { channelPermissions, getGuild } from '../services/perms';
import { voiceHooks } from '../services/voiceHooks';
import { isBlockedEitherWay } from '../services/users';
import { createSystemMessage } from '../services/systemMessages';
import { loadMessage } from '../services/messages';
import { createRouter, iceServersFor, initWorkers, setWorkerDiedHandler, workerCount } from './mediasoup';

interface Peer {
  userId: string;
  /** conexão do gateway dona desta sessão de voz */
  connId: string;
  voiceSessionId: string;
  state: VoiceState;
  transports: Map<string, types.WebRtcTransport>;
  producers: Map<string, types.Producer>;
  consumers: Map<string, types.Consumer>;
  graceTimer: NodeJS.Timeout | null;
  rtt: number;
  loss: number;
}

interface Room {
  channelId: string;
  guildId: string | null;
  isDM: boolean;
  router: types.Router;
  webRtcServer: types.WebRtcServer;
  workerIndex: number;
  audioObserver: types.AudioLevelObserver;
  peers: Map<string, Peer>;
  lastSpeaking: string;
  closing: boolean;
}

const rooms = new Map<string, Room>();
const roomCreating = new Map<string, Promise<Room>>();
/** userId -> channelId da sala onde está */
const userRoom = new Map<string, string>();
const calls = new Map<string, ActiveCall & { participants: Set<string>; timer: NodeJS.Timeout | null }>();
const RING_MS = 45_000;

export function voiceStatus() {
  let peers = 0;
  for (const r of rooms.values()) peers += r.peers.size;
  return { workers: workerCount(), rooms: rooms.size, peers };
}

/** Quem deve saber do estado de voz: membros do servidor ou participantes da DM. */
async function broadcastVoiceState(room: { guildId: string | null; channelId: string }, payload: VoiceState | { userId: string; channelId: null; guildId: string | null }) {
  if (room.guildId) await bus.toGuild(room.guildId, 'VOICE_STATE_UPDATE', payload);
  else await bus.toChannel(room.channelId, 'VOICE_STATE_UPDATE', payload);
}

function toRoomPeers(room: Room, except?: string) {
  return [...room.peers.values()].filter((p) => p.userId !== except);
}

function sendToPeer<E extends GatewayEventName>(peer: Peer, t: E, d: GatewayEvents[E]) {
  return bus.toConn(peer.userId, peer.connId, t, d);
}

async function getOrCreateRoom(channelId: string, guildId: string | null, isDM: boolean): Promise<Room> {
  const existing = rooms.get(channelId);
  if (existing && !existing.closing) return existing;
  let p = roomCreating.get(channelId);
  if (!p) {
    p = (async () => {
      const { router, webRtcServer, workerIndex } = await createRouter();
      const audioObserver = await router.createAudioLevelObserver({ maxEntries: 32, threshold: -65, interval: 300 });
      const room: Room = { channelId, guildId, isDM, router, webRtcServer, workerIndex, audioObserver, peers: new Map(), lastSpeaking: '', closing: false };
      audioObserver.on('volumes', (volumes) => {
        const speaking: Record<string, number> = {};
        for (const v of volumes) {
          const uid = (v.producer.appData as { userId: string }).userId;
          speaking[uid] = Math.round(v.volume);
        }
        emitSpeaking(room, speaking);
      });
      audioObserver.on('silence', () => emitSpeaking(room, {}));
      rooms.set(channelId, room);
      return room;
    })().finally(() => roomCreating.delete(channelId));
    roomCreating.set(channelId, p);
  }
  return p;
}

function emitSpeaking(room: Room, speaking: Record<string, number>) {
  const key = Object.keys(speaking).sort().join(',');
  if (key === room.lastSpeaking) return;
  room.lastSpeaking = key;
  for (const peer of room.peers.values()) void sendToPeer(peer, 'VOICE_SPEAKING', { channelId: room.channelId, speaking });
}

function closeRoomIfEmpty(room: Room) {
  if (room.peers.size > 0 || room.closing) return;
  room.closing = true;
  rooms.delete(room.channelId);
  room.router.close();
  if (room.isDM) void endCall(room.channelId);
}

/* ────────────────────────────── Permissões ────────────────────────────── */

interface Access {
  perms: bigint;
  guildId: string | null;
  isDM: boolean;
  type: string;
  recipients: string[];
  member?: { mute: boolean; deaf: boolean; timeoutUntil: Date | null };
}

async function accessFor(channelId: string, userId: string): Promise<Access> {
  const r = await channelPermissions(channelId, userId);
  if (!r || !has(r.perms, P.VIEW_CHANNEL)) throw notFound('Canal');
  const isDM = r.meta.type === 'DM' || r.meta.type === 'GROUP_DM';
  if (!isDM && r.meta.type !== 'VOICE' && r.meta.type !== 'VIDEO') throw badRequest('Este canal não é de voz.');
  let member: Access['member'];
  if (r.meta.guildId) {
    const m = await prisma.member.findUnique({ where: { guildId_userId: { guildId: r.meta.guildId, userId } } });
    if (m) member = { mute: m.mute, deaf: m.deaf, timeoutUntil: m.timeoutUntil };
  }
  return { perms: r.perms, guildId: r.meta.guildId, isDM, type: r.meta.type, recipients: r.meta.recipients, member };
}

/* ────────────────────────────── Entrar / sair ────────────────────────────── */

export async function join(
  userId: string,
  connId: string,
  req: { channelId: string; selfMute: boolean; selfDeaf: boolean; voiceSessionId: string },
) {
  const access = await accessFor(req.channelId, userId);
  if (!has(access.perms, P.CONNECT)) throw forbidden('Você não tem permissão para entrar neste canal.');
  if (access.member && isTimedOut(access.member.timeoutUntil)) throw forbidden('Você está de castigo e não pode entrar em canais de voz.', 'TIMED_OUT');
  if (access.isDM && access.type === 'DM') {
    const other = access.recipients.find((r) => r !== userId);
    if (other && (await isBlockedEitherWay(userId, other))) throw forbidden('Não é possível ligar para esse usuário.', 'CALL_BLOCKED');
  }
  if (!access.isDM) {
    const ch = await prisma.channel.findUnique({ where: { id: req.channelId }, select: { userLimit: true } });
    const room = rooms.get(req.channelId);
    const count = room ? [...room.peers.keys()].filter((u) => u !== userId).length : 0;
    if (ch?.userLimit && count >= ch.userLimit && !has(access.perms, P.MOVE_MEMBERS))
      throw new ApiError(403, 'CHANNEL_FULL', 'Este canal está cheio.');
  }

  // um usuário por vez em uma única sala
  const current = userRoom.get(userId);
  if (current) {
    const r = rooms.get(current);
    const p = r?.peers.get(userId);
    if (p) {
      if (current !== req.channelId || p.voiceSessionId !== req.voiceSessionId) {
        if (p.connId !== connId) await sendToPeer(p, 'VOICE_DISCONNECTED', { channelId: current, reason: 'replaced' });
        await leave(userId, { silent: current === req.channelId });
      } else {
        // reconexão da mesma sessão de voz: descarta transportes antigos
        await leave(userId, { silent: true });
      }
    }
  }

  const room = await getOrCreateRoom(req.channelId, access.guildId, access.isDM);
  const state: VoiceState = {
    userId,
    channelId: req.channelId,
    guildId: access.guildId,
    selfMute: req.selfMute,
    selfDeaf: req.selfDeaf,
    serverMute: access.member?.mute ?? false,
    serverDeaf: access.member?.deaf ?? false,
    selfVideo: false,
    selfStream: false,
    joinedAt: new Date().toISOString(),
  };
  const peer: Peer = {
    userId,
    connId,
    voiceSessionId: req.voiceSessionId,
    state,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    graceTimer: null,
    rtt: 0,
    loss: 0,
  };
  room.peers.set(userId, peer);
  userRoom.set(userId, req.channelId);
  await broadcastVoiceState(room, state);

  if (room.isDM) await onDMJoin(room, userId);

  const producers: ProducerInfo[] = [];
  for (const other of toRoomPeers(room, userId)) {
    for (const pr of other.producers.values()) {
      const ad = pr.appData as { userId: string; source: SourceType };
      producers.push({ producerId: pr.id, userId: ad.userId, kind: pr.kind, source: ad.source, paused: pr.paused });
    }
  }
  return {
    channelId: req.channelId,
    routerRtpCapabilities: room.router.rtpCapabilities,
    iceServers: iceServersFor(userId),
    producers,
    voiceStates: [...room.peers.values()].map((p) => p.state),
  };
}

export async function leave(userId: string, opts: { silent?: boolean } = {}) {
  const channelId = userRoom.get(userId);
  if (!channelId) return;
  const room = rooms.get(channelId);
  userRoom.delete(userId);
  if (!room) return;
  const peer = room.peers.get(userId);
  if (!peer) return;
  if (peer.graceTimer) clearTimeout(peer.graceTimer);
  room.peers.delete(userId);
  for (const pr of peer.producers.values()) {
    const ad = pr.appData as { source: SourceType };
    for (const other of room.peers.values())
      void sendToPeer(other, 'VOICE_PRODUCER_CLOSED', { channelId, producerId: pr.id, userId, source: ad.source });
  }
  for (const t of peer.transports.values()) t.close();
  if (!opts.silent) await broadcastVoiceState(room, { userId, channelId: null, guildId: room.guildId });
  closeRoomIfEmpty(room);
}

/** Chamado quando o WebSocket cai: mantém a mídia por alguns segundos esperando reconexão. */
export function onConnectionClosed(userId: string, connId: string) {
  const channelId = userRoom.get(userId);
  const peer = channelId ? rooms.get(channelId)?.peers.get(userId) : null;
  if (!peer || peer.connId !== connId) return;
  if (peer.graceTimer) clearTimeout(peer.graceTimer);
  peer.graceTimer = setTimeout(() => {
    peer.graceTimer = null;
    void leave(userId);
  }, config.VOICE_RECONNECT_GRACE_MS);
}

/** Reassocia a sessão de voz a uma nova conexão do gateway (reconexão transparente). */
export function resume(userId: string, connId: string, voiceSessionId: string) {
  const channelId = userRoom.get(userId);
  const peer = channelId ? rooms.get(channelId)?.peers.get(userId) : null;
  if (!peer || peer.voiceSessionId !== voiceSessionId) return { ok: false };
  if (peer.graceTimer) clearTimeout(peer.graceTimer);
  peer.graceTimer = null;
  peer.connId = connId;
  return { ok: true };
}

function requirePeer(userId: string): { room: Room; peer: Peer } {
  const channelId = userRoom.get(userId);
  const room = channelId ? rooms.get(channelId) : undefined;
  const peer = room?.peers.get(userId);
  if (!room || !peer) throw new ApiError(400, 'NOT_IN_VOICE', 'Você não está em um canal de voz.');
  return { room, peer };
}

/* ────────────────────────────── Transportes ────────────────────────────── */

export async function createTransport(userId: string, direction: 'send' | 'recv') {
  const { room, peer } = requirePeer(userId);
  if (peer.transports.size >= 4) {
    // evita vazamento: fecha o transporte mais antigo da mesma direção
    for (const [id, t] of peer.transports)
      if ((t.appData as { direction: string }).direction === direction) {
        t.close();
        peer.transports.delete(id);
        break;
      }
  }
  const transport = await room.router.createWebRtcTransport({
    webRtcServer: room.webRtcServer,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000,
    appData: { userId, direction },
  });
  if (direction === 'send') await transport.setMaxIncomingBitrate(config.VOICE_MAX_INCOMING_BITRATE).catch(() => {});
  transport.on('dtlsstatechange', (s) => {
    if (s === 'failed' || s === 'closed') transport.close();
  });
  transport.observer.on('close', () => peer.transports.delete(transport.id));
  peer.transports.set(transport.id, transport);
  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
    iceServers: iceServersFor(userId),
  };
}

function getTransport(peer: Peer, id: string) {
  const t = peer.transports.get(id);
  if (!t) throw new ApiError(404, 'UNKNOWN_TRANSPORT', 'Transporte não encontrado.');
  return t;
}

export async function connectTransport(userId: string, transportId: string, dtlsParameters: unknown) {
  const { peer } = requirePeer(userId);
  await getTransport(peer, transportId).connect({ dtlsParameters: dtlsParameters as types.DtlsParameters });
  return { ok: true as const };
}

export async function restartIce(userId: string, transportId: string) {
  const { peer } = requirePeer(userId);
  const iceParameters = await getTransport(peer, transportId).restartIce();
  return { iceParameters };
}

/* ────────────────────────────── Produção ────────────────────────────── */

const SOURCE_PERM: Record<SourceType, bigint> = { mic: P.SPEAK, camera: P.VIDEO, screen: P.STREAM, 'screen-audio': P.STREAM };

export async function produce(
  userId: string,
  req: { transportId: string; kind: 'audio' | 'video'; rtpParameters: unknown; source: SourceType; paused?: boolean },
) {
  const { room, peer } = requirePeer(userId);
  const expectedKind = req.source === 'mic' || req.source === 'screen-audio' ? 'audio' : 'video';
  if (req.kind !== expectedKind) throw badRequest('Tipo de mídia inconsistente.');
  const access = await accessFor(room.channelId, userId);
  if (!has(access.perms, SOURCE_PERM[req.source])) throw forbidden('Você não tem permissão para transmitir isso aqui.');

  // apenas um produtor por fonte
  for (const pr of peer.producers.values()) if ((pr.appData as { source: string }).source === req.source) await closeProducer(userId, pr.id);

  const transport = getTransport(peer, req.transportId);
  const forcedPause = req.source === 'mic' && (peer.state.serverMute || peer.state.selfMute);
  const producer = await transport.produce({
    kind: req.kind,
    rtpParameters: req.rtpParameters as types.RtpParameters,
    paused: req.paused || forcedPause,
    appData: { userId, source: req.source },
  });
  peer.producers.set(producer.id, producer);
  producer.observer.on('close', () => peer.producers.delete(producer.id));
  if (req.source === 'mic') await room.audioObserver.addProducer({ producerId: producer.id }).catch(() => {});

  if (req.source === 'camera' || req.source === 'screen') {
    if (req.source === 'camera') peer.state.selfVideo = true;
    else peer.state.selfStream = true;
    await broadcastVoiceState(room, peer.state);
  }
  for (const other of toRoomPeers(room, userId))
    void sendToPeer(other, 'VOICE_PRODUCER_NEW', {
      channelId: room.channelId,
      producerId: producer.id,
      userId,
      kind: producer.kind,
      source: req.source,
      paused: producer.paused,
    });
  return { producerId: producer.id };
}

export async function closeProducer(userId: string, producerId: string) {
  const { room, peer } = requirePeer(userId);
  const pr = peer.producers.get(producerId);
  if (!pr) return { ok: true as const };
  const source = (pr.appData as { source: SourceType }).source;
  pr.close();
  peer.producers.delete(producerId);
  for (const other of toRoomPeers(room, userId))
    void sendToPeer(other, 'VOICE_PRODUCER_CLOSED', { channelId: room.channelId, producerId, userId, source });
  if (source === 'camera' && peer.state.selfVideo) {
    peer.state.selfVideo = false;
    await broadcastVoiceState(room, peer.state);
  }
  if (source === 'screen' && peer.state.selfStream) {
    peer.state.selfStream = false;
    await broadcastVoiceState(room, peer.state);
    // encerra também o áudio da tela
    for (const p of peer.producers.values()) if ((p.appData as { source: string }).source === 'screen-audio') await closeProducer(userId, p.id);
  }
  return { ok: true as const };
}

export async function setProducerPaused(userId: string, producerId: string, paused: boolean) {
  const { room, peer } = requirePeer(userId);
  const pr = peer.producers.get(producerId);
  if (!pr) throw new ApiError(404, 'UNKNOWN_PRODUCER', 'Produtor não encontrado.');
  const source = (pr.appData as { source: SourceType }).source;
  if (!paused && source === 'mic' && peer.state.serverMute) throw forbidden('Você foi silenciado por um moderador.', 'SERVER_MUTED');
  if (paused) await pr.pause();
  else await pr.resume();
  for (const other of toRoomPeers(room, userId))
    void sendToPeer(other, 'VOICE_PRODUCER_PAUSED', { channelId: room.channelId, producerId, userId, paused });
  return { ok: true as const };
}

/* ────────────────────────────── Consumo ────────────────────────────── */

export async function consume(userId: string, producerId: string, rtpCapabilities: unknown) {
  const { room, peer } = requirePeer(userId);
  let producer: types.Producer | undefined;
  for (const other of room.peers.values()) if (other.userId !== userId) producer ??= other.producers.get(producerId);
  if (!producer) throw new ApiError(404, 'UNKNOWN_PRODUCER', 'Essa transmissão já terminou.');
  if (!room.router.canConsume({ producerId, rtpCapabilities: rtpCapabilities as types.RtpCapabilities }))
    throw badRequest('Seu dispositivo não suporta essa mídia.', undefined, 'CANNOT_CONSUME');
  const recv = [...peer.transports.values()].find((t) => (t.appData as { direction: string }).direction === 'recv');
  if (!recv) throw badRequest('Crie um transporte de recebimento primeiro.');
  const ad = producer.appData as { userId: string; source: SourceType };
  // evita consumir duas vezes o mesmo produtor
  for (const c of peer.consumers.values()) if (c.producerId === producerId) c.close();
  const consumer = await recv.consume({
    producerId,
    rtpCapabilities: rtpCapabilities as types.RtpCapabilities,
    paused: true,
    appData: { userId: ad.userId, source: ad.source },
  });
  peer.consumers.set(consumer.id, consumer);
  const notifyClosed = () => {
    peer.consumers.delete(consumer.id);
    void sendToPeer(peer, 'VOICE_CONSUMER_CLOSED', { consumerId: consumer.id });
  };
  consumer.on('producerclose', notifyClosed);
  consumer.on('transportclose', () => peer.consumers.delete(consumer.id));
  // telas têm prioridade de banda sobre câmeras; áudio sempre primeiro
  await consumer.setPriority(ad.source === 'mic' || ad.source === 'screen-audio' ? 255 : ad.source === 'screen' ? 200 : 100).catch(() => {});
  return {
    id: consumer.id,
    producerId,
    userId: ad.userId,
    kind: consumer.kind,
    source: ad.source,
    rtpParameters: consumer.rtpParameters,
    type: consumer.type,
    producerPaused: consumer.producerPaused,
  };
}

function getConsumer(peer: Peer, id: string) {
  const c = peer.consumers.get(id);
  if (!c) throw new ApiError(404, 'UNKNOWN_CONSUMER', 'Consumidor não encontrado.');
  return c;
}

export async function resumeConsumer(userId: string, consumerId: string) {
  const { peer } = requirePeer(userId);
  const c = getConsumer(peer, consumerId);
  if (c.kind === 'audio' && peer.state.serverDeaf) return { ok: true as const };
  await c.resume();
  return { ok: true as const };
}

export async function pauseConsumer(userId: string, consumerId: string) {
  const { peer } = requirePeer(userId);
  await getConsumer(peer, consumerId).pause();
  return { ok: true as const };
}

export async function closeConsumer(userId: string, consumerId: string) {
  const { peer } = requirePeer(userId);
  peer.consumers.get(consumerId)?.close();
  peer.consumers.delete(consumerId);
  return { ok: true as const };
}

export async function setConsumerLayers(userId: string, consumerId: string, spatialLayer: number, temporalLayer?: number) {
  const { peer } = requirePeer(userId);
  const c = getConsumer(peer, consumerId);
  if (c.type === 'simulcast' || c.type === 'svc') await c.setPreferredLayers({ spatialLayer, temporalLayer });
  return { ok: true as const };
}

/* ────────────────────────────── Estado ────────────────────────────── */

export async function updateState(userId: string, patch: { selfMute?: boolean; selfDeaf?: boolean }) {
  const { room, peer } = requirePeer(userId);
  let changed = false;
  if (patch.selfMute !== undefined && patch.selfMute !== peer.state.selfMute) {
    peer.state.selfMute = patch.selfMute;
    changed = true;
  }
  if (patch.selfDeaf !== undefined && patch.selfDeaf !== peer.state.selfDeaf) {
    peer.state.selfDeaf = patch.selfDeaf;
    changed = true;
    // ensurdecido: para de receber áudio (economiza banda)
    for (const c of peer.consumers.values()) if (c.kind === 'audio') await (patch.selfDeaf ? c.pause() : c.resume()).catch(() => {});
  }
  if (changed) await broadcastVoiceState(room, peer.state);
  return { ok: true as const };
}

export function reportStats(userId: string, rtt: number, loss: number) {
  const { room, peer } = requirePeer(userId);
  peer.rtt = Math.max(0, Math.min(9999, Math.round(rtt)));
  peer.loss = Math.max(0, Math.min(100, Math.round(loss * 10) / 10));
  for (const other of toRoomPeers(room, userId))
    void sendToPeer(other, 'VOICE_PEER_STATS', { channelId: room.channelId, userId, rtt: peer.rtt, loss: peer.loss });
  return { ok: true as const };
}

/* ────────────────────────────── Moderação ────────────────────────────── */

async function disconnectPeer(room: Room, peer: Peer, reason: 'kicked' | 'moved' | 'channel_deleted' | 'lost') {
  await sendToPeer(peer, 'VOICE_DISCONNECTED', { channelId: room.channelId, reason });
  await leave(peer.userId);
}

export async function moderate(actorId: string, req: { userId: string; mute?: boolean; deaf?: boolean; disconnect?: boolean; moveTo?: string }) {
  const channelId = userRoom.get(req.userId);
  const room = channelId ? rooms.get(channelId) : undefined;
  const target = room?.peers.get(req.userId);
  if (!room || !target || !room.guildId) throw badRequest('Esse usuário não está em um canal de voz do servidor.');
  const access = await accessFor(room.channelId, actorId);
  const g = await getGuild(room.guildId);
  if (!g) throw notFound('Servidor');
  const { requireHierarchy } = await import('../services/perms');
  if (actorId !== req.userId) requireHierarchy(g, actorId, req.userId);

  if (req.disconnect || req.moveTo) {
    if (!has(access.perms, P.MOVE_MEMBERS)) throw forbidden();
    if (req.moveTo) {
      const dest = await accessFor(req.moveTo, actorId);
      if (dest.guildId !== room.guildId || !has(dest.perms, P.MOVE_MEMBERS)) throw forbidden();
      const targetDest = await accessFor(req.moveTo, req.userId).catch(() => null);
      if (!targetDest || !has(targetDest.perms, P.CONNECT)) throw forbidden('Esse membro não pode entrar no canal de destino.');
      await sendToPeer(target, 'VOICE_MOVED', { from: room.channelId, to: req.moveTo, guildId: room.guildId });
    } else {
      await disconnectPeer(room, target, 'kicked');
    }
  }
  if (req.mute !== undefined || req.deaf !== undefined) {
    if (req.mute !== undefined && !has(access.perms, P.MUTE_MEMBERS)) throw forbidden();
    if (req.deaf !== undefined && !has(access.perms, P.DEAFEN_MEMBERS)) throw forbidden();
    const data: { mute?: boolean; deaf?: boolean } = {};
    if (req.mute !== undefined) data.mute = req.mute;
    if (req.deaf !== undefined) data.deaf = req.deaf;
    const m = await prisma.member.update({ where: { guildId_userId: { guildId: room.guildId, userId: req.userId } }, data });
    const { emitMemberUpdate, audit } = await import('../services/guilds');
    await emitMemberUpdate(room.guildId, req.userId);
    await audit(room.guildId, actorId, 'MEMBER_VOICE_UPDATE', req.userId, data);
    await applyServerVoiceState(room.guildId, req.userId, m.mute, m.deaf);
  }
  return { ok: true as const };
}

async function applyServerVoiceState(guildId: string, userId: string, mute: boolean, deaf: boolean) {
  const channelId = userRoom.get(userId);
  const room = channelId ? rooms.get(channelId) : undefined;
  const peer = room?.peers.get(userId);
  if (!room || !peer || room.guildId !== guildId) return;
  peer.state.serverMute = mute;
  peer.state.serverDeaf = deaf;
  for (const pr of peer.producers.values()) {
    if ((pr.appData as { source: string }).source !== 'mic') continue;
    if (mute && !pr.paused) {
      await pr.pause();
      for (const other of toRoomPeers(room, userId))
        void sendToPeer(other, 'VOICE_PRODUCER_PAUSED', { channelId: room.channelId, producerId: pr.id, userId, paused: true });
    }
  }
  for (const c of peer.consumers.values()) if (c.kind === 'audio') await (deaf ? c.pause() : peer.state.selfDeaf ? Promise.resolve() : c.resume()).catch(() => {});
  await broadcastVoiceState(room, peer.state);
}

async function recheckGuildPermissions(guildId: string) {
  for (const room of rooms.values()) {
    if (room.guildId !== guildId) continue;
    for (const peer of [...room.peers.values()]) {
      const access = await accessFor(room.channelId, peer.userId).catch(() => null);
      if (!access || !has(access.perms, P.CONNECT)) {
        await disconnectPeer(room, peer, 'kicked');
        continue;
      }
      for (const pr of [...peer.producers.values()]) {
        const src = (pr.appData as { source: SourceType }).source;
        if (!has(access.perms, SOURCE_PERM[src])) await closeProducer(peer.userId, pr.id);
      }
    }
  }
}

/* ────────────────────────────── Chamadas privadas ────────────────────────────── */

function publicCall(c: ActiveCall): ActiveCall {
  return { channelId: c.channelId, ringing: c.ringing, startedBy: c.startedBy, startedAt: c.startedAt, messageId: c.messageId };
}

async function onDMJoin(room: Room, userId: string) {
  let call = calls.get(room.channelId);
  if (!call) {
    const meta = await channelPermissions(room.channelId, userId);
    const others = (meta?.meta.recipients ?? []).filter((r) => r !== userId);
    const msg = await createSystemMessage(room.channelId, userId, 'CALL', { callData: { participants: [userId], endedAt: null } });
    call = {
      channelId: room.channelId,
      ringing: others,
      startedBy: userId,
      startedAt: new Date().toISOString(),
      messageId: msg?.id ?? null,
      participants: new Set([userId]),
      timer: null,
    };
    calls.set(room.channelId, call);
    const c = call;
    call.timer = setTimeout(() => {
      c.ringing = [];
      c.timer = null;
      void bus.toChannel(room.channelId, 'CALL_UPDATE', publicCall(c));
    }, RING_MS);
    await bus.toChannel(room.channelId, 'CALL_CREATE', publicCall(call));
    return;
  }
  call.participants.add(userId);
  if (call.ringing.includes(userId)) {
    call.ringing = call.ringing.filter((r) => r !== userId);
    await bus.toChannel(room.channelId, 'CALL_UPDATE', publicCall(call));
  }
  if (call.messageId) {
    await prisma.message
      .update({ where: { id: call.messageId }, data: { callData: { participants: [...call.participants], endedAt: null } } })
      .catch(() => {});
  }
}

async function endCall(channelId: string) {
  const call = calls.get(channelId);
  if (!call) return;
  calls.delete(channelId);
  if (call.timer) clearTimeout(call.timer);
  if (call.messageId) {
    await prisma.message
      .update({ where: { id: call.messageId }, data: { callData: { participants: [...call.participants], endedAt: new Date().toISOString() } } })
      .catch(() => {});
    const dto = await loadMessage(call.messageId, call.startedBy, null);
    if (dto) await bus.toChannel(channelId, 'MESSAGE_UPDATE', dto);
  }
  await bus.toChannel(channelId, 'CALL_DELETE', { channelId });
}

export async function ring(userId: string, channelId: string, userIds?: string[]) {
  const call = calls.get(channelId);
  if (!call) throw badRequest('Não há chamada em andamento.');
  const meta = await channelPermissions(channelId, userId);
  if (!meta || !meta.meta.recipients.includes(userId)) throw notFound('Canal');
  const room = rooms.get(channelId);
  const targets = (userIds ?? meta.meta.recipients).filter((u) => meta.meta.recipients.includes(u) && !room?.peers.has(u));
  call.ringing = [...new Set([...call.ringing, ...targets])];
  if (call.timer) clearTimeout(call.timer);
  call.timer = setTimeout(() => {
    call.ringing = [];
    call.timer = null;
    void bus.toChannel(channelId, 'CALL_UPDATE', publicCall(call));
  }, RING_MS);
  await bus.toChannel(channelId, 'CALL_UPDATE', publicCall(call));
  return { ok: true as const };
}

export async function decline(userId: string, channelId: string) {
  const call = calls.get(channelId);
  if (!call) return { ok: true as const };
  call.ringing = call.ringing.filter((r) => r !== userId);
  await bus.toChannel(channelId, 'CALL_UPDATE', publicCall(call));
  return { ok: true as const };
}

/* ────────────────────────────── Consultas para o READY ────────────────────────────── */

export function voiceStatesForGuilds(guildIds: Set<string>): VoiceState[] {
  const out: VoiceState[] = [];
  for (const room of rooms.values()) if (room.guildId && guildIds.has(room.guildId)) for (const p of room.peers.values()) out.push(p.state);
  return out;
}

export function voiceStatesForChannels(channelIds: Set<string>): VoiceState[] {
  const out: VoiceState[] = [];
  for (const room of rooms.values()) if (!room.guildId && channelIds.has(room.channelId)) for (const p of room.peers.values()) out.push(p.state);
  return out;
}

export function activeCallsFor(channelIds: Set<string>): ActiveCall[] {
  return [...calls.values()].filter((c) => channelIds.has(c.channelId)).map(publicCall);
}

/* ────────────────────────────── Inicialização ────────────────────────────── */

export async function initVoice() {
  setWorkerDiedHandler((index) => {
    for (const room of [...rooms.values()]) {
      if (room.workerIndex !== index) continue;
      for (const peer of [...room.peers.values()]) void disconnectPeer(room, peer, 'lost');
    }
  });
  await initWorkers();

  voiceHooks.onMemberRemoved = async (guildId, userId) => {
    const ch = userRoom.get(userId);
    const room = ch ? rooms.get(ch) : undefined;
    const peer = room?.peers.get(userId);
    if (room && peer && room.guildId === guildId) await disconnectPeer(room, peer, 'kicked');
  };
  voiceHooks.onServerVoiceState = applyServerVoiceState;
  voiceHooks.onChannelDeleted = async (channelId) => {
    const room = rooms.get(channelId);
    if (!room) return;
    for (const peer of [...room.peers.values()]) await disconnectPeer(room, peer, 'channel_deleted');
  };
  voiceHooks.onPermissionsChanged = recheckGuildPermissions;
  voiceHooks.onTimeout = async (guildId, userId) => {
    const ch = userRoom.get(userId);
    const room = ch ? rooms.get(ch) : undefined;
    const peer = room?.peers.get(userId);
    if (room && peer && room.guildId === guildId) await disconnectPeer(room, peer, 'kicked');
  };
}

export const _internal = { rooms, userRoom, calls };
