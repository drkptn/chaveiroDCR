import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { SessionInfo } from '@vinlancord/shared';
import { DEFAULT_SETTINGS } from '@vinlancord/shared';
import { config } from '../config';
import { prisma } from '../lib/db';
import { ApiError, badRequest, conflict, forbidden, invalidPassword } from '../lib/errors';
import { newId, randomToken, sha256, safeEqual } from '../lib/ids';
import {
  burnPasswordCheck,
  createSession,
  hashPassword,
  invalidateSessionCache,
  invalidateUserSessions,
  requireAuth,
  verifyPassword,
} from '../lib/auth';
import { limit } from '../lib/ratelimit';
import { mailConfigured, sendPasswordResetEmail, sendVerificationEmail } from '../lib/mailer';
import { toSelfUser } from '../lib/serialize';
import { parse, zDisplayName, zEmail, zPassword, zUsername } from '../lib/validate';
import { bus } from '../services/bus';

const zDevice = z
  .object({ name: z.string().max(100).optional(), platform: z.string().max(40).optional() })
  .optional();

function deviceMeta(req: FastifyRequest, device?: { name?: string; platform?: string }) {
  const ua = req.headers['user-agent'] ?? '';
  const guess = /Electron/i.test(ua) ? 'desktop' : 'web';
  const os = /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : '';
  const browser = /Electron/i.test(ua) ? 'Vinlancord' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return {
    deviceName: device?.name || [browser, os && `no ${os}`].filter(Boolean).join(' '),
    platform: device?.platform || guess,
    ip: req.ip,
    userAgent: ua,
  };
}

