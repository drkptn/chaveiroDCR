import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ALL_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  LIMITS,
  P,
  computeBasePermissions,
  has,
  normalizeTextChannelName,
  type Ban,
} from '@vinlancord/shared';
import { prisma } from '../lib/db';
import { badRequest, forbidden, invalidPassword, notFound } from '../lib/errors';
import { requireAuth, verifyPassword } from '../lib/auth';
import { newId } from '../lib/ids';
import { limit } from '../lib/ratelimit';
import { deleteImage, processImage } from '../lib/media';
import { readSingleFile } from '../lib/upload';
import {
  channelTypeToDb,
  publicUserSelect,
  toChannel,
  toEmoji,
  toGuild,
  toMember,
  toPublicUser,
  toRole,
  toSticker,
} from '../lib/serialize';
import { parse, zColor, zId } from '../lib/validate';
import { bus } from '../services/bus';
import {
  getGuild,
  invalidateGuild,
  requireGuildPerm,
  requireHierarchy,
  requireMember,
  requireRoleBelow,
  rolePosition,
  usersWhoCanView,
} from '../services/perms';
import { audit, buildGuildFull, emitMemberUpdate, memberWithUser, refreshGuildFor } from '../services/guilds';
import { voiceHooks } from '../services/voiceHooks';
import { getPresences } from '../services/presence';

const TEMPLATES = {
  amigos: {
    text: [{ cat: 'Bate-papo', channels: ['geral', 'memes', 'links-e-mídia'] }],
    voice: [{ cat: 'Voz', channels: [{ name: 'Resenha', type: 'VOICE' }, { name: 'Jogatina', type: 'VOICE' }, { name: 'Câmera ligada', type: 'VIDEO' }] }],
  },
  jogos: {
    text: [{ cat: 'Informações', channels: ['regras', 'anúncios'] }, { cat: 'Geral', channels: ['geral', 'clipes', 'procurando-grupo'] }],
    voice: [{ cat: 'Partidas', channels: [{ name: 'Squad 1', type: 'VOICE' }, { name: 'Squad 2', type: 'VOICE' }, { name: 'Lives', type: 'VIDEO' }] }],
  },
  estudos: {
    text: [{ cat: 'Estudos', channels: ['geral', 'dúvidas', 'materiais'] }],
    voice: [{ cat: 'Salas', channels: [{ name: 'Sala de estudo', type: 'VOICE' }, { name: 'Aula ao vivo', type: 'VIDEO' }] }],
  },
  vazio: {
    text: [{ cat: 'Canais de texto', channels: ['geral'] }],
    voice: [{ cat: 'Canais de voz', channels: [{ name: 'Geral', type: 'VOICE' }] }],
  },
} as const;

/** Usuário não pode conceder permissões que ele próprio não tem. */
async function assertCanGrant(guildId: string, actorId: string, perms: bigint) {
  const g = await getGuild(guildId);
  if (!g) throw notFound('Servidor');
  const m = g.members.get(actorId);
  const mine = m ? computeBasePermissions({ guildId, ownerId: g.ownerId, userId: actorId, roles: g.roles, memberRoleIds: m.roleIds }) : 0n;
  if ((perms & ~mine) !== 0n) throw forbidden('Você não pode conceder permissões que você não tem.');
}

export async function addMember(guildId: string, userId: string) {
  const exists = await prisma.member.findUnique({ where: { guildId_userId: { guildId, userId } } });
  if (exists) return false;
  const count = await prisma.member.count({ where: { userId } });
  if (count >= LIMITS.GUILDS_PER_USER) throw badRequest(`Você atingiu o limite de ${LIMITS.GUILDS_PER_USER} servidores.`);
  await prisma.member.create({ data: { guildId, userId } });
  invalidateGuild(guildId);
  const [guild, user, member] = await Promise.all([
    prisma.guild.findUniqueOrThrow({ where: { id: guildId } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect }),
    memberWithUser(guildId, userId),
  ]);
  await bus.toGuild(guildId, 'GUILD_MEMBER_ADD', { member: toMember(member!), user: toPublicUser(user) });
  const full = await buildGuildFull(guildId, userId);
  if (full) await bus.toUser(userId, 'GUILD_CREATE', full);
  // presença dos membros para o novo membro (e vice-versa via evento acima)
  const snap = await getGuild(guildId);
  const pres = await getPresences([...(snap?.members.keys() ?? [])]);
  for (const p of pres) await bus.toUser(userId, 'PRESENCE_UPDATE', p);
  const mine = pres.find((p) => p.userId === userId);
  if (mine) await bus.toGuild(guildId, 'PRESENCE_UPDATE', mine);
  // mensagem de boas-vindas no canal do sistema
  if (guild.systemChannelId) {
    const { createSystemMessage } = await import('../services/systemMessages');
    await createSystemMessage(guild.systemChannelId, userId, 'MEMBER_JOIN');
  }
  return true;
}

export async function removeMember(guildId: string, userId: string) {
  await prisma.member.deleteMany({ where: { guildId, userId } });
  invalidateGuild(guildId);
  await voiceHooks.onMemberRemoved(guildId, userId);
  await bus.toUser(userId, 'GUILD_DELETE', { id: guildId });
  await bus.toGuild(guildId, 'GUILD_MEMBER_REMOVE', { guildId, userId });
}

