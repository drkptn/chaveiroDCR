/**
 * Cliente do gateway: reconexão automática com backoff, heartbeat e RPC.
 * Ao reconectar, o servidor envia um novo READY e o estado é ressincronizado.
 */
import { GatewayCloseCode, GatewayOp, type GatewayEventName, type RpcMethod, type RpcMethods } from '@vinlancord/shared';
import { ApiError } from './api';

export type GatewayStatus = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'offline';

type DispatchHandler = (t: GatewayEventName, d: unknown) => void;

export class Gateway {
  private ws: WebSocket | null = null;
  private url = '';
  private token = '';
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private ackReceived = true;
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private rid = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  private stopped = true;
  status: GatewayStatus = 'idle';
  latency = 0;
  private lastBeatAt = 0;
  private onDispatch: DispatchHandler = () => {};
  private onStatus: (s: GatewayStatus, info?: { code?: number; reason?: string }) => void = () => {};

  setHandlers(onDispatch: DispatchHandler, onStatus: (s: GatewayStatus, info?: { code?: number; reason?: string }) => void) {
    this.onDispatch = onDispatch;
    this.onStatus = onStatus;
  }

  connect(url: string, token: string) {
    this.url = url;
    this.token = token;
    this.stopped = false;
    this.retries = 0;
    this.open();
    window.addEventListener('online', this.handleOnline);
  }

  private handleOnline = () => {
    if (this.status !== 'ready' && !this.stopped) {
      this.retries = 0;
      this.scheduleReconnect(200);
    }
  };

  private setStatus(s: GatewayStatus, info?: { code?: number; reason?: string }) {
    this.status = s;
    this.onStatus(s, info);
  }

  private open() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.cleanupSocket();
    this.setStatus(this.retries === 0 && this.status !== 'reconnecting' ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onmessage = (ev) => this.handle(ev.data as string);
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.stopHeartbeat();
      this.failPending();
      if (this.stopped) return;
      if (ev.code === GatewayCloseCode.AUTH_FAILED || ev.code === GatewayCloseCode.SESSION_REVOKED) {
        this.stopped = true;
        this.setStatus('offline', { code: ev.code, reason: ev.reason });
        return;
      }
      this.setStatus('reconnecting', { code: ev.code });
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose cuida da reconexão */
    };
  }

  private scheduleReconnect(delay?: number) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const base = [500, 1000, 2000, 4000, 8000, 15000, 30000][Math.min(this.retries, 6)]!;
    const wait = delay ?? base + Math.random() * 600;
    this.retries++;
    this.reconnectTimer = setTimeout(() => this.open(), wait);
  }

  private handle(raw: string) {
    let msg: { op: number; t?: GatewayEventName; d?: any; id?: number; ok?: boolean; error?: { code: string; message: string; fields?: Record<string, string> } };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.op) {
      case GatewayOp.HELLO:
        this.startHeartbeat(msg.d.heartbeatInterval);
        this.send({ op: GatewayOp.IDENTIFY, d: { token: this.token, client: { platform: navigator.platform, version: '1.0.0' } } });
        break;
      case GatewayOp.HEARTBEAT_ACK:
        this.ackReceived = true;
        this.latency = Date.now() - this.lastBeatAt;
        break;
      case GatewayOp.DISPATCH:
        if (msg.t === 'READY') {
          this.retries = 0;
          this.setStatus('ready');
        }
        try {
          this.onDispatch(msg.t!, msg.d);
        } catch (e) {
          console.error('[gateway] erro ao processar', msg.t, e);
        }
        break;
      case GatewayOp.RESPONSE: {
        const p = this.pending.get(msg.id!);
        if (!p) return;
        this.pending.delete(msg.id!);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.d);
        else p.reject(new ApiError(400, msg.error?.code ?? 'ERROR', msg.error?.message ?? 'Erro', msg.error?.fields));
        break;
      }
      case GatewayOp.INVALID_SESSION:
        break;
    }
  }

  private startHeartbeat(interval: number) {
    this.stopHeartbeat();
    this.ackReceived = true;
    const beat = () => {
      if (!this.ackReceived) {
        // conexão "zumbi": força reconexão
        this.ws?.close(4000, 'heartbeat perdido');
        return;
      }
      this.ackReceived = false;
      this.lastBeatAt = Date.now();
      this.send({ op: GatewayOp.HEARTBEAT, d: null });
    };
    setTimeout(beat, 1000);
    this.heartbeatTimer = setInterval(beat, interval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private failPending() {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new ApiError(0, 'DISCONNECTED', 'Conexão perdida.'));
    }
    this.pending.clear();
  }

  private cleanupSocket() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
  }

  private send(payload: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
  }

  rpc<M extends RpcMethod>(method: M, data: RpcMethods[M]['req'], timeoutMs = 15000): Promise<RpcMethods[M]['res']> {
    return new Promise((resolve, reject) => {
      if (this.status !== 'ready' || this.ws?.readyState !== WebSocket.OPEN) {
        reject(new ApiError(0, 'DISCONNECTED', 'Sem conexão com o servidor.'));
        return;
      }
      const id = ++this.rid;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ApiError(0, 'TIMEOUT', 'O servidor demorou para responder.'));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send({ op: GatewayOp.REQUEST, id, m: method, d: data });
    });
  }

  /** Força uma reconexão imediata (ex.: botão "Reconectar"). */
  reconnectNow() {
    if (this.stopped) return;
    this.retries = 0;
    this.open();
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.failPending();
    this.cleanupSocket();
    window.removeEventListener('online', this.handleOnline);
    this.setStatus('idle');
  }
}

export const gateway = new Gateway();
