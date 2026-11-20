import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIMITS, P, has, type UserProfile, type NotificationSetting } from '@vinlancord/shared';
import { prisma, Prisma } from '../lib/db';
import { badRequest, conflict, invalidPassword, notFound } from '../lib/errors';
import { hashPassword, requireAuth, verifyPassword, invalidateUserSessions } from '../lib/auth';
import { limit } from '../lib/ratelimit';
import { deleteImage, processImage } from '../lib/media';
import { readSingleFile } from '../lib/upload';
import { publicUserSelect, toPublicUser, toSelfUser, imageUrl } from '../lib/serialize';
import { parse, zColor, zDisplayName, zEmail, zHttpUrl, zId, zPassword, zUsername } from '../lib/validate';
import { sendVerificationEmail } from '../lib/mailer';
import { newId, randomToken, sha256 } from '../lib/ids';
import { bus } from '../services/bus';
import { presenceAudience, refreshUserPresence } from '../services/presence';
import { areFriends, getSettings, mergeSettings, mutualGuildIds, relationshipBetween } from '../services/users';
import { hydrateMessages, messageInclude, type MessageRow } from '../services/messages';
import { channelPermissions } from '../services/perms';
import { revokeAllSessions } from './auth';

export async function broadcastUserUpdate(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await bus.toUser(userId, 'USER_UPDATE', toSelfUser(user));
  const audience = (await presenceAudience(userId)).filter((id) => id !== userId);
  await bus.toUsers(audience, 'USER_PUBLIC_UPDATE', toPublicUser(user));
  return user;
}

const zUnit = z.number().min(0).max(1);
const zAppearance = z.object({
  preset: z.string().max(40),
  mode: z.enum(['dark', 'light']),
  colors: z.record(z.string().regex(/^[a-z0-9-]{1,24}$/), zColor).refine((o) => Object.keys(o).length <= 40, 'Cores demais'),
  displayFont: z.string().regex(/^[a-z0-9-]{1,32}$/),
  bodyFont: z.string().regex(/^[a-z0-9-]{1,32}$/),
  corners: z.enum(['round', 'soft', 'sharp', 'cut']),
  serverShape: z.enum(['circle', 'squircle', 'diamond', 'hexagon', 'shield']),
  avatarShape: z.enum(['circle', 'squircle', 'diamond', 'hexagon', 'shield']),
  layout: z.enum(['floating', 'classic']),
  panelOpacity: z.number().min(0.3).max(1),
  blur: z.number().min(0).max(32),
  glow: zUnit,
  ornaments: z.boolean(),
  effect: z.enum(['none', 'feathers', 'ink', 'embers', 'ash', 'sigils', 'snow', 'rain', 'petals', 'stars']),
  effectIntensity: z.number().min(0).max(2),
  fog: z.boolean(),
  grain: zUnit,
  vignette: zUnit,
  scanlines: z.boolean(),
  transition: z.enum(['none', 'fade', 'rise', 'slash', 'ink', 'shutter']),
  animations: z.enum(['full', 'reduced', 'off']),
  animSpeed: z.number().min(0.25).max(3),
  messageStyle: z.enum(['flat', 'cards', 'letter']),
  chapterNumbers: z.boolean(),
  cursorTrail: z.boolean(),
  bgDim: zUnit,
  bgBlur: z.number().min(0).max(40),
  customCss: z.string().max(20_000),
});

