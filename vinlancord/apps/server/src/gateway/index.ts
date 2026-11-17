/**
 * Gateway WebSocket: eventos em tempo real, RPC e sinalização WebRTC.
 * Protocolo: HELLO → IDENTIFY → READY; heartbeat periódico; REQUEST/RESPONSE.
 */
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { GatewayCloseCode, GatewayOp } from '@vinlancord/shared';
import { authenticateToken } from '../lib/auth';
import { ApiError } from '../lib/errors';
import { TokenBucket } from '../lib/ratelimit';
import { onDispatch, type DispatchEnvelope } from '../services/bus';
import { connectPresence, disconnectPresence } from '../services/presence';
import { onConnectionClosed } from '../voice/service';
import { buildReady } from './ready';
import { runRpc } from './rpc';
import { gauges } from '../routes/misc';

const HEARTBEAT_MS = 30_000;
const IDENTIFY_TIMEOUT_MS = 15_000;

interface Conn {
  id: string;
  ws: WebSocket;
  userId: string | null;
  sessionId: string | null;
  seq: number;
  lastBeat: number;
  bucket: TokenBucket;
  ready: boolean;
  /** eventos que chegaram antes do READY terminar */
  pending: string[];
}

const byUser = new Map<string, Set<Conn>>();

function send(conn: Conn, payload: object) {
  if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(payload));
}

function deliver(env: DispatchEnvelope) {
  let raw: string | null = null;
  for (const uid of env.u) {
    const set = byUser.get(uid);
    if (!set) continue;
    for (const conn of set) {
      if (env.s && conn.sessionId !== env.s) continue;
      if (env.c && conn.id !== env.c) continue;
      if (env.x && conn.sessionId === env.x) continue;
      conn.seq++;
      raw ??= JSON.stringify(env.d);
      const frame = `{"op":${GatewayOp.DISPATCH},"t":"${env.t}","s":${conn.seq},"d":${raw}}`;
      if (!conn.ready) conn.pending.push(frame);
      else if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(frame);
      if (env.t === 'SESSION_REVOKED') setTimeout(() => conn.ws.close(GatewayCloseCode.SESSION_REVOKED, 'Sessão encerrada'), 50);
    }
  }
}

export function connectedUserCount() {
  return byUser.size;
}

export async function registerGateway(app: FastifyInstance) {
  onDispatch(deliver);

  // varredura de conexões sem heartbeat
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const set of byUser.values())
      for (const c of set) if (now - c.lastBeat > HEARTBEAT_MS * 2.2) c.ws.close(GatewayCloseCode.SESSION_TIMEOUT, 'Sem heartbeat');
  }, 10_000);
  sweeper.unref();
  app.addHook('onClose', async () => clearInterval(sweeper));

  app.get('/gateway', { websocket: true }, (socket, req) => {
    const conn: Conn = {
      id: randomUUID(),
      ws: socket,
      userId: null,
      sessionId: null,
      seq: 0,
      lastBeat: Date.now(),
      bucket: new TokenBucket(120, 4),
      ready: false,
      pending: [],
    };
    gauges.sockets.inc();
    send(conn, { op: GatewayOp.HELLO, d: { heartbeatInterval: HEARTBEAT_MS } });
    const identifyTimer = setTimeout(() => {
      if (!conn.userId) socket.close(GatewayCloseCode.NOT_AUTHENTICATED, 'Identifique-se');
    }, IDENTIFY_TIMEOUT_MS);

    socket.on('message', async (raw: Buffer) => {
      if (!conn.bucket.take()) {
        socket.close(GatewayCloseCode.RATE_LIMITED, 'Muitas mensagens');
        return;
      }
      let msg: { op: number; d?: unknown; id?: number; m?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        socket.close(GatewayCloseCode.UNKNOWN, 'JSON inválido');
        return;
      }

      if (msg.op === GatewayOp.HEARTBEAT) {
        conn.lastBeat = Date.now();
        send(conn, { op: GatewayOp.HEARTBEAT_ACK, d: null });
        return;
      }

      if (msg.op === GatewayOp.IDENTIFY) {
        if (conn.userId) {
          socket.close(GatewayCloseCode.ALREADY_AUTHENTICATED, 'Já autenticado');
          return;
        }
        const d = (msg.d ?? {}) as { token?: string };
        const auth = await authenticateToken(d.token, req.ip);
        if (!auth) {
          send(conn, { op: GatewayOp.INVALID_SESSION, d: { reason: 'Token inválido ou expirado' } });
          socket.close(GatewayCloseCode.AUTH_FAILED, 'Falha na autenticação');
          return;
        }
        clearTimeout(identifyTimer);
        conn.userId = auth.userId;
        conn.sessionId = auth.sessionId;
        let set = byUser.get(auth.userId);
        if (!set) byUser.set(auth.userId, (set = new Set()));
        set.add(conn);
        try {
          const ready = await buildReady(auth.userId, auth.sessionId);
          conn.seq++;
          send(conn, { op: GatewayOp.DISPATCH, t: 'READY', s: conn.seq, d: ready });
          conn.ready = true;
          for (const f of conn.pending) socket.send(f);
          conn.pending = [];
          await connectPresence(auth.userId, conn.id);
        } catch (e) {
          app.log.error(e, 'falha ao montar READY');
          socket.close(GatewayCloseCode.UNKNOWN, 'Erro interno');
        }
        return;
      }

      if (msg.op === GatewayOp.REQUEST) {
        const id = typeof msg.id === 'number' ? msg.id : -1;
        if (!conn.userId || !conn.sessionId || !conn.ready) {
          send(conn, { op: GatewayOp.RESPONSE, id, ok: false, error: { code: 'NOT_READY', message: 'Conexão ainda não está pronta.' } });
          return;
        }
        try {
          const data = await runRpc({ userId: conn.userId, sessionId: conn.sessionId, connId: conn.id }, String(msg.m), msg.d);
          send(conn, { op: GatewayOp.RESPONSE, id, ok: true, d: data });
        } catch (e) {
          const err = e instanceof ApiError ? e : null;
          if (!err) app.log.error(e, `erro em RPC ${msg.m}`);
          send(conn, {
            op: GatewayOp.RESPONSE,
            id,
            ok: false,
            error: { code: err?.code ?? 'INTERNAL', message: err?.message ?? 'Algo deu errado. Tente novamente.', fields: err?.fields },
          });
        }
      }
    });

    socket.on('close', () => {
      clearTimeout(identifyTimer);
      gauges.sockets.dec();
      if (conn.userId) {
        const set = byUser.get(conn.userId);
        set?.delete(conn);
        if (set && set.size === 0) byUser.delete(conn.userId);
        void disconnectPresence(conn.userId, conn.id);
        onConnectionClosed(conn.userId, conn.id);
      }
    });
    socket.on('error', () => socket.close());
  });
}

export function closeAllConnections() {
  for (const set of byUser.values()) for (const c of set) c.ws.close(GatewayCloseCode.SERVER_RESTART, 'Servidor reiniciando');
}
