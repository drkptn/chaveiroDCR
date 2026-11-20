/**
 * Painel do Criador: ações exclusivas da conta com o selo "creator" (no máximo uma por servidor,
 * registrada pelo operador do servidor). Toda rota confere no banco a cada chamada.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { forbidden, notFound } from '../lib/errors';
import { requireAuth, invalidateUserSessions } from '../lib/auth';
import { parse, zId } from '../lib/validate';
import { limit } from '../lib/ratelimit';
import { toPublicUser, imageUrl } from '../lib/serialize';
import { bus } from '../services/bus';
import { connectedUserIds } from '../gateway';
import { voiceStatus } from '../voice/service';
import { revokeAllSessions } from './auth';
import { deleteGuildCompletely } from './guilds';

const startedAt = Date.now();

export async function isCreator(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { badges: true, suspendedAt: true } });
  return !!u && !u.suspendedAt && u.badges.includes('creator');
}

export default async function creatorRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', async (req) => {
    if (!(await isCreator(req.auth.userId))) throw forbidden('Exclusivo do criador do Além-Mar.');
  });

  /** Números do servidor. */
  app.get('/creator/overview', async () => {
    const [users, suspended, guilds, messages, channels] = await Promise.all([
      prisma.user.count({ where: { system: false } }),
      prisma.user.count({ where: { suspendedAt: { not: null } } }),
      prisma.guild.count(),
      prisma.message.count(),
      prisma.channel.count({ where: { guildId: { not: null } } }),
    ]);
    const v = voiceStatus();
    return {
      users,
      suspended,
      online: connectedUserIds().length,
      guilds,
      channels,
      messages,
      inCalls: v.peers,
      activeCalls: v.rooms,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      version: process.env.npm_package_version ?? null,
    };
  });

  /** Contas (busca por nome/usuário/e-mail). */
  app.get('/creator/users', async (req) => {
    const { q } = parse(z.object({ q: z.string().trim().max(64).optional().default('') }), req.query);
    const online = new Set(connectedUserIds());
    const rows = await prisma.user.findMany({
      where: {
        system: false,
        ...(q
          ? {
              OR: [
                { username: { contains: q.toLowerCase() } },
                { displayName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q.toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, username: true, displayName: true, email: true, avatarKey: true, accentColor: true, createdAt: true, system: true, badges: true, suspendedAt: true, _count: { select: { messages: true, memberships: true } } },
    });
    return rows.map((u) => ({
      user: toPublicUser(u),
      email: u.email,
      suspended: !!u.suspendedAt,
      online: online.has(u.id),
      messages: u._count.messages,
      guilds: u._count.memberships,
    }));
  });

  /** Suspende ou reativa uma conta (encerra as sessões na hora). */
  app.post<{ Params: { id: string } }>('/creator/users/:id/suspend', async (req) => {
    const id = parse(zId, req.params.id);
    const { suspended } = parse(z.object({ suspended: z.boolean() }), req.body);
    if (id === req.auth.userId) throw forbidden('Você não pode suspender a própria conta.');
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, system: true } });
    if (!target || target.system) throw notFound('Usuário');
    await prisma.user.update({ where: { id }, data: { suspendedAt: suspended ? new Date() : null } });
    invalidateUserSessions(id);
    if (suspended) await revokeAllSessions(id);
    return { ok: true, suspended };
  });

  /** Todas as comunidades (servidores) deste servidor. */
  app.get('/creator/guilds', async () => {
    const rows = await prisma.guild.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, name: true, iconKey: true, createdAt: true, owner: { select: { username: true, displayName: true } }, _count: { select: { members: true, channels: true } } },
    });
    return rows.map((g) => ({
      id: g.id,
      name: g.name,
      icon: imageUrl(g.iconKey),
      createdAt: g.createdAt.toISOString(),
      owner: g.owner,
      members: g._count.members,
      channels: g._count.channels,
    }));
  });

  /** Apaga uma comunidade (irreversível; o app pede confirmação). */
  app.delete<{ Params: { id: string } }>('/creator/guilds/:id', async (req) => {
    const id = parse(zId, req.params.id);
    const g = await prisma.guild.findUnique({ where: { id }, select: { id: true, iconKey: true, bannerKey: true } });
    if (!g) throw notFound('Servidor');
    await deleteGuildCompletely(g);
    return { ok: true };
  });

  /** Anúncio para todo mundo conectado. */
  app.post('/creator/announce', async (req) => {
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(500) }), req.body);
    await limit(`announce:${req.auth.userId}`, 5, 60, 'Calma, Lord: no máximo 5 anúncios por minuto.');
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    const targets = connectedUserIds();
    await bus.toUsers(targets, 'ANNOUNCEMENT', { text, from: toPublicUser(me), at: new Date().toISOString() });
    return { ok: true, delivered: targets.length };
  });
}
