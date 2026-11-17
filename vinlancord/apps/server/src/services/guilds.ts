import { P, has, type GuildFull } from '@vinlancord/shared';
import { prisma, type Prisma } from '../lib/db';
import { newId } from '../lib/ids';
import { toChannel, toEmoji, toGuild, toMember, toRole, toSticker } from '../lib/serialize';
import { bus } from './bus';
import { channelPermsFromSnapshot, getGuild, invalidateGuild } from './perms';

const guildInclude = {
  roles: { orderBy: { position: 'asc' } },
  channels: { include: { overwrites: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] },
  emojis: { orderBy: { createdAt: 'asc' } },
  stickers: { orderBy: { createdAt: 'asc' } },
  _count: { select: { members: true } },
} satisfies Prisma.GuildInclude;

/** Monta a visão completa do servidor para cada usuário (canais filtrados por permissão). */
export async function buildGuildFullFor(guildId: string, userIds: string[]): Promise<Map<string, GuildFull>> {
  const out = new Map<string, GuildFull>();
  if (!userIds.length) return out;
  const [g, members, snap] = await Promise.all([
    prisma.guild.findUnique({ where: { id: guildId }, include: guildInclude }),
    prisma.member.findMany({ where: { guildId, userId: { in: userIds } }, include: { roles: { select: { roleId: true } } } }),
    getGuild(guildId),
  ]);
  if (!g || !snap) return out;
  const base = toGuild(g, g._count.members);
  const roles = g.roles.map(toRole);
  const emojis = g.emojis.map(toEmoji);
  const stickers = g.stickers.map(toSticker);
  const channels = g.channels.map((c) => ({ dto: toChannel(c), id: c.id }));
  for (const m of members) {
    out.set(m.userId, {
      ...base,
      roles,
      emojis,
      stickers,
      me: toMember(m),
      channels: channels.filter((c) => has(channelPermsFromSnapshot(snap, c.id, m.userId), P.VIEW_CHANNEL)).map((c) => c.dto),
    });
  }
  return out;
}

export async function buildGuildFull(guildId: string, userId: string) {
  return (await buildGuildFullFor(guildId, [userId])).get(userId) ?? null;
}

/** Reenvia o servidor completo (útil quando permissões mudam e a visibilidade de canais pode mudar). */
export async function refreshGuildFor(guildId: string, userIds?: string[]) {
  invalidateGuild(guildId);
  const snap = await getGuild(guildId);
  if (!snap) return;
  const targets = userIds ?? [...snap.members.keys()];
  const chunk = 50;
  for (let i = 0; i < targets.length; i += chunk) {
    const fulls = await buildGuildFullFor(guildId, targets.slice(i, i + chunk));
    for (const [uid, full] of fulls) await bus.toUser(uid, 'GUILD_CREATE', full);
  }
}

export async function audit(
  guildId: string,
  actorId: string | null,
  action: string,
  targetId: string | null = null,
  changes: Record<string, unknown> | null = null,
  reason: string | null = null,
) {
  await prisma.auditLog
    .create({
      data: {
        id: newId(),
        guildId,
        actorId,
        action,
        targetId,
        changes: changes ? JSON.parse(JSON.stringify(changes, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) : undefined,
        reason: reason?.slice(0, 512) ?? null,
      },
    })
    .catch(() => {});
}

export async function memberWithUser(guildId: string, userId: string) {
  return prisma.member.findUnique({
    where: { guildId_userId: { guildId, userId } },
    include: { roles: { select: { roleId: true } } },
  });
}

export async function emitMemberUpdate(guildId: string, userId: string) {
  const m = await memberWithUser(guildId, userId);
  if (m) await bus.toGuild(guildId, 'GUILD_MEMBER_UPDATE', { member: toMember(m) });
}