async function issueEmailToken(userId: string, type: 'VERIFY_EMAIL' | 'RESET_PASSWORD', ttlMs: number) {
  const token = randomToken(32);
  await prisma.emailToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.emailToken.create({
    data: { id: newId(), userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

async function consumeEmailToken(token: string, type: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt.getTime() < Date.now())
    throw badRequest('Este link é inválido ou expirou. Peça um novo.', undefined, 'INVALID_TOKEN');
  await prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row;
}

export async function revokeSession(userId: string, sessionId: string) {
  await prisma.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  invalidateSessionCache(sessionId);
  await bus.toSession(userId, sessionId, 'SESSION_REVOKED', { sessionId });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
    select: { id: true },
  });
  await prisma.session.updateMany({
    where: { id: { in: sessions.map((s) => s.id) } },
    data: { revokedAt: new Date() },
  });
  invalidateUserSessions(userId);
  for (const s of sessions) await bus.toSession(userId, s.id, 'SESSION_REVOKED', { sessionId: s.id });
}

export default async function authRoutes(app: FastifyInstance) {
  app.get('/auth/config', async () => ({
    name: 'Vinlancord',
    version: process.env.npm_package_version ?? '1.0.0',
    registrationEnabled: config.REGISTRATION_ENABLED,
    registrationCodeRequired: !!config.REGISTRATION_CODE,
    requireEmailVerification: config.REQUIRE_EMAIL_VERIFICATION,
    mailConfigured,
    gifsEnabled: !!config.GIPHY_API_KEY,
  }));

  app.post('/auth/register', async (req) => {
    await limit(`register:${req.ip}`, 5, 3600, 'Muitas contas criadas a partir deste endereço. Tente mais tarde.');
    const body = parse(
      z.object({
        email: zEmail,
        username: zUsername,
        displayName: zDisplayName.optional(),
        password: zPassword,
        registrationCode: z.string().max(200).optional(),
        device: zDevice,
      }),
      req.body,
    );
    if (!config.REGISTRATION_ENABLED) throw forbidden('O cadastro está desativado neste servidor.', 'REGISTRATION_DISABLED');
    if (config.REGISTRATION_CODE && !safeEqual(body.registrationCode ?? '', config.REGISTRATION_CODE))
      throw badRequest('Código de cadastro inválido.', { registrationCode: 'Código inválido' }, 'INVALID_REGISTRATION_CODE');

    const [emailTaken, nameTaken] = await Promise.all([
      prisma.user.findUnique({ where: { email: body.email }, select: { id: true } }),
      prisma.user.findUnique({ where: { username: body.username }, select: { id: true } }),
    ]);
    const fields: Record<string, string> = {};
    if (emailTaken) fields.email = 'Este e-mail já está em uso';
    if (nameTaken) fields.username = 'Este nome de usuário já está em uso';
    if (Object.keys(fields).length) throw conflict('Não foi possível criar a conta.', 'ALREADY_EXISTS', fields);

    const user = await prisma.user.create({
      data: {
        id: newId(),
        email: body.email,
        username: body.username,
        displayName: body.displayName || body.username,
        passwordHash: await hashPassword(body.password),
        settings: DEFAULT_SETTINGS as object,
      },
    });
    const verifyToken = await issueEmailToken(user.id, 'VERIFY_EMAIL', 48 * 3600_000);
    await sendVerificationEmail(user.email, user.displayName, verifyToken).catch((e) => req.log.error(e, 'falha ao enviar e-mail'));

    if (config.REQUIRE_EMAIL_VERIFICATION) return { token: null, user: toSelfUser(user), verificationRequired: true };
    const { token } = await createSession(user.id, deviceMeta(req, body.device));
    return { token, user: toSelfUser(user), verificationRequired: false };
  });

  app.post('/auth/login', async (req) => {
    const body = parse(
      z.object({ login: z.string().trim().min(1).max(254), password: z.string().min(1).max(256), device: zDevice }),
      req.body,
    );
    await limit(`login-ip:${req.ip}`, 20, 300, 'Muitas tentativas de login. Aguarde alguns minutos.');
    const login = body.login.toLowerCase();
    await limit(`login-acct:${login}`, 10, 900, 'Muitas tentativas para esta conta. Aguarde 15 minutos.');

    const user = await prisma.user.findFirst({ where: login.includes('@') ? { email: login } : { username: login } });
    if (!user || user.system) {
      await burnPasswordCheck(body.password);
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Login ou senha incorretos.');
    }
    if (!(await verifyPassword(user.passwordHash, body.password)))
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Login ou senha incorretos.');
    if (user.suspendedAt) throw forbidden('Esta conta foi suspensa pelo criador do servidor.', 'ACCOUNT_SUSPENDED');
    if (config.REQUIRE_EMAIL_VERIFICATION && !user.emailVerified)
      throw forbidden('Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.', 'EMAIL_NOT_VERIFIED');

    const { token } = await createSession(user.id, deviceMeta(req, body.device));
    return { token, user: toSelfUser(user) };
  });

  app.post('/auth/logout', { preHandler: requireAuth }, async (req) => {
    await revokeSession(req.auth.userId, req.auth.sessionId);
    return { ok: true };
  });

  app.post('/auth/verify-email', async (req) => {
    const { token } = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
    await limit(`verify:${req.ip}`, 20, 600);
    const row = await consumeEmailToken(token, 'VERIFY_EMAIL');
    const user = await prisma.user.update({ where: { id: row.userId }, data: { emailVerified: true } });
    invalidateUserSessions(user.id);
    await bus.toUser(user.id, 'USER_UPDATE', toSelfUser(user));
    return { ok: true };
  });

  app.post('/auth/resend-verification', { preHandler: requireAuth }, async (req) => {
    await limit(`resend:${req.auth.userId}`, 3, 3600, 'Você já pediu vários e-mails. Tente mais tarde.');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (user.emailVerified) return { ok: true, alreadyVerified: true };
    const t = await issueEmailToken(user.id, 'VERIFY_EMAIL', 48 * 3600_000);
    await sendVerificationEmail(user.email, user.displayName, t);
    return { ok: true };
  });

  /** Também aceita login sem verificação quando o servidor exige confirmação. */
  app.post('/auth/resend-verification-public', async (req) => {
    const { email } = parse(z.object({ email: zEmail }), req.body);
    await limit(`resend-pub:${req.ip}`, 5, 3600);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerified) {
      const t = await issueEmailToken(user.id, 'VERIFY_EMAIL', 48 * 3600_000);
      await sendVerificationEmail(user.email, user.displayName, t).catch(() => {});
    }
    return { ok: true };
  });

  app.post('/auth/forgot-password', async (req) => {
    const { email } = parse(z.object({ email: zEmail }), req.body);
    await limit(`forgot:${req.ip}`, 5, 3600, 'Muitos pedidos. Tente novamente mais tarde.');
    await limit(`forgot-acct:${email}`, 3, 3600, 'Muitos pedidos. Tente novamente mais tarde.');
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.system) {
      const t = await issueEmailToken(user.id, 'RESET_PASSWORD', 3600_000);
      await sendPasswordResetEmail(user.email, user.displayName, t).catch((e) => req.log.error(e));
    }
    // Resposta idêntica exista ou não a conta (evita enumeração de e-mails).
    return { ok: true };
  });

  app.post('/auth/reset-password', async (req) => {
    const { token, password } = parse(z.object({ token: z.string().min(10).max(200), password: zPassword }), req.body);
    await limit(`reset:${req.ip}`, 10, 3600);
    const row = await consumeEmailToken(token, 'RESET_PASSWORD');
    await prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await hashPassword(password), emailVerified: true },
    });
    await revokeAllSessions(row.userId);
    return { ok: true };
  });

  app.get('/auth/sessions', { preHandler: requireAuth }, async (req): Promise<SessionInfo[]> => {
    const rows = await prisma.session.findMany({
      where: { userId: req.auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastActiveAt: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      platform: s.platform,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastActiveAt: s.lastActiveAt.toISOString(),
      current: s.id === req.auth.sessionId,
    }));
  });

  app.delete<{ Params: { id: string } }>('/auth/sessions/:id', { preHandler: requireAuth }, async (req) => {
    if (req.params.id === req.auth.sessionId) throw badRequest('Use "Sair" para encerrar a sessão atual.');
    await revokeSession(req.auth.userId, req.params.id);
    return { ok: true };
  });

  app.post('/auth/sessions/revoke-others', { preHandler: requireAuth }, async (req) => {
    const { password } = parse(z.object({ password: z.string().min(1).max(256) }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!(await verifyPassword(user.passwordHash, password))) throw invalidPassword();
    await revokeAllSessions(req.auth.userId, req.auth.sessionId);
    return { ok: true };
  });
}