export default async function guildRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/guilds', async (req) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(LIMITS.GUILD_NAME_MIN).max(LIMITS.GUILD_NAME_MAX),
        template: z.enum(['amigos', 'jogos', 'estudos', 'vazio']).default('amigos'),
      }),
      req.body,
    );
    await limit(`guild-create:${req.auth.userId}`, 10, 3600, 'Você criou muitos servidores agora. Tente mais tarde.');
    const count = await prisma.member.count({ where: { userId: req.auth.userId } });
    if (count >= LIMITS.GUILDS_PER_USER) throw badRequest(`Você atingiu o limite de ${LIMITS.GUILDS_PER_USER} servidores.`);

    const guildId = newId();
    const tpl = TEMPLATES[body.template];
    const channels: { id: string; type: 'TEXT' | 'VOICE' | 'VIDEO' | 'CATEGORY'; name: string; parentId: string | null; position: number }[] = [];
    let pos = 0;
    for (const group of tpl.text) {
      const cat = newId();
      channels.push({ id: cat, type: 'CATEGORY', name: group.cat, parentId: null, position: pos++ });
      group.channels.forEach((n, i) => channels.push({ id: newId(), type: 'TEXT', name: normalizeTextChannelName(n), parentId: cat, position: i }));
    }
    for (const group of tpl.voice) {
      const cat = newId();
      channels.push({ id: cat, type: 'CATEGORY', name: group.cat, parentId: null, position: pos++ });
      group.channels.forEach((c, i) => channels.push({ id: newId(), type: c.type, name: c.name, parentId: cat, position: i }));
    }
    const systemChannel = channels.find((c) => c.type === 'TEXT' && c.name === 'geral') ?? channels.find((c) => c.type === 'TEXT');

    await prisma.$transaction([
      prisma.guild.create({
        data: { id: guildId, name: body.name, ownerId: req.auth.userId, systemChannelId: systemChannel?.id ?? null },
      }),
      prisma.role.create({ data: { id: guildId, guildId, name: '@everyone', permissions: DEFAULT_EVERYONE_PERMISSIONS, position: 0 } }),
      prisma.member.create({ data: { guildId, userId: req.auth.userId } }),
      prisma.channel.createMany({ data: channels.map((c) => ({ ...c, guildId })) }),
    ]);
    await audit(guildId, req.auth.userId, 'GUILD_CREATE', guildId, { name: body.name });
    const full = await buildGuildFull(guildId, req.auth.userId);
    await bus.toUser(req.auth.userId, 'GUILD_CREATE', full!);
    return full;
  });

  app.get('/discover', async (req) => {
    const { q, offset } = parse(
      z.object({ q: z.string().trim().max(100).optional(), offset: z.coerce.number().int().min(0).max(1000).default(0) }),
      req.query,
    );
    const rows = await prisma.guild.findMany({
      where: { isPublic: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {}) },
      include: { _count: { select: { members: true } } },
      orderBy: { members: { _count: 'desc' } },
      skip: offset,
      take: 24,
    });
    const mine = new Set(
      (await prisma.member.findMany({ where: { userId: req.auth.userId, guildId: { in: rows.map((r) => r.id) } }, select: { guildId: true } })).map((m) => m.guildId),
    );
    return rows.map((g) => ({ ...toGuild(g, g._count.members), joined: mine.has(g.id) }));
  });

  app.post<{ Params: { id: string } }>('/discover/:id/join', async (req) => {
    const guildId = parse(zId, req.params.id);
    const g = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!g || !g.isPublic) throw notFound('Servidor');
    const ban = await prisma.ban.findUnique({ where: { guildId_userId: { guildId, userId: req.auth.userId } } });
    if (ban) throw forbidden('Você está banido deste servidor.', 'BANNED');
    await addMember(guildId, req.auth.userId);
    return buildGuildFull(guildId, req.auth.userId);
  });

  app.get<{ Params: { id: string } }>('/guilds/:id', async (req) => {
    const id = parse(zId, req.params.id);
    await requireMember(id, req.auth.userId);
    return buildGuildFull(id, req.auth.userId);
  });

  app.patch<{ Params: { id: string } }>('/guilds/:id', async (req) => {
    const id = parse(zId, req.params.id);
    await requireGuildPerm(id, req.auth.userId, P.MANAGE_GUILD);
    const body = parse(
      z
        .object({
          name: z.string().trim().min(LIMITS.GUILD_NAME_MIN).max(LIMITS.GUILD_NAME_MAX),
          description: z.string().trim().max(LIMITS.GUILD_DESCRIPTION_MAX),
          isPublic: z.boolean(),
          systemChannelId: zId.nullable(),
        })
        .partial(),
      req.body,
    );
    if (body.systemChannelId) {
      const ch = await prisma.channel.findFirst({ where: { id: body.systemChannelId, guildId: id, type: 'TEXT' } });
      if (!ch) throw badRequest('Canal do sistema inválido.');
    }
    const g = await prisma.guild.update({ where: { id }, data: body, include: { _count: { select: { members: true } } } });
    await audit(id, req.auth.userId, 'GUILD_UPDATE', id, body);
    const dto = toGuild(g, g._count.members);
    await bus.toGuild(id, 'GUILD_UPDATE', dto);
    return dto;
  });

  for (const kind of ['icon', 'banner'] as const) {
    app.post<{ Params: { id: string } }>(`/guilds/:id/${kind}`, async (req) => {
      const id = parse(zId, req.params.id);
      await requireGuildPerm(id, req.auth.userId, P.MANAGE_GUILD);
      await limit(`guild-img:${id}`, 20, 600);
      const max = kind === 'icon' ? LIMITS.AVATAR_MAX_SIZE : LIMITS.BANNER_MAX_SIZE;
      const { buffer } = await readSingleFile(req, max);
      const img = await processImage(buffer, {
        prefix: `guilds/${id}`,
        width: kind === 'icon' ? 256 : 1200,
        height: kind === 'icon' ? 256 : 480,
        fit: 'cover',
        maxBytes: max,
      });
      const field = kind === 'icon' ? 'iconKey' : 'bannerKey';
      const old = await prisma.guild.findUniqueOrThrow({ where: { id } });
      const g = await prisma.guild.update({ where: { id }, data: { [field]: img.key }, include: { _count: { select: { members: true } } } });
      await deleteImage(old[field]);
      await audit(id, req.auth.userId, 'GUILD_UPDATE', id, { [kind]: 'alterado' });
      const dto = toGuild(g, g._count.members);
      await bus.toGuild(id, 'GUILD_UPDATE', dto);
      return dto;
    });
    app.delete<{ Params: { id: string } }>(`/guilds/:id/${kind}`, async (req) => {
      const id = parse(zId, req.params.id);
      await requireGuildPerm(id, req.auth.userId, P.MANAGE_GUILD);
      const field = kind === 'icon' ? 'iconKey' : 'bannerKey';
      const old = await prisma.guild.findUniqueOrThrow({ where: { id } });
      const g = await prisma.guild.update({ where: { id }, data: { [field]: null }, include: { _count: { select: { members: true } } } });
      await deleteImage(old[field]);
      const dto = toGuild(g, g._count.members);
      await bus.toGuild(id, 'GUILD_UPDATE', dto);
      return dto;
    });
  }

  app.delete<{ Params: { id: string } }>('/guilds/:id', async (req) => {
    const id = parse(zId, req.params.id);
    const { password } = parse(z.object({ password: z.string().min(1).max(256) }), req.body);
    const g = await prisma.guild.findUnique({ where: { id } });
    if (!g) throw notFound('Servidor');
    if (g.ownerId !== req.auth.userId) throw forbidden('Apenas o dono pode excluir o servidor.');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!(await verifyPassword(user.passwordHash, password))) throw invalidPassword();
    const members = (await getGuild(id))?.members.keys() ?? [];
    const memberIds = [...members];
    const channels = await prisma.channel.findMany({ where: { guildId: id }, select: { id: true } });
    for (const c of channels) await voiceHooks.onChannelDeleted(c.id);
    await prisma.guild.delete({ where: { id } });
    invalidateGuild(id);
    await deleteImage(g.iconKey);
    await deleteImage(g.bannerKey);
    await bus.toUsers(memberIds, 'GUILD_DELETE', { id });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/guilds/:id/transfer', async (req) => {
    const id = parse(zId, req.params.id);
    const { userId, password } = parse(z.object({ userId: zId, password: z.string().min(1).max(256) }), req.body);
    const g = await prisma.guild.findUnique({ where: { id } });
    if (!g) throw notFound('Servidor');
    if (g.ownerId !== req.auth.userId) throw forbidden('Apenas o dono pode transferir o servidor.');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!(await verifyPassword(user.passwordHash, password))) throw invalidPassword();
    const target = await prisma.member.findUnique({ where: { guildId_userId: { guildId: id, userId } } });
    if (!target) throw badRequest('Esse usuário não é membro do servidor.');
    const updated = await prisma.guild.update({ where: { id }, data: { ownerId: userId }, include: { _count: { select: { members: true } } } });
    await audit(id, req.auth.userId, 'GUILD_TRANSFER', userId);
    await refreshGuildFor(id);
    const dto = toGuild(updated, updated._count.members);
    await bus.toGuild(id, 'GUILD_UPDATE', dto);
    return dto;
  });

  // ───────────── Membros ─────────────
  app.get<{ Params: { id: string } }>('/guilds/:id/members', async (req) => {
    const id = parse(zId, req.params.id);
    await requireMember(id, req.auth.userId);
    const { after, limit: take } = parse(
      z.object({ after: zId.optional(), limit: z.coerce.number().int().min(1).max(1000).default(1000) }),
      req.query,
    );
    const rows = await prisma.member.findMany({
      where: { guildId: id, ...(after ? { userId: { gt: after } } : {}) },
      include: { roles: { select: { roleId: true } }, user: { select: publicUserSelect } },
      orderBy: { userId: 'asc' },
      take,
    });
    return rows.map((m) => ({ member: toMember(m), user: toPublicUser(m.user) }));
  });

  app.patch<{ Params: { id: string; userId: string } }>('/guilds/:id/members/:userId', async (req) => {
    const guildId = parse(zId, req.params.id);
    const actor = req.auth.userId;
    const targetId = req.params.userId === '@me' ? actor : parse(zId, req.params.userId);
    const body = parse(
      z
        .object({
          nick: z.string().trim().max(LIMITS.NICK_MAX).nullable(),
          roles: z.array(zId).max(LIMITS.ROLES_PER_GUILD),
          timeoutUntil: z.string().datetime().nullable(),
          mute: z.boolean(),
          deaf: z.boolean(),
          reason: z.string().max(512).optional(),
        })
        .partial(),
      req.body,
    );
    const g = await requireMember(guildId, actor);
    if (!g.members.has(targetId)) throw notFound('Membro');
    const perms = computeBasePermissions({ guildId, ownerId: g.ownerId, userId: actor, roles: g.roles, memberRoleIds: g.members.get(actor)!.roleIds });
    const data: { nick?: string | null; timeoutUntil?: Date | null; mute?: boolean; deaf?: boolean } = {};
    const self = targetId === actor;

    if (body.nick !== undefined) {
      if (self) {
        if (!has(perms, P.CHANGE_NICKNAME) && !has(perms, P.MANAGE_NICKNAMES)) throw forbidden();
      } else {
        if (!has(perms, P.MANAGE_NICKNAMES)) throw forbidden();
        requireHierarchy(g, actor, targetId);
      }
      data.nick = body.nick || null;
    }
    if (body.timeoutUntil !== undefined) {
      if (!has(perms, P.MODERATE_MEMBERS) || self) throw forbidden();
      requireHierarchy(g, actor, targetId);
      const until = body.timeoutUntil ? new Date(body.timeoutUntil) : null;
      if (until && until.getTime() > Date.now() + 28 * 86400_000) throw badRequest('O castigo pode durar no máximo 28 dias.');
      data.timeoutUntil = until;
    }
    if (body.mute !== undefined) {
      if (!has(perms, P.MUTE_MEMBERS)) throw forbidden();
      if (!self) requireHierarchy(g, actor, targetId);
      data.mute = body.mute;
    }
    if (body.deaf !== undefined) {
      if (!has(perms, P.DEAFEN_MEMBERS)) throw forbidden();
      if (!self) requireHierarchy(g, actor, targetId);
      data.deaf = body.deaf;
    }
    let rolesChanged = false;
    if (body.roles !== undefined) {
      if (!has(perms, P.MANAGE_ROLES)) throw forbidden();
      if (!self) requireHierarchy(g, actor, targetId);
      const current = new Set(g.members.get(targetId)!.roleIds);
      const next = new Set(body.roles.filter((r) => r !== guildId));
      const changed = [...new Set([...current, ...next])].filter((r) => current.has(r) !== next.has(r));
      for (const rid of changed) {
        const role = g.roles.find((r) => r.id === rid);
        if (!role) throw badRequest('Cargo inválido.');
        requireRoleBelow(g, actor, role.position);
      }
      if (changed.length) {
        rolesChanged = true;
        await prisma.$transaction([
          prisma.memberRole.deleteMany({ where: { guildId, userId: targetId } }),
          prisma.memberRole.createMany({ data: [...next].map((roleId) => ({ guildId, userId: targetId, roleId })) }),
        ]);
        await audit(guildId, actor, 'MEMBER_ROLE_UPDATE', targetId, {
          added: [...next].filter((r) => !current.has(r)),
          removed: [...current].filter((r) => !next.has(r)),
        }, body.reason);
      }
    }
    if (Object.keys(data).length) {
      await prisma.member.update({ where: { guildId_userId: { guildId, userId: targetId } }, data });
      await audit(guildId, actor, data.timeoutUntil !== undefined ? 'MEMBER_TIMEOUT' : 'MEMBER_UPDATE', targetId, data, body.reason);
    }
    invalidateGuild(guildId);
    await emitMemberUpdate(guildId, targetId);
    if (rolesChanged || data.timeoutUntil !== undefined) await refreshGuildFor(guildId, [targetId]);
    if (data.mute !== undefined || data.deaf !== undefined) {
      const m = await prisma.member.findUniqueOrThrow({ where: { guildId_userId: { guildId, userId: targetId } } });
      await voiceHooks.onServerVoiceState(guildId, targetId, m.mute, m.deaf);
    }
    if (data.timeoutUntil) await voiceHooks.onTimeout(guildId, targetId);
    if (rolesChanged) await voiceHooks.onPermissionsChanged(guildId);
    const m = await memberWithUser(guildId, targetId);
    return toMember(m!);
  });

  app.delete<{ Params: { id: string; userId: string } }>('/guilds/:id/members/:userId', async (req) => {
    const guildId = parse(zId, req.params.id);
    const actor = req.auth.userId;
    if (req.params.userId === '@me') {
      const g = await requireMember(guildId, actor);
      if (g.ownerId === actor) throw badRequest('Transfira a posse ou exclua o servidor antes de sair.', undefined, 'OWNER_CANNOT_LEAVE');
      await removeMember(guildId, actor);
      return { ok: true };
    }
    const targetId = parse(zId, req.params.userId);
    const g = await requireGuildPerm(guildId, actor, P.KICK_MEMBERS);
    if (!g.members.has(targetId)) throw notFound('Membro');
    requireHierarchy(g, actor, targetId);
    const reason = (req.query as { reason?: string })?.reason?.slice(0, 512) ?? null;
    await removeMember(guildId, targetId);
    await audit(guildId, actor, 'MEMBER_KICK', targetId, null, reason);
    return { ok: true };
  });

  // ───────────── Banimentos ─────────────
  app.get<{ Params: { id: string } }>('/guilds/:id/bans', async (req): Promise<Ban[]> => {
    const guildId = parse(zId, req.params.id);
    await requireGuildPerm(guildId, req.auth.userId, P.BAN_MEMBERS);
    const bans = await prisma.ban.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' } });
    const users = await prisma.user.findMany({ where: { id: { in: bans.map((b) => b.userId) } }, select: publicUserSelect });
    const map = new Map(users.map((u) => [u.id, u]));
    return bans.filter((b) => map.has(b.userId)).map((b) => ({ user: toPublicUser(map.get(b.userId)!), reason: b.reason, createdAt: b.createdAt.toISOString() }));
  });

  app.put<{ Params: { id: string; userId: string } }>('/guilds/:id/bans/:userId', async (req) => {
    const guildId = parse(zId, req.params.id);
    const targetId = parse(zId, req.params.userId);
    const actor = req.auth.userId;
    const body = parse(
      z.object({ reason: z.string().max(512).optional(), deleteMessageHours: z.number().int().min(0).max(168).default(0) }),
      req.body ?? {},
    );
    const g = await requireGuildPerm(guildId, actor, P.BAN_MEMBERS);
    if (targetId === actor) throw badRequest('Você não pode se banir.');
    if (g.members.has(targetId)) requireHierarchy(g, actor, targetId);
    else if (targetId === g.ownerId) throw forbidden();
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw notFound('Usuário');
    await prisma.ban.upsert({
      where: { guildId_userId: { guildId, userId: targetId } },
      create: { guildId, userId: targetId, reason: body.reason ?? null, moderatorId: actor },
      update: { reason: body.reason ?? null, moderatorId: actor },
    });
    if (g.members.has(targetId)) await removeMember(guildId, targetId);
    if (body.deleteMessageHours > 0) {
      const since = new Date(Date.now() - body.deleteMessageHours * 3600_000);
      const msgs = await prisma.message.findMany({
        where: { authorId: targetId, createdAt: { gte: since }, channel: { guildId } },
        select: { id: true, channelId: true },
      });
      await prisma.message.deleteMany({ where: { id: { in: msgs.map((m) => m.id) } } });
      const byChannel = new Map<string, string[]>();
      for (const m of msgs) byChannel.set(m.channelId, [...(byChannel.get(m.channelId) ?? []), m.id]);
      for (const [channelId, ids] of byChannel) await bus.toChannel(channelId, 'MESSAGE_DELETE_BULK', { channelId, ids });
    }
    await audit(guildId, actor, 'MEMBER_BAN', targetId, null, body.reason ?? null);
    await bus.toGuild(guildId, 'GUILD_BAN_ADD', { guildId, userId: targetId });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; userId: string } }>('/guilds/:id/bans/:userId', async (req) => {
    const guildId = parse(zId, req.params.id);
    const targetId = parse(zId, req.params.userId);
    await requireGuildPerm(guildId, req.auth.userId, P.BAN_MEMBERS);
    await prisma.ban.deleteMany({ where: { guildId, userId: targetId } });
    await audit(guildId, req.auth.userId, 'MEMBER_UNBAN', targetId);
    await bus.toGuild(guildId, 'GUILD_BAN_REMOVE', { guildId, userId: targetId });
    return { ok: true };
  });

  // ───────────── Cargos ─────────────
  app.get<{ Params: { id: string } }>('/guilds/:id/roles', async (req) => {
    const guildId = parse(zId, req.params.id);
    await requireMember(guildId, req.auth.userId);
    return (await prisma.role.findMany({ where: { guildId }, orderBy: { position: 'asc' } })).map(toRole);
  });

  const zRole = z.object({
    name: z.string().trim().min(1).max(LIMITS.ROLE_NAME_MAX),
    color: zColor.nullable(),
    permissions: z.string().regex(/^\d{1,20}$/),
    hoist: z.boolean(),
    mentionable: z.boolean(),
  });

  app.post<{ Params: { id: string } }>('/guilds/:id/roles', async (req) => {
    const guildId = parse(zId, req.params.id);
    const actor = req.auth.userId;
    const g = await requireGuildPerm(guildId, actor, P.MANAGE_ROLES);
    const body = parse(zRole.partial(), req.body);
    if (g.roles.length >= LIMITS.ROLES_PER_GUILD) throw badRequest('Limite de cargos atingido.');
    const perms = body.permissions ? BigInt(body.permissions) & ALL_PERMISSIONS : 0n;
    await assertCanGrant(guildId, actor, perms);
    // novo cargo entra logo abaixo do maior cargo do ator (ou no topo, para o dono)
    const myPos = rolePosition(g, actor);
    const position = Number.isFinite(myPos) ? Math.max(1, myPos) : Math.max(0, ...g.roles.map((r) => r.position)) + 1;
    await prisma.role.updateMany({ where: { guildId, position: { gte: position }, NOT: { id: guildId } }, data: { position: { increment: 1 } } });
    const role = await prisma.role.create({
      data: {
        id: newId(),
        guildId,
        name: body.name ?? 'novo cargo',
        color: body.color ?? null,
        permissions: perms,
        hoist: body.hoist ?? false,
        mentionable: body.mentionable ?? false,
        position,
      },
    });
    await audit(guildId, actor, 'ROLE_CREATE', role.id, { name: role.name });
    invalidateGuild(guildId);
    const all = await prisma.role.findMany({ where: { guildId } });
    for (const r of all) await bus.toGuild(guildId, r.id === role.id ? 'GUILD_ROLE_CREATE' : 'GUILD_ROLE_UPDATE', toRole(r));
    return toRole(role);
  });

  app.patch<{ Params: { id: string } }>('/guilds/:id/roles', async (req) => {
    const guildId = parse(zId, req.params.id);
    const actor = req.auth.userId;
    const g = await requireGuildPerm(guildId, actor, P.MANAGE_ROLES);
    const list = parse(z.array(z.object({ id: zId, position: z.number().int().min(1).max(1000) })).max(LIMITS.ROLES_PER_GUILD), req.body);
    for (const item of list) {
      const role = g.roles.find((r) => r.id === item.id);
      if (!role || role.id === guildId) throw badRequest('Cargo inválido.');
      requireRoleBelow(g, actor, role.position);
      requireRoleBelow(g, actor, item.position);
    }
    await prisma.$transaction(list.map((i) => prisma.role.update({ where: { id: i.id }, data: { position: i.position } })));
    await audit(guildId, actor, 'ROLE_REORDER', null, { roles: list });
    const roles = await prisma.role.findMany({ where: { guildId } });
    invalidateGuild(guildId);
    for (const r of roles) await bus.toGuild(guildId, 'GUILD_ROLE_UPDATE', toRole(r));
    return roles.map(toRole);
  });

  app.patch<{ Params: { id: string; roleId: string } }>('/guilds/:id/roles/:roleId', async (req) => {
    const guildId = parse(zId, req.params.id);
    const roleId = parse(zId, req.params.roleId);
    const actor = req.auth.userId;
    const g = await requireGuildPerm(guildId, actor, P.MANAGE_ROLES);
    const role = g.roles.find((r) => r.id === roleId);
    if (!role) throw notFound('Cargo');
    if (roleId !== guildId) requireRoleBelow(g, actor, role.position);
    const body = parse(zRole.partial(), req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.permissions !== undefined) {
      const next = BigInt(body.permissions) & ALL_PERMISSIONS;
      const prev = BigInt(role.permissions);
      await assertCanGrant(guildId, actor, next & ~prev);
      data.permissions = next;
    }
    if (roleId === guildId) {
      delete data.name;
      delete data.hoist;
      delete data.mentionable;
      delete data.color;
    }
    const updated = await prisma.role.update({ where: { id: roleId }, data });
    await audit(guildId, actor, 'ROLE_UPDATE', roleId, body);
    await bus.toGuild(guildId, 'GUILD_ROLE_UPDATE', toRole(updated));
    if (body.permissions !== undefined) {
      await refreshGuildFor(guildId);
      await voiceHooks.onPermissionsChanged(guildId);
    } else invalidateGuild(guildId);
    return toRole(updated);
  });

  app.delete<{ Params: { id: string; roleId: string } }>('/guilds/:id/roles/:roleId', async (req) => {
    const guildId = parse(zId, req.params.id);
    const roleId = parse(zId, req.params.roleId);
    const actor = req.auth.userId;
    if (roleId === guildId) throw badRequest('O cargo @everyone não pode ser excluído.');
    const g = await requireGuildPerm(guildId, actor, P.MANAGE_ROLES);
    const role = g.roles.find((r) => r.id === roleId);
    if (!role) throw notFound('Cargo');
    requireRoleBelow(g, actor, role.position);
    const roleRow = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true } });
    await prisma.role.delete({ where: { id: roleId } });
    await prisma.permissionOverwrite.deleteMany({ where: { targetId: roleId, channel: { guildId } } });
    await audit(guildId, actor, 'ROLE_DELETE', roleId, { name: roleRow?.name ?? null });
    await bus.toGuild(guildId, 'GUILD_ROLE_DELETE', { guildId, roleId });
    await refreshGuildFor(guildId);
    await voiceHooks.onPermissionsChanged(guildId);
    return { ok: true };
  });

  // ───────────── Canais ─────────────
  app.post<{ Params: { id: string } }>('/guilds/:id/channels', async (req) => {
    const guildId = parse(zId, req.params.id);
    const actor = req.auth.userId;
    await requireGuildPerm(guildId, actor, P.MANAGE_CHANNELS);
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(LIMITS.CHANNEL_NAME_MAX),
        type: z.enum(['text', 'voice', 'video', 'category']),
        parentId: zId.nullable().optional(),
        topic: z.string().max(LIMITS.CHANNEL_TOPIC_MAX).optional(),
        private: z.boolean().optional(),
        userLimit: z.number().int().min(0).max(LIMITS.VOICE_USER_LIMIT_MAX).optional(),
      }),
      req.body,
    );
    const count = await prisma.channel.count({ where: { guildId } });
    if (count >= LIMITS.CHANNELS_PER_GUILD) throw badRequest('Limite de canais atingido.');
    let parent = null;
    if (body.parentId) {
      parent = await prisma.channel.findFirst({ where: { id: body.parentId, guildId, type: 'CATEGORY' }, include: { overwrites: true } });
      if (!parent) throw badRequest('Categoria inválida.');
      if (body.type === 'category') throw badRequest('Categorias não podem ficar dentro de categorias.');
    }
    const siblings = await prisma.channel.count({ where: { guildId, parentId: body.parentId ?? null } });
    const id = newId();
    const overwrites: { targetId: string; type: 'ROLE' | 'MEMBER'; allow: bigint; deny: bigint }[] = [];
    if (parent) for (const o of parent.overwrites) overwrites.push({ targetId: o.targetId, type: o.type, allow: o.allow, deny: o.deny });
    if (body.private) {
      const ev = overwrites.find((o) => o.targetId === guildId);
      if (ev) ev.deny |= P.VIEW_CHANNEL;
      else overwrites.push({ targetId: guildId, type: 'ROLE', allow: 0n, deny: P.VIEW_CHANNEL });
      if (!overwrites.find((o) => o.targetId === actor))
        overwrites.push({ targetId: actor, type: 'MEMBER', allow: P.VIEW_CHANNEL | P.SEND_MESSAGES | P.CONNECT, deny: 0n });
    }
    const ch = await prisma.channel.create({
      data: {
        id,
        guildId,
        type: channelTypeToDb[body.type] as 'TEXT',
        name: body.type === 'text' ? normalizeTextChannelName(body.name) : body.name,
        topic: body.topic ?? '',
        parentId: body.parentId ?? null,
        position: siblings,
        userLimit: body.userLimit ?? 0,
        overwrites: { create: overwrites },
      },
      include: { overwrites: true },
    });
    invalidateGuild(guildId);
    await audit(guildId, actor, 'CHANNEL_CREATE', id, { name: ch.name, type: body.type });
    await bus.toUsers(await usersWhoCanView(id), 'CHANNEL_CREATE', toChannel(ch));
    return toChannel(ch);
  });

  app.patch<{ Params: { id: string } }>('/guilds/:id/channels', async (req) => {
    const guildId = parse(zId, req.params.id);
    const actor = req.auth.userId;
    await requireGuildPerm(guildId, actor, P.MANAGE_CHANNELS);
    const list = parse(
      z.array(z.object({ id: zId, position: z.number().int().min(0).max(1000), parentId: zId.nullable().optional() })).max(LIMITS.CHANNELS_PER_GUILD),
      req.body,
    );
    const channels = await prisma.channel.findMany({ where: { guildId } });
    const byId = new Map(channels.map((c) => [c.id, c]));
    for (const item of list) {
      const c = byId.get(item.id);
      if (!c) throw badRequest('Canal inválido.');
      if (item.parentId) {
        const p = byId.get(item.parentId);
        if (!p || p.type !== 'CATEGORY' || c.type === 'CATEGORY') throw badRequest('Categoria inválida.');
      }
    }
    await prisma.$transaction(
      list.map((i) =>
        prisma.channel.update({ where: { id: i.id }, data: { position: i.position, ...(i.parentId !== undefined ? { parentId: i.parentId } : {}) } }),
      ),
    );
    invalidateGuild(guildId);
    const updated = await prisma.channel.findMany({ where: { id: { in: list.map((l) => l.id) } }, include: { overwrites: true } });
    for (const c of updated) await bus.toChannel(c.id, 'CHANNEL_UPDATE', toChannel(c));
    return { ok: true };
  });

  // ───────────── Convites ─────────────
  app.get<{ Params: { id: string } }>('/guilds/:id/invites', async (req) => {
    const guildId = parse(zId, req.params.id);
    await requireGuildPerm(guildId, req.auth.userId, P.MANAGE_GUILD);
    const rows = await prisma.invite.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' } });
    const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.inviterId!).filter(Boolean) } }, select: publicUserSelect });
    const map = new Map(users.map((u) => [u.id, toPublicUser(u)]));
    return rows
      .filter((r) => !r.expiresAt || r.expiresAt.getTime() > Date.now())
      .map((r) => ({
        code: r.code,
        channelId: r.channelId,
        inviter: r.inviterId ? map.get(r.inviterId) ?? null : null,
        uses: r.uses,
        maxUses: r.maxUses,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }));
  });

  // ───────────── Emojis e figurinhas ─────────────
  for (const kind of ['emojis', 'stickers'] as const) {
    app.post<{ Params: { id: string } }>(`/guilds/:id/${kind}`, async (req) => {
      const guildId = parse(zId, req.params.id);
      const actor = req.auth.userId;
      await requireGuildPerm(guildId, actor, P.MANAGE_EMOJIS);
      await limit(`emoji-up:${guildId}`, 50, 3600);
      const max = kind === 'emojis' ? LIMITS.EMOJI_MAX_SIZE : LIMITS.STICKER_MAX_SIZE;
      const { buffer, fields, filename } = await readSingleFile(req, max);
      const rawName = (fields.name || filename.replace(/\.[^.]+$/, '')).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
      if (rawName.length < 2) throw badRequest('Nome precisa ter pelo menos 2 caracteres.', { name: 'Nome inválido' });
      if (kind === 'emojis') {
        const n = await prisma.emoji.count({ where: { guildId } });
        if (n >= LIMITS.EMOJIS_PER_GUILD) throw badRequest('Limite de emojis atingido.');
        const emojiId = newId();
        // chave determinística: qualquer cliente monta a URL a partir do ID em <:nome:id>
        const img = await processImage(buffer, { prefix: 'emojis', name: emojiId, width: 128, height: 128, fit: 'contain', maxBytes: max });
        const e = await prisma.emoji.create({ data: { id: emojiId, guildId, name: rawName, imageKey: img.key, animated: img.animated, creatorId: actor } });
        await audit(guildId, actor, 'EMOJI_CREATE', e.id, { name: e.name });
        const all = (await prisma.emoji.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } })).map(toEmoji);
        await bus.toGuild(guildId, 'GUILD_EMOJIS_UPDATE', { guildId, emojis: all });
        return toEmoji(e);
      }
      const n = await prisma.sticker.count({ where: { guildId } });
      if (n >= LIMITS.STICKERS_PER_GUILD) throw badRequest('Limite de figurinhas atingido.');
      const img = await processImage(buffer, { prefix: `stickers/${guildId}`, width: 320, height: 320, fit: 'contain', maxBytes: max });
      const s = await prisma.sticker.create({
        data: { id: newId(), guildId, name: rawName, description: (fields.description ?? '').slice(0, 100), imageKey: img.key, format: img.animated ? 'gif' : 'png', creatorId: actor },
      });
      await audit(guildId, actor, 'STICKER_CREATE', s.id, { name: s.name });
      const all = (await prisma.sticker.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } })).map(toSticker);
      await bus.toGuild(guildId, 'GUILD_STICKERS_UPDATE', { guildId, stickers: all });
      return toSticker(s);
    });

    app.patch<{ Params: { id: string; itemId: string } }>(`/guilds/:id/${kind}/:itemId`, async (req) => {
      const guildId = parse(zId, req.params.id);
      const itemId = parse(zId, req.params.itemId);
      await requireGuildPerm(guildId, req.auth.userId, P.MANAGE_EMOJIS);
      const { name } = parse(z.object({ name: z.string().regex(/^[a-zA-Z0-9_]{2,32}$/, 'Use letras, números e _') }), req.body);
      if (kind === 'emojis') {
        const r = await prisma.emoji.updateMany({ where: { id: itemId, guildId }, data: { name } });
        if (!r.count) throw notFound('Emoji');
        const all = (await prisma.emoji.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } })).map(toEmoji);
        await bus.toGuild(guildId, 'GUILD_EMOJIS_UPDATE', { guildId, emojis: all });
      } else {
        const r = await prisma.sticker.updateMany({ where: { id: itemId, guildId }, data: { name } });
        if (!r.count) throw notFound('Figurinha');
        const all = (await prisma.sticker.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } })).map(toSticker);
        await bus.toGuild(guildId, 'GUILD_STICKERS_UPDATE', { guildId, stickers: all });
      }
      return { ok: true };
    });

    app.delete<{ Params: { id: string; itemId: string } }>(`/guilds/:id/${kind}/:itemId`, async (req) => {
      const guildId = parse(zId, req.params.id);
      const itemId = parse(zId, req.params.itemId);
      await requireGuildPerm(guildId, req.auth.userId, P.MANAGE_EMOJIS);
      if (kind === 'emojis') {
        const e = await prisma.emoji.findFirst({ where: { id: itemId, guildId } });
        if (!e) throw notFound('Emoji');
        await prisma.emoji.delete({ where: { id: itemId } });
        await deleteImage(e.imageKey);
        await audit(guildId, req.auth.userId, 'EMOJI_DELETE', itemId, { name: e.name });
        const all = (await prisma.emoji.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } })).map(toEmoji);
        await bus.toGuild(guildId, 'GUILD_EMOJIS_UPDATE', { guildId, emojis: all });
      } else {
        const s = await prisma.sticker.findFirst({ where: { id: itemId, guildId } });
        if (!s) throw notFound('Figurinha');
        await prisma.sticker.delete({ where: { id: itemId } });
        await deleteImage(s.imageKey);
        await audit(guildId, req.auth.userId, 'STICKER_DELETE', itemId, { name: s.name });
        const all = (await prisma.sticker.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } })).map(toSticker);
        await bus.toGuild(guildId, 'GUILD_STICKERS_UPDATE', { guildId, stickers: all });
      }
      return { ok: true };
    });
  }

  // ───────────── Registro de auditoria ─────────────
  app.get<{ Params: { id: string } }>('/guilds/:id/audit-log', async (req) => {
    const guildId = parse(zId, req.params.id);
    await requireGuildPerm(guildId, req.auth.userId, P.VIEW_AUDIT_LOG);
    const { before } = parse(z.object({ before: zId.optional() }), req.query);
    const rows = await prisma.auditLog.findMany({
      where: { guildId, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const userIds = [...new Set(rows.flatMap((r) => [r.actorId, r.targetId]).filter((x): x is string => !!x))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: publicUserSelect });
    return {
      entries: rows.map((r) => ({
        id: r.id,
        guildId: r.guildId,
        actorId: r.actorId,
        action: r.action,
        targetId: r.targetId,
        reason: r.reason,
        changes: r.changes as Record<string, unknown> | null,
        createdAt: r.createdAt.toISOString(),
      })),
      users: users.map(toPublicUser),
    };
  });
}
