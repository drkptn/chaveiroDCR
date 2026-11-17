import { kv } from './kv';
import { tooMany } from './errors';
import { config } from '../config';

/** Limite por janela fixa usando o KV (compartilhado entre instâncias quando há Redis). */
export async function limit(key: string, max: number, windowSec: number, message?: string) {
  if (config.isTest && !process.env.VINLANCORD_TEST_RATELIMIT) return;
  const n = await kv.incr(`rl:${key}`, windowSec);
  if (n > max) throw tooMany(message);
}

/** Token bucket em memória (por conexão WebSocket). */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(
    private capacity: number,
    private refillPerSec: number,
  ) {
    this.tokens = capacity;
  }
  take(n = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}