const zSettingsPatch = z
  .object({
    appearance: zAppearance,
    theme: z.string().max(32),
    mode: z.enum(['dark', 'light', 'system']),
    accent: zColor,
    fontScale: z.number().min(0.8).max(1.4),
    compact: z.boolean(),
    reduceMotion: z.boolean(),
    showSeconds: z.boolean(),
    privacy: z
      .object({
        dmsFrom: z.enum(['everyone', 'server_members', 'friends']),
        friendRequestsFrom: z.enum(['everyone', 'server_members', 'nobody']),
        profileDetails: z.enum(['everyone', 'friends']),
        showActivity: z.boolean(),
        showRecentActivity: z.boolean(),
      })
      .partial(),
    notifications: z
      .object({
        desktop: z.boolean(),
        sounds: z.boolean(),
        messageSound: z.boolean(),
        mentionSound: z.boolean(),
        callSound: z.boolean(),
        voiceJoinSound: z.boolean(),
        friendRequests: z.boolean(),
        flashTaskbar: z.boolean(),
        dmLevel: z.enum(['all', 'nothing']),
      })
      .partial(),
    guildFolders: z.array(zId).max(200),
    customGames: z.array(z.object({ process: z.string().min(1).max(260), name: z.string().min(1).max(128) })).max(50),
    favoriteGifs: z
      .array(z.object({ url: zHttpUrl, preview: zHttpUrl, width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096) }))
      .max(100),
  })
  .partial();

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/users/@me', async (req) => toSelfUser(await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } })));

  app.patch('/users/@me', async (req) => {
    const body = parse(
      z
        .object({
          displayName: zDisplayName,
          bio: z.string().max(LIMITS.BIO_MAX),
          pronouns: z.string().trim().max(LIMITS.PRONOUNS_MAX),
          accentColor: zColor.nullable(),
          bannerColor: zColor.nullable(),
          links: z.array(z.object({ label: z.string().trim().min(1).max(32), url: zHttpUrl })).max(LIMITS.LINKS_MAX),
        })
        .partial(),
      req.body,
    );
    await prisma.user.update({ where: { id: req.auth.userId }, data: body });
    return toSelfUser(await broadcastUserUpdate(req.auth.userId));
  });

  app.patch('/users/@me/username', async (req) => {
    const { username, password } = parse(z.object({ username: zUsername, password: z.string().min(1).max(256) }), req.body);
    await limit(`username:${req.auth.userId}`, 5, 3600, 'Você mudou de nome várias vezes. Tente mais tarde.');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!(await verifyPassword(user.passwordHash, password))) throw invalidPassword();
    if (username === user.username) return toSelfUser(user);
    const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (taken) throw conflict('Nome de usuário indisponível.', 'ALREADY_EXISTS', { username: 'Este nome de usuário já está em uso' });
    await prisma.user.update({ where: { id: user.id }, data: { username, usernameChangedAt: new Date() } });
    return toSelfUser(await broadcastUserUpdate(user.id));
  });

  app.patch('/users/@me/password', async (req) => {
    const { currentPassword, newPassword } = parse(
      z.object({ currentPassword: z.string().min(1).max(256), newPassword: zPassword }),
      req.body,
    );
    await limit(`password:${req.auth.userId}`, 5, 3600);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!(await verifyPassword(user.passwordHash, currentPassword))) throw invalidPassword();
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    // Por segurança, encerra todas as outras sessões.
    await revokeAllSessions(user.id, req.auth.sessionId);
    return { ok: true };
  });

  app.patch('/users/@me/email', async (req) => {
    const { email, password } = parse(z.object({ email: zEmail, password: z.string().min(1).max(256) }), req.body);
    await limit(`email:${req.auth.userId}`, 3, 3600);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!(await verifyPassword(user.passwordHash, password))) throw invalidPassword();
    if (email !== user.email) {
      const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (taken) throw conflict('E-mail em uso.', 'ALREADY_EXISTS', { email: 'Este e-mail já está em uso' });
      await prisma.user.update({ where: { id: user.id }, data: { email, emailVerified: false } });
      invalidateUserSessions(user.id);
      const token = randomToken(32);
      await prisma.emailToken.create({
        data: { id: newId(), userId: user.id, type: 'VERIFY_EMAIL', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 48 * 3600_000) },
      });
      await sendVerificationEmail(email, user.displayName, token).catch(() => {});
    }
    return toSelfUser(await broadcastUserUpdate(user.id));
  });

  app.put('/users/@me/status', async (req) => {
    const { status } = parse(z.object({ status: z.enum(['online', 'idle', 'dnd', 'invisible']) }), req.body);
    await prisma.user.update({ where: { id: req.auth.userId }, data: { status } });
    await refreshUserPresence(req.auth.userId);
    return toSelfUser(await broadcastUserUpdate(req.auth.userId));
  });

  app.put('/users/@me/custom-status', async (req) => {
    const body = parse(
      z
        .object({
          text: z.string().trim().max(LIMITS.CUSTOM_STATUS_MAX).nullable().optional(),
          emoji: z.string().max(64).nullable().optional(),
          expiresAt: z.string().datetime().nullable().optional(),
        })
        .nullable(),
      req.body,
    );
    const value = body && (body.text || body.emoji) ? { text: body.text ?? null, emoji: body.emoji ?? null, expiresAt: body.expiresAt ?? null } : null;
    await prisma.user.update({ where: { id: req.auth.userId }, data: { customStatus: value ? value : Prisma.DbNull } });
    await refreshUserPresence(req.auth.userId);
    return toSelfUser(await broadcastUserUpdate(req.auth.userId));
  });

  app.post('/users/@me/avatar', async (req) => {
    await limit(`avatar:${req.auth.userId}`, 10, 600);
    const { buffer } = await readSingleFile(req, LIMITS.AVATAR_MAX_SIZE);
    const img = await processImage(buffer, { prefix: `avatars/${req.auth.userId}`, width: 256, height: 256, fit: 'cover', maxBytes: LIMITS.AVATAR_MAX_SIZE });
    const old = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId }, select: { avatarKey: true } });
    await prisma.user.update({ where: { id: req.auth.userId }, data: { avatarKey: img.key } });
    await deleteImage(old.avatarKey);
    return toSelfUser(await broadcastUserUpdate(req.auth.userId));
  });

  app.delete('/users/@me/avatar', async (req) => {
    const old = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId }, select: { avatarKey: true } });
    await prisma.user.update({ where: { id: req.auth.userId }, data: { avatarKey: null } });
    await deleteImage(old.avatarKey);
    return toSelfUser(await broadcastUserUpdate(req.auth.userId));
  });

  app.post('/users/@me/banner', async (req) => {
    await limit(`banner:${req.auth.userId}`, 10, 600);
    const { buffer } = await readSingleFile(req, LIMITS.BANNER_MAX_SIZE);
    const img = await processImage(buffer, { prefix: `banners/${req.auth.userId}`, width: 1200, height: 480, fit: 'cover', maxBytes: LIMITS.BANNER_MAX_SIZE });
    const old = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId }, select: { bannerKey: true } });
    await prisma.user.update({ where: { id: req.auth.userId }, data: { bannerKey: img.key } });
    await deleteImage(old.bannerKey);
    return toSelfUser(await broadcastUserUpdate(req.auth.userId));
  });

  app.delete('/users/@me/banner', async (req) => {
    const old = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId }, select: { bannerKey: true } });
    await prisma.user.update({ where: { id: req.auth.userId }, data: { bannerKey: null } });
    await deleteImage(old.bannerKey);
    return toSelfUser(await broadcastUserUpdate(req.auth.userId));
  });

  app.get('/users/@me/settings', async (req) => getSettings(req.auth.userId));

  app.patch('/users/@me/settings', async (req) => {
    const patch = parse(zSettingsPatch, req.body);
    const current = await getSettings(req.auth.userId);
    const next = mergeSettings({
      ...current,
      ...patch,
      privacy: { ...current.privacy, ...(patch.privacy ?? {}) },
      notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
    });
    await prisma.user.update({ where: { id: req.auth.userId }, data: { settings: next as object } });
    await bus.toUser(req.auth.userId, 'USER_SETTINGS_UPDATE', next);
    if (patch.privacy?.showActivity !== undefined) await refreshUserPresence(req.auth.userId);
    return next;
  });

  app.delete('/users/@me', async (req) => {
    const { password } = parse(z.object({ password: z.string().min(1).max(256) }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!(await verifyPassword(user.passwordHash, password))) throw invalidPassword();
    const owned = await prisma.guild.count({ where: { ownerId: user.id } });
    if (owned) throw badRequest('Transfira ou exclua os servidores que você possui antes de excluir a conta.', undefined, 'OWNS_GUILDS');
    await revokeAllSessions(user.id);
    await deleteImage(user.avatarKey);
    await deleteImage(user.bannerKey);
    await prisma.user.delete({ where: { id: user.id } });
    return { ok: true };
  });

  app.get('/users/search', async (req) => {
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(64) }), req.query);
    const me = req.auth.userId;
    const needle = q.replace(/^@/, '').toLowerCase();
    const [friends, guilds] = await Promise.all([
      prisma.relationship.findMany({ where: { userId: me, type: 'FRIEND' }, select: { targetId: true } }),
      prisma.member.findMany({ where: { userId: me }, select: { guildId: true } }),
    ]);
    const rows = await prisma.user.findMany({
      where: {
        system: false,
        AND: [
          {
            OR: [
              { username: needle },
              { id: /^\d+$/.test(needle) ? needle : undefined },
              {
                AND: [
                  {
                    OR: [
                      { username: { contains: needle, mode: 'insensitive' } },
                      { displayName: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                  {
                    OR: [
                      { id: { in: friends.map((f) => f.targetId) } },
                      { memberships: { some: { guildId: { in: guilds.map((g) => g.guildId) } } } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      select: publicUserSelect,
      take: 25,
      orderBy: { username: 'asc' },
    });
    return rows.map(toPublicUser);
  });

  app.get('/users/@me/mentions', async (req) => {
    const { before, limit: take } = parse(
      z.object({ before: zId.optional(), limit: z.coerce.number().int().min(1).max(50).default(25) }),
      req.query,
    );
    const me = req.auth.userId;
    const memberships = await prisma.member.findMany({ where: { userId: me }, select: { guildId: true, roles: { select: { roleId: true } } } });
    const roleIds = memberships.flatMap((m) => m.roles.map((r) => r.roleId));
    const rows = (await prisma.message.findMany({
      where: {
        ...(before ? { id: { lt: before } } : {}),
        authorId: { not: me },
        OR: [
          { mentionIds: { has: me } },
          ...(roleIds.length ? [{ mentionRoleIds: { hasSome: roleIds } }] : []),
          { mentionEveryone: true, channel: { guildId: { in: memberships.map((m) => m.guildId) } } },
        ],
      },
      include: { ...messageInclude, channel: { select: { guildId: true } } },
      orderBy: { id: 'desc' },
      take: take * 2,
    })) as (MessageRow & { channel: { guildId: string | null } })[];
    const visible: typeof rows = [];
    for (const r of rows) {
      const cp = await channelPermissions(r.channelId, me);
      if (cp && has(cp.perms, P.VIEW_CHANNEL | P.READ_MESSAGE_HISTORY)) visible.push(r);
      if (visible.length >= take) break;
    }
    const out = [];
    for (const r of visible) out.push(...(await hydrateMessages([r], me, r.channel.guildId)));
    return out;
  });

  app.get('/users/@me/notification-settings', async (req) => {
    const rows = await prisma.notificationSetting.findMany({ where: { userId: req.auth.userId } });
    return rows.map(toNotif);
  });

  app.put<{ Params: { scopeId: string } }>('/users/@me/notification-settings/:scopeId', async (req) => {
    const scopeId = parse(zId, req.params.scopeId);
    const body = parse(
      z.object({
        level: z.enum(['all', 'mentions', 'nothing']).nullable().optional(),
        muted: z.boolean().optional(),
        mutedUntil: z.string().datetime().nullable().optional(),
        suppressEveryone: z.boolean().optional(),
      }),
      req.body,
    );
    const row = await prisma.notificationSetting.upsert({
      where: { userId_scopeId: { userId: req.auth.userId, scopeId } },
      create: {
        userId: req.auth.userId,
        scopeId,
        level: body.level ?? null,
        muted: body.muted ?? false,
        mutedUntil: body.mutedUntil ? new Date(body.mutedUntil) : null,
        suppressEveryone: body.suppressEveryone ?? false,
      },
      update: {
        ...(body.level !== undefined ? { level: body.level } : {}),
        ...(body.muted !== undefined ? { muted: body.muted } : {}),
        ...(body.mutedUntil !== undefined ? { mutedUntil: body.mutedUntil ? new Date(body.mutedUntil) : null } : {}),
        ...(body.suppressEveryone !== undefined ? { suppressEveryone: body.suppressEveryone } : {}),
      },
    });
    const dto = toNotif(row);
    await bus.toUser(req.auth.userId, 'NOTIFICATION_SETTINGS_UPDATE', dto);
    return dto;
  });

  app.get<{ Params: { id: string } }>('/users/:id', async (req) => {
    const id = parse(zId, req.params.id);
    const u = await prisma.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!u) throw notFound('Usuário');
    return toPublicUser(u);
  });

  app.get<{ Params: { id: string } }>('/users/:id/profile', async (req): Promise<UserProfile> => {
    const id = parse(zId, req.params.id);
    const me = req.auth.userId;
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) throw notFound('Usuário');
    const self = id === me;
    const settings = (await getSettings(id)).privacy;
    const [rel, mutualGuilds, friend] = await Promise.all([
      self ? null : relationshipBetween(me, id),
      self ? [] : mutualGuildIds(me, id),
      self ? true : areFriends(me, id),
    ]);
    const theirFriends = self
      ? []
      : await prisma.relationship.findMany({
          where: { userId: id, type: 'FRIEND', target: { relatedTo: { some: { userId: me, type: 'FRIEND' } } } },
          select: { targetId: true },
        });
    const hidden: string[] = [];
    const detailsVisible = self || settings.profileDetails === 'everyone' || friend;
    if (!detailsVisible) hidden.push('bio', 'banner', 'links', 'pronouns');
    const activityVisible = self || (settings.showRecentActivity && (friend || mutualGuilds.length > 0));
    if (!activityVisible) hidden.push('recentActivities');
    const recent = activityVisible
      ? await prisma.activityLog.findMany({ where: { userId: id }, orderBy: { lastSeenAt: 'desc' }, take: 5 })
      : null;
    const relType = rel ? ({ FRIEND: 'friend', INCOMING: 'incoming', OUTGOING: 'outgoing', BLOCKED: 'blocked' } as const)[rel.type] : null;
    return {
      user: toPublicUser(u),
      bio: detailsVisible ? u.bio : null,
      pronouns: detailsVisible ? u.pronouns : null,
      banner: detailsVisible ? imageUrl(u.bannerKey) : null,
      bannerColor: u.bannerColor,
      links: detailsVisible ? ((u.links ?? []) as unknown as UserProfile['links']) : null,
      mutualGuildIds: mutualGuilds,
      mutualFriendIds: theirFriends.map((f) => f.targetId),
      recentActivities: recent ? recent.map((r) => ({ name: r.name, type: r.type as 'playing', lastSeenAt: r.lastSeenAt.toISOString() })) : null,
      relationship: relType,
      hidden,
    };
  });
}

function toNotif(r: { scopeId: string; level: string | null; muted: boolean; mutedUntil: Date | null; suppressEveryone: boolean }): NotificationSetting {
  return {
    scopeId: r.scopeId,
    level: (r.level as NotificationSetting['level']) ?? null,
    muted: r.muted,
    mutedUntil: r.mutedUntil?.toISOString() ?? null,
    suppressEveryone: r.suppressEveryone,
  };
}

