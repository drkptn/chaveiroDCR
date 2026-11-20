import { hash, verify } from '@node-rs/argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from './db';
import { newId, randomToken, sha256 } from './ids';
import { unauthorized } from './errors';
import { config } from '../config';

// algorithm 2 = Argon2id
const ARGON_OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => hash(pw, ARGON_OPTS);
export async function verifyPassword(hashStr: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashStr, pw);
  } catch {
    return false;
  }
}
/** Hash usado para equalizar o tempo de resposta quando o usuário não existe. */
let dummyHash: string | null = null;
export async function burnPasswordCheck(pw: string) {
  dummyHash ??= await hashPassword('vinlancord-dummy-password');
  await verifyPassword(dummyHash, pw);
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  emailVerified: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

interface CacheEntry {
  ctx: AuthContext | null;
  at: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 30_000;
const TOUCH_MS = 5 * 60_000;
const lastTouch = new Map<string, number>();

export function invalidateSessionCache(sessionIdOrAll?: string) {
  if (!sessionIdOrAll) return cache.clear();
  for (const [k, v] of cache) if (v.ctx?.sessionId === sessionIdOrAll) cache.delete(k);
}
export function invalidateUserSessions(userId: string) {
  for (const [k, v] of cache) if (v.ctx?.userId === userId) cache.delete(k);
}

export async function createSession(
  userId: string,
  meta: { deviceName?: string; platform?: string; ip?: string; userAgent?: string },
) {
  const token = randomToken(32);
  const session = await prisma.session.create({
    data: {
      id: newId(),
      userId,
      tokenHash: sha256(token),
      deviceName: (meta.deviceName || 'Desconhecido').slice(0, 100),
      platform: (meta.platform || 'web').slice(0, 40),
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      expiresAt: new Date(Date.now() + config.SESSION_TTL_DAYS * 86400_000),
    },
  });
  return { token, session };
}

/** Valida um token opaco de sessão. Cache curto para aliviar o banco. */
export async function authenticateToken(token: string | undefined | null, ip?: string): Promise<AuthContext | null> {
  if (!token || token.length < 20 || token.length > 128) return null;
  const tokenHash = sha256(token);
  const hit = cache.get(tokenHash);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_MS) return hit.ctx;

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true, user: { select: { emailVerified: true, suspendedAt: true } } },
  });
  let ctx: AuthContext | null = null;
  if (session && !session.revokedAt && !session.user.suspendedAt && session.expiresAt.getTime() > now) {
    ctx = { userId: session.userId, sessionId: session.id, emailVerified: session.user.emailVerified };
    const lt = lastTouch.get(session.id) ?? 0;
    if (now - lt > TOUCH_MS) {
      lastTouch.set(session.id, now);
      // sessão deslizante: renova validade e último acesso
      prisma.session
        .update({
          where: { id: session.id },
          data: {
            lastActiveAt: new Date(),
            ...(ip ? { ip: ip.slice(0, 64) } : {}),
            expiresAt: new Date(now + config.SESSION_TTL_DAYS * 86400_000),
          },
        })
        .catch(() => {});
    }
  }
  if (cache.size > 10_000) cache.clear();
  cache.set(tokenHash, { ctx, at: now });
  return ctx;
}

export function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  const ctx = await authenticateToken(bearer(req), req.ip);
  if (!ctx) throw unauthorized();
  req.auth = ctx;
}
