import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Relationship as RelDTO, RelationshipType } from '@vinlancord/shared';
import { prisma } from '../lib/db';
import { badRequest, notFound } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { limit } from '../lib/ratelimit';
import { publicUserSelect, toPublicUser, type UserRow } from '../lib/serialize';
import { parse, zId } from '../lib/validate';
import { bus } from '../services/bus';
import { getPresences } from '../services/presence';
import { getSettings, mutualGuildIds } from '../services/users';

const TYPE: Record<string, RelationshipType> = { FRIEND: 'friend', INCOMING: 'incoming', OUTGOING: 'outgoing', BLOCKED: 'blocked' };

function toRel(r: { targetId: string; type: string; createdAt: Date; target: UserRow }): RelDTO {
  return { id: r.targetId, type: TYPE[r.type]!, user: toPublicUser(r.target), since: r.createdAt.toISOString() };
}

async function loadRel(userId: string, targetId: string) {
  const r = await prisma.relationship.findUnique({
    where: { userId_targetId: { userId, targetId } },
    include: { target: { select: publicUserSelect } },
  });
  return r ? toRel(r) : null;
}

async function emitRel(userId: string, targetId: string) {
  const r = await loadRel(userId, targetId);
  if (r) await bus.toUser(userId, 'RELATIONSHIP_ADD', r);
  else await bus.toUser(userId, 'RELATIONSHIP_REMOVE', { id: targetId });
}

/** Quando duas pessoas viram amigas, cada uma passa a receber a presença da outra. */
async function exchangePresence(a: string, b: string) {
  const [pa, pb] = await getPresences([a, b]).then((ps) => [ps.find((p) => p.userId === a), ps.find((p) => p.userId === b)]);
  if (pa) await bus.toUser(b, 'PRESENCE_UPDATE', pa);
  if (pb) await bus.toUser(a, 'PRESENCE_UPDATE', pb);
}

export async function sendFriendRequest(me: string, targetId: string) {
  if (targetId === me) throw badRequest('Você não pode adicionar a si mesmo… por mais legal que seja. 😄', undefined, 'SELF');
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, system: true } });
  if (!target || target.system) throw notFound('Usuário');

  const [mine, theirs] = await Promise.all([
    prisma.relationship.findUnique({ where: { userId_targetId: { userId: me, targetId } } }),
    prisma.relationship.findUnique({ where: { userId_targetId: { userId: targetId, targetId: me } } }),
  ]);
  const generic = badRequest('Não foi possível enviar o pedido de amizade para esse usuário.', undefined, 'FRIEND_REQUEST_BLOCKED');
  if (theirs?.type === 'BLOCKED') throw generic;
  if (mine?.type === 'BLOCKED') throw badRequest('Você bloqueou esse usuário. Desbloqueie para adicionar.', undefined, 'YOU_BLOCKED');
  if (mine?.type === 'FRIEND') throw badRequest('Vocês já são amigos!', undefined, 'ALREADY_FRIENDS');
  if (mine?.type === 'OUTGOING') return; // idempotente

  if (mine?.type === 'INCOMING') {
    // Ele já tinha pedido: aceitar.
    await prisma.$transaction([
      prisma.relationship.update({ where: { userId_targetId: { userId: me, targetId } }, data: { type: 'FRIEND', createdAt: new Date() } }),
      prisma.relationship.update({ where: { userId_targetId: { userId: targetId, targetId: me } }, data: { type: 'FRIEND', createdAt: new Date() } }),
    ]);
    await Promise.all([emitRel(me, targetId), emitRel(targetId, me)]);
    await exchangePresence(me, targetId);
    return;
  }

  const privacy = (await getSettings(targetId)).privacy;
  if (privacy.friendRequestsFrom === 'nobody') throw generic;
  if (privacy.friendRequestsFrom === 'server_members' && (await mutualGuildIds(me, targetId)).length === 0) throw generic;

  await prisma.$transaction([
    prisma.relationship.create({ data: { userId: me, targetId, type: 'OUTGOING' } }),
    prisma.relationship.upsert({
      where: { userId_targetId: { userId: targetId, targetId: me } },
      create: { userId: targetId, targetId: me, type: 'INCOMING' },
      update: { type: 'INCOMING', createdAt: new Date() },
    }),
  ]);
  await Promise.all([emitRel(me, targetId), emitRel(targetId, me)]);
}

export default async function relationshipRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/relationships', async (req) => {
    const rows = await prisma.relationship.findMany({
      where: { userId: req.auth.userId },
      include: { target: { select: publicUserSelect } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRel);
  });

  app.post('/relationships', async (req) => {
    const body = parse(
      z.union([
        z.object({ userId: zId }),
        z.object({ username: z.string().trim().toLowerCase().min(2).max(32) }),
      ]),
      req.body,
    );
    await limit(`friendreq:${req.auth.userId}`, 30, 3600, 'Você enviou muitos pedidos de amizade. Respira e tenta daqui a pouco.');
    let targetId: string;
    if ('userId' in body) targetId = body.userId;
    else {
      const u = await prisma.user.findUnique({ where: { username: body.username.replace(/^@/, '') }, select: { id: true } });
      if (!u) throw notFound('Usuário');
      targetId = u.id;
    }
    await sendFriendRequest(req.auth.userId, targetId);
    return (await loadRel(req.auth.userId, targetId)) ?? { ok: true };
  });

  app.put<{ Params: { id: string } }>('/relationships/:id', async (req) => {
    const targetId = parse(zId, req.params.id);
    const mine = await prisma.relationship.findUnique({ where: { userId_targetId: { userId: req.auth.userId, targetId } } });
    if (mine?.type !== 'INCOMING') throw notFound('Pedido de amizade');
    await sendFriendRequest(req.auth.userId, targetId);
    return loadRel(req.auth.userId, targetId);
  });

  app.delete<{ Params: { id: string } }>('/relationships/:id', async (req) => {
    const me = req.auth.userId;
    const targetId = parse(zId, req.params.id);
    const mine = await prisma.relationship.findUnique({ where: { userId_targetId: { userId: me, targetId } } });
    if (!mine) return { ok: true };
    if (mine.type === 'BLOCKED') {
      await prisma.relationship.delete({ where: { userId_targetId: { userId: me, targetId } } });
      await emitRel(me, targetId);
      return { ok: true };
    }
    // Amizade / pedido enviado / pedido recebido: remove dos dois lados (exceto bloqueio do outro lado).
    await prisma.relationship.delete({ where: { userId_targetId: { userId: me, targetId } } });
    await prisma.relationship.deleteMany({ where: { userId: targetId, targetId: me, type: { not: 'BLOCKED' } } });
    await Promise.all([emitRel(me, targetId), emitRel(targetId, me)]);
    return { ok: true };
  });

  app.put<{ Params: { id: string } }>('/relationships/:id/block', async (req) => {
    const me = req.auth.userId;
    const targetId = parse(zId, req.params.id);
    if (targetId === me) throw badRequest('Você não pode se bloquear.');
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw notFound('Usuário');
    await prisma.$transaction([
      prisma.relationship.upsert({
        where: { userId_targetId: { userId: me, targetId } },
        create: { userId: me, targetId, type: 'BLOCKED' },
        update: { type: 'BLOCKED', createdAt: new Date() },
      }),
      prisma.relationship.deleteMany({ where: { userId: targetId, targetId: me, type: { not: 'BLOCKED' } } }),
    ]);
    await Promise.all([emitRel(me, targetId), emitRel(targetId, me)]);
    return loadRel(me, targetId);
  });
}
