import { DEFAULT_SETTINGS, type UserSettings } from '@vinlancord/shared';
import { prisma } from '../lib/db';
import { publicUserSelect, toPublicUser } from '../lib/serialize';

export function mergeSettings(raw: unknown): UserSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<UserSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    privacy: { ...DEFAULT_SETTINGS.privacy, ...(s.privacy ?? {}) },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(s.notifications ?? {}) },
  };
}

export async function getSettings(userId: string): Promise<UserSettings> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } });
  return mergeSettings(u?.settings);
}

export async function relationshipBetween(userId: string, targetId: string) {
  return prisma.relationship.findUnique({ where: { userId_targetId: { userId, targetId } } });
}

/** true se qualquer um dos dois bloqueou o outro. */
export async function isBlockedEitherWay(a: string, b: string) {
  const n = await prisma.relationship.count({
    where: {
      type: 'BLOCKED',
      OR: [
        { userId: a, targetId: b },
        { userId: b, targetId: a },
      ],
    },
  });
  return n > 0;
}

export async function areFriends(a: string, b: string) {
  return (await prisma.relationship.count({ where: { userId: a, targetId: b, type: 'FRIEND' } })) > 0;
}

export async function mutualGuildIds(a: string, b: string): Promise<string[]> {
  const rows = await prisma.member.findMany({
    where: { userId: a, guild: { members: { some: { userId: b } } } },
    select: { guildId: true },
  });
  return rows.map((r) => r.guildId);
}

export async function getPublicUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  return u ? toPublicUser(u) : null;
}

export async function getPublicUsers(ids: Iterable<string>) {
  const list = [...new Set(ids)];
  if (!list.length) return [];
  const rows = await prisma.user.findMany({ where: { id: { in: list } }, select: publicUserSelect });
  return rows.map(toPublicUser);
}
