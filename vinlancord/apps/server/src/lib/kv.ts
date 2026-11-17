/**
 * Camada de chave-valor + pub/sub. Usa Redis quando REDIS_URL está definido
 * (presença, cache, rate limit e barramento de eventos entre instâncias) e cai
 * para memória quando não está (testes e desenvolvimento rápido).
 */
import { Redis } from 'ioredis';
import { config } from '../config';

type Handler = (message: string) => void;

export interface KV {
  readonly kind: 'redis' | 'memory';
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  /** Define apenas se não existir. Retorna true se definiu. */
  setnx(key: string, value: string, ttlSec: number): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  incr(key: string, ttlSec: number): Promise<number>;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: Handler): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
  redis?: Redis;
}

class MemoryKV implements KV {
  readonly kind = 'memory' as const;
  private data = new Map<string, { v: string; exp: number }>();
  private subs = new Map<string, Set<Handler>>();
  private sweeper = setInterval(() => this.sweep(), 30_000).unref();

  private live(key: string) {
    const e = this.data.get(key);
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) {
      this.data.delete(key);
      return null;
    }
    return e;
  }
  private sweep() {
    const now = Date.now();
    for (const [k, e] of this.data) if (e.exp && e.exp < now) this.data.delete(k);
  }
  async get(key: string) {
    return this.live(key)?.v ?? null;
  }
  async mget(keys: string[]) {
    return keys.map((k) => this.live(k)?.v ?? null);
  }
  async set(key: string, v: string, ttl?: number) {
    this.data.set(key, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 });
  }
  async setnx(key: string, v: string, ttl: number) {
    if (this.live(key)) return false;
    await this.set(key, v, ttl);
    return true;
  }
  async del(...keys: string[]) {
    for (const k of keys) this.data.delete(k);
  }
  async incr(key: string, ttl: number) {
    const e = this.live(key);
    const n = (e ? Number(e.v) : 0) + 1;
    this.data.set(key, { v: String(n), exp: e?.exp || Date.now() + ttl * 1000 });
    return n;
  }
  async publish(channel: string, message: string) {
    const set = this.subs.get(channel);
    if (set) queueMicrotask(() => set.forEach((h) => h(message)));
  }
  async subscribe(channel: string, handler: Handler) {
    let set = this.subs.get(channel);
    if (!set) this.subs.set(channel, (set = new Set()));
    set.add(handler);
  }
  async ping() {
    return true;
  }
  async close() {
    clearInterval(this.sweeper);
  }
}

class RedisKV implements KV {
  readonly kind = 'redis' as const;
  readonly redis: Redis;
  private sub: Redis;
  private handlers = new Map<string, Set<Handler>>();

  constructor(url: string) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: true, lazyConnect: false });
    this.sub = new Redis(url, { maxRetriesPerRequest: null });
    this.sub.on('message', (channel: string, message: string) => {
      this.handlers.get(channel)?.forEach((h) => h(message));
    });
    const log = (e: Error) => console.error('[redis]', e.message);
    this.redis.on('error', log);
    this.sub.on('error', log);
  }
  get(key: string) {
    return this.redis.get(key);
  }
  async mget(keys: string[]) {
    if (!keys.length) return [];
    return this.redis.mget(...keys);
  }
  async set(key: string, v: string, ttl?: number) {
    if (ttl) await this.redis.set(key, v, 'EX', ttl);
    else await this.redis.set(key, v);
  }
  async setnx(key: string, v: string, ttl: number) {
    return (await this.redis.set(key, v, 'EX', ttl, 'NX')) === 'OK';
  }
  async del(...keys: string[]) {
    if (keys.length) await this.redis.del(...keys);
  }
  async incr(key: string, ttl: number) {
    const [[, n]] = (await this.redis.multi().incr(key).expire(key, ttl, 'NX').exec()) as [[unknown, number]];
    return n;
  }
  async publish(channel: string, message: string) {
    await this.redis.publish(channel, message);
  }
  async subscribe(channel: string, handler: Handler) {
    let set = this.handlers.get(channel);
    if (!set) {
      this.handlers.set(channel, (set = new Set()));
      await this.sub.subscribe(channel);
    }
    set.add(handler);
  }
  async ping() {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
  async close() {
    this.redis.disconnect();
    this.sub.disconnect();
  }
}

export const kv: KV = config.REDIS_URL ? new RedisKV(config.REDIS_URL) : new MemoryKV();
