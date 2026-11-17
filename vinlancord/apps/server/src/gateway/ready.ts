import type { ReadyPayload } from '@vinlancord/shared';
import { prisma } from '../lib/db';
import { publicUserSelect, toChannel, toPublicUser, toSelfUser } from '../lib/serialize';
import { buildGuildFull } from '../services/guilds';
import { getPresences, presenceAudience } from '../services/presence';
import { mergeSettings } from '../services/users';
import { dmInclude } from '../services/dm';
import { activeCallsFor, voiceStatesForChannels, voiceStatesForGuilds } from '../voice/service';

export async function buildReady(userId: string, sessionId: string): Promise<ReadyPayload> {
  const [user, memberships, dms, rels, readStates, notif] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.member.findMany({ where: { userId }, select: { guildId: true }, orderBy: { joinedAt: 'asc' } }),
    prisma.channel.findMany({
      where: { recipients: { some: { userId, closed: false } } },
      include: dmInclude,
      orderBy: { lastMessageId: { sort: 'desc', nulls: 'last' } },
      take: 200,
    }),
    prisma.relationship.findMany({ where: { userId }, include: { target: { select: publicUserSelect } } }),
    prisma.readState.findMany({ where: { userId } }),
    prisma.notificationSetting.findMany({ where: { userId } }),
  ]);

  const guilds = (await Promise.all(memberships.map((m) => buildGuildFull(m.guildId, userId)))).filter((g) => !!g);
  const guildIds = new Set(guilds.map((g) => g.id));
  const dmIds = new Set(dms.map((d) => d.id));
  const voiceStates = [...voiceStatesForGuilds(guildIds), ...voiceStatesForChannels(dmIds)];

  const userIds = new Set<string>();
  dms.forEach((d) => d.recipients.forEach((r) => userIds.add(r.userId)));
  voiceStates.forEach((v) => userIds.add(v.userId));
  userIds.delete(userId);
  const users = userIds.size ? await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: publicUserSelect }) : [];

  const audience = await presenceAudience(userId);
  const presences = await getPresences([...new Set([...audience, ...userIds])]);

  const TYPE = { FRIEND: 'friend', INCOMING: 'incoming', OUTGOING: 'outgoing', BLOCKED: 'blocked' } as const;
  return {
    sessionId,
    user: toSelfUser(user),
    settings: mergeSettings(user.settings),
    guilds,
    privateChannels: dms.map(toChannel),
    relationships: rels.map((r) => ({ id: r.targetId, type: TYPE[r.type], user: toPublicUser(r.target), since: r.createdAt.toISOString() })),
    users: users.map(toPublicUser),
    presences,
    voiceStates,
    readStates: readStates.map((r) => ({ channelId: r.channelId, lastReadId: r.lastReadId, mentions: r.mentions })),
    notificationSettings: notif.map((n) => ({
      scopeId: n.scopeId,
      level: (n.level as 'all' | 'mentions' | 'nothing' | null) ?? null,
      muted: n.muted,
      mutedUntil: n.mutedUntil?.toISOString() ?? null,
      suppressEveryone: n.suppressEveryone,
    })),
    calls: activeCallsFor(dmIds),
  };
}
