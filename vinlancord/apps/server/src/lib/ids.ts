import { randomBytes, createHash, timingSafeEqual, createHmac } from 'node:crypto';
import { SnowflakeGenerator } from '@vinlancord/shared';
import { config } from '../config';

const gen = new SnowflakeGenerator(config.WORKER_ID);
export const newId = (): string => gen.next();

/** Token aleatório de 256 bits em base64url. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');

export const hmac = (v: string): string => createHmac('sha256', config.SECRET_KEY).update(v).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const INVITE_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function inviteCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += INVITE_ALPHABET[bytes[i]! % INVITE_ALPHABET.length];
  return out;
}
