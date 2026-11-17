import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import { GatewayOp } from '@vinlancord/shared';
import type { FastifyInstance } from 'fastify';

// porta de mídia única por processo de teste
process.env.MEDIASOUP_PORT = String(41000 + (process.pid % 2000));

let app: FastifyInstance | null = null;
let baseUrl = '';
let initialized = false;

export async function startServer() {
  if (app) return baseUrl;
  const { prisma } = await import('../src/lib/db');
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  if (!initialized) {
    const { initBus } = await import('../src/services/bus');
    const { initCacheInvalidation } = await import('../src/services/perms');
    const { initVoice } = await import('../src/voice/service');
    await initBus();
    await initCacheInvalidation();
    await initVoice();
    initialized = true;
  }
  const { buildApp } = await import('../src/app');
  app = await buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  const port = (app.server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  // URLs públicas/assinadas devem apontar para a porta real
  const { config } = await import('../src/config');
  (config as { PUBLIC_URL: string }).PUBLIC_URL = baseUrl;
  return baseUrl;
}

export async function stopServer() {
  await app?.close();
  app = null;
}

export interface Res<T = any> {
  status: number;
  body: T;
}

export function client(token?: string) {
  const call = async <T = any>(method: string, path: string, body?: unknown): Promise<Res<T>> => {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const r = await fetch(baseUrl + '/api/v1' + path, { method, headers, body: payload });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  return {
    get: <T = any>(p: string) => call<T>('GET', p),
    post: <T = any>(p: string, b?: unknown) => call<T>('POST', p, b ?? {}),
    put: <T = any>(p: string, b?: unknown) => call<T>('PUT', p, b ?? {}),
    patch: <T = any>(p: string, b?: unknown) => call<T>('PATCH', p, b ?? {}),
    del: <T = any>(p: string, b?: unknown) => call<T>('DELETE', p, b),
  };
}

let n = 0;
export async function registerUser(name = 'user') {
  n++;
  const username = `${name}${n}${Math.random().toString(36).slice(2, 6)}`.toLowerCase();
  const r = await client().post('/auth/register', { email: `${username}@test.dev`, username, password: 'senha-super-forte-1', displayName: name });
  if (r.status !== 200) throw new Error('register failed: ' + JSON.stringify(r.body));
  return { token: r.body.token as string, user: r.body.user, api: client(r.body.token), password: 'senha-super-forte-1' };
}

export async function makeFriends(a: Awaited<ReturnType<typeof registerUser>>, b: Awaited<ReturnType<typeof registerUser>>) {
  await a.api.post('/relationships', { userId: b.user.id });
  await b.api.put(`/relationships/${a.user.id}`);
}

export interface GatewayClient {
  events: { t: string; d: any }[];
  ready: any;
  waitFor: (t: string, pred?: (d: any) => boolean, timeout?: number) => Promise<any>;
  rpc: (m: string, d?: unknown) => Promise<any>;
  close: () => void;
  ws: WebSocket;
}

export function gateway(token: string): Promise<GatewayClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(baseUrl.replace('http', 'ws') + '/gateway');
    const events: { t: string; d: any }[] = [];
    const waiters: { t: string; pred?: (d: any) => boolean; resolve: (d: any) => void }[] = [];
    const pending = new Map<number, { resolve: (d: any) => void; reject: (e: any) => void }>();
    let rid = 0;
    const api: GatewayClient = {
      events,
      ready: null,
      ws,
      waitFor: (t, pred, timeout = 5000) =>
        new Promise((res, rej) => {
          const found = events.find((e) => e.t === t && (!pred || pred(e.d)));
          if (found) return res(found.d);
          const w = { t, pred, resolve: res };
          waiters.push(w);
          setTimeout(() => {
            const i = waiters.indexOf(w);
            if (i >= 0) {
              waiters.splice(i, 1);
              rej(new Error(`timeout esperando ${t}`));
            }
          }, timeout);
        }),
      rpc: (m, d = {}) =>
        new Promise((res, rej) => {
          const id = ++rid;
          pending.set(id, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ op: GatewayOp.REQUEST, id, m, d }));
        }),
      close: () => ws.close(),
    };
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.op === GatewayOp.HELLO) ws.send(JSON.stringify({ op: GatewayOp.IDENTIFY, d: { token, client: { platform: 'test', version: '1' } } }));
      else if (msg.op === GatewayOp.DISPATCH) {
        if (msg.t === 'READY') {
          api.ready = msg.d;
          resolve(api);
        }
        events.push({ t: msg.t, d: msg.d });
        for (const w of [...waiters])
          if (w.t === msg.t && (!w.pred || w.pred(msg.d))) {
            waiters.splice(waiters.indexOf(w), 1);
            w.resolve(msg.d);
          }
      } else if (msg.op === GatewayOp.RESPONSE) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.ok) p?.resolve(msg.d);
        else p?.reject(Object.assign(new Error(msg.error?.message), { code: msg.error?.code }));
      }
    });
    ws.on('close', (code) => reject(new Error('gateway fechado ' + code)));
    ws.on('error', reject);
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
