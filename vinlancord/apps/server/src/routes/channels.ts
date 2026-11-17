import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CHANNEL_SCOPED_PERMISSIONS,
  LIMITS,
  P,
  extractRoleMentions,
  extractUserMentions,
  emojiKey,
  has,
  hasEveryoneMention,
  normalizeTextChannelName,
  type EmojiRef,
} from '@vinlancord/shared';
import { prisma } from '../lib/db';
import { badRequest, forbidden, notFound, tooMany } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { inviteCode, newId } from '../lib/ids';
import { kv } from '../lib/kv';
import { limit } from '../lib/ratelimit';
import { deleteImage, processImage } from '../lib/media';
import { readSingleFile } from '../lib/upload';
import { publicUserSelect, toChannel, toPublicUser } from '../lib/serialize';
import { parse, zId } from '../lib/validate';
import { storage } from '../storage';
import { bus } from '../services/bus';
import {
  channelPermissions,
  getGuild,
  invalidateChannel,
  invalidateGuild,
  requireChannelPerm,
  requireRoleBelow,
  usersWhoCanView,
  type ChannelMeta,
} from '../services/perms';
import { hydrateMessages, loadMessage, messageInclude, type MessageRow } from '../services/messages';
import { assertCanDM, createGroupDM, dmInclude, openDM, reopenForRecipients } from '../services/dm';
import { createSystemMessage } from '../services/systemMessages';
import { audit } from '../services/guilds';
import { voiceHooks } from '../services/voiceHooks';
import { areFriends } from '../services/users';

const LINK_RE = /https?:\/\/[^\s<]+/i;
const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|⃣)+$/u;

async function parseEmojiParam(raw: string, userId: string, meta: ChannelMeta): Promise<EmojiRef> {
  const v = decodeURIComponent(raw);
  const m = /^([a-zA-Z0-9_]{2,32}):(\d{15,20})$/.exec(v);
  if (m) {
    const e = await prisma.emoji.findUnique({ where: { id: m[2] } });
    if (!e) throw badRequest('Emoji desconhecido.', undefined, 'UNKNOWN_EMOJI');
    if (e.guildId !== meta.guildId) {
      const member = await prisma.member.findUnique({ where: { guildId_userId: { guildId: e.guildId, userId } } });
      if (!member) throw forbidden('Você precisa estar no servidor desse emoji para usá-lo.');
    }
    return { id: e.id, name: e.name, animated: e.animated };
  }
  if (v.length > 32 || !EMOJI_RE.test(v)) throw badRequest('Emoji inválido.', undefined, 'UNKNOWN_EMOJI');
  return { id: null, name: v };
}

/** Bloqueio entre os dois participantes de uma DM 1:1 impede envio. */
async function assertDMAllowed(meta: ChannelMeta, userId: string) {
  if (meta.type !== 'DM') return;
  const other = meta.recipients.find((r) => r !== userId);
  if (other) await assertCanDM(userId, other);
}

async function bumpMentions(channelId: string, userIds: string[]) {
  if (!userIds.length) return;
  await prisma.$executeRaw`
    INSERT INTO "ReadState" ("userId", "channelId", "mentions")
    SELECT u, ${channelId}, 1 FROM unnest(${userIds}::text[]) AS u
    ON CONFLICT ("userId", "channelId") DO UPDATE SET "mentions" = "ReadState"."mentions" + 1`;
}

export default async function channelRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // ───────────── DMs e grupos ─────────────
  app.get('/users/@me/channels', async (req) => {
    const rows = await prisma.channel.findMany({
      where: { recipients: { some: { userId: req.auth.userId, closed: false } } },
      include: dmInclude,
      orderBy: { lastMessageId: 'desc' },
    });
    return rows.map(toChannel);
  });

  app.post('/users/@me/channels', async (req) => {
    const { recipients } = parse(z.object({ recipients: z.array(zId).min(1).max(LIMITS.GROUP_DM_MAX - 1) }), req.body);
    await limit(`dm-open:${req.auth.userId}`, 60, 600);
    if (recipients.length === 1) return openDM(req.auth.userId, recipients[0]!);
    return createGroupDM(req.auth.userId, recipients);
  });

  app.put<{ Params: { id: string; userId: string } }>('/channels/:id/recipients/:userId', async (req) => {
    const id = parse(zId, req.params.id);
    const userId = parse(zId, req.params.userId);
    const { meta } = await requireChannelPerm(id, req.auth.userId);
    if (meta.type !== 'GROUP_DM') throw badRequest('Só é possível adicionar pessoas em grupos.');
    if (meta.recipients.includes(userId)) return { ok: true };
    if (meta.recipients.length >= LIMITS.GROUP_DM_MAX) throw badRequest('O grupo está cheio.');
    if (!(await areFriends(req.auth.userId, userId))) throw forbidden('Você só pode adicionar amigos.');
    await prisma.channelRecipient.create({ data: { channelId: id, userId } });
    invalidateChannel(id);
    const ch = await prisma.channel.findUniqueOrThrow({ where: { id }, include: dmInclude });
    await bus.toUsers([...meta.recipients, userId], 'CHANNEL_UPDATE', toChannel(ch));
    await bus.toUser(userId, 'CHANNEL_CREATE', toChannel(ch));
    await createSystemMessage(id, req.auth.userId, 'GROUP_ADD', { mentionIds: [userId] });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; userId: string } }>('/channels/:id/recipients/:userId', async (req) => {
    const id = parse(zId, req.params.id);
    const userId = parse(zId, req.params.userId);
    const { meta } = await requireChannelPerm(id, req.auth.userId);
    if (meta.type !== 'GROUP_DM') throw badRequest('Ação inválida.');
    if (userId !== req.auth.userId && meta.ownerId !== req.auth.userId) throw forbidden('Apenas o dono do grupo pode remover pessoas.');
    await createSystemMessage(id, req.auth.userId, 'GROUP_REMOVE', { mentionIds: [userId] });
    await prisma.channelRecipient.deleteMany({ where: { channelId: id, userId } });
    const rest = meta.recipients.filter((r) => r !== userId);
    if (rest.length === 0) {
      await prisma.channel.delete({ where: { id } });
    } else if (meta.ownerId === userId) {
      await prisma.channel.update({ where: { id }, data: { ownerId: rest[0] } });
    }
    invalidateChannel(id);
    await bus.toUser(userId, 'CHANNEL_DELETE', { id, guildId: null });
    if (rest.length) {
      const ch = await prisma.channel.findUniqueOrThrow({ where: { id }, include: dmInclude });
      await bus.toUsers(rest, 'CHANNEL_UPDATE', toChannel(ch));
    }
    return { ok: true };
  });

  // ───────────── Canal ─────────────
  app.get<{ Params: { id: string } }>('/channels/:id', async (req) => {
    const id = parse(zId, req.params.id);
    await requireChannelPerm(id, req.auth.userId);
    const ch = await prisma.channel.findUniqueOrThrow({ where: { id }, include: dmInclude });
    return toChannel(ch);
  });

  app.patch<{ Params: { id: string } }>('/channels/:id', async (req) => {
    const id = parse(zId, req.params.id);
    const actor = req.auth.userId;
    const { meta } = await requireChannelPerm(id, actor);
    const body = parse(
      z
        .object({
          name: z.string().trim().min(1).max(LIMITS.CHANNEL_NAME_MAX),
          topic: z.string().max(LIMITS.CHANNEL_TOPIC_MAX),
          slowmode: z.number().int().min(0).max(21600),
          userLimit: z.number().int().min(0).max(LIMITS.VOICE_USER_LIMIT_MAX),
          bitrate: z.number().int().min(8000).max(384000),
          parentId: zId.nullable(),
        })
        .partial(),
      req.body,
    );
    if (meta.type === 'GROUP_DM') {
      if (body.name === undefined) throw badRequest('Nada para alterar.');
      const ch = await prisma.channel.update({ where: { id }, data: { name: body.name }, include: dmInclude });
      await bus.toUsers(meta.recipients, 'CHANNEL_UPDATE', toChannel(ch));
      await createSystemMessage(id, actor, 'GROUP_NAME', { content: body.name });
      return toChannel(ch);
    }
    if (!meta.guildId) throw badRequest('Não é possível editar esta conversa.');
    await requireChannelPerm(id, actor, P.MANAGE_CHANNELS);
    const current = await prisma.channel.findUniqueOrThrow({ where: { id } });
    if (body.parentId) {
      const p = await prisma.channel.findFirst({ where: { id: body.parentId, guildId: meta.guildId, type: 'CATEGORY' } });
      if (!p || current.type === 'CATEGORY') throw badRequest('Categoria inválida.');
    }
    if (body.name && current.type === 'TEXT') body.name = normalizeTextChannelName(body.name);
    const ch = await prisma.channel.update({ where: { id }, data: body, include: dmInclude });
    await audit(meta.guildId, actor, 'CHANNEL_UPDATE', id, body);
    await bus.toChannel(id, 'CHANNEL_UPDATE', toChannel(ch));
    return toChannel(ch);
  });

  app.post<{ Params: { id: string } }>('/channels/:id/icon', async (req) => {
    const id = parse(zId, req.params.id);
    const { meta } = await requireChannelPerm(id, req.auth.userId);
    if (meta.type !== 'GROUP_DM') throw badRequest('Apenas grupos têm ícone.');
    const { buffer } = await readSingleFile(req, LIMITS.AVATAR_MAX_SIZE);
    const img = await processImage(buffer, { prefix: `groups/${id}`, width: 256, height: 256, fit: 'cover', maxBytes: LIMITS.AVATAR_MAX_SIZE });
    const old = await prisma.channel.findUniqueOrThrow({ where: { id } });
    const ch = await prisma.channel.update({ where: { id }, data: { iconKey: img.key }, include: dmInclude });
    await deleteImage(old.iconKey);
    await bus.toUsers(meta.recipients, 'CHANNEL_UPDATE', toChannel(ch));
    return toChannel(ch);
  });

  app.delete<{ Params: { id: string } }>('/channels/:id', async (req) => {
    const id = parse(zId, req.params.id);
    const actor = req.auth.userId;
    const { meta } = await requireChannelPerm(id, actor);
    if (meta.type === 'DM') {
      await prisma.channelRecipient.update({ where: { channelId_userId: { channelId: id, userId: actor } }, data: { closed: true } });
      await bus.toUser(actor, 'CHANNEL_DELETE', { id, guildId: null });
      return { ok: true };
    }
    if (meta.type === 'GROUP_DM') {
      await createSystemMessage(id, actor, 'GROUP_REMOVE', { mentionIds: [actor] });
      await prisma.channelRecipient.deleteMany({ where: { channelId: id, userId: actor } });
      const rest = meta.recipients.filter((r) => r !== actor);
      if (!rest.length) await prisma.channel.delete({ where: { id } });
      else if (meta.ownerId === actor) await prisma.channel.update({ where: { id }, data: { ownerId: rest[0] } });
      invalidateChannel(id);
      await bus.toUser(actor, 'CHANNEL_DELETE', { id, guildId: null });
      if (rest.length) {
        const ch = await prisma.channel.findUniqueOrThrow({ where: { id }, include: dmInclude });
        await bus.toUsers(rest, 'CHANNEL_UPDATE', toChannel(ch));
      }
      return { ok: true };
    }
    await requireChannelPerm(id, actor, P.MANAGE_CHANNELS);
    const viewers = await usersWhoCanView(id);
    const ch = await prisma.channel.findUniqueOrThrow({ where: { id } });
    await voiceHooks.onChannelDeleted(id);
    if (ch.type === 'CATEGORY') await prisma.channel.updateMany({ where: { parentId: id }, data: { parentId: null } });
    await prisma.channel.delete({ where: { id } });
    await prisma.guild.updateMany({ where: { systemChannelId: id }, data: { systemChannelId: null } });
    invalidateGuild(meta.guildId!);
    invalidateChannel(id);
    await audit(meta.guildId!, actor, 'CHANNEL_DELETE', id, { name: ch.name });
    await bus.toUsers(viewers, 'CHANNEL_DELETE', { id, guildId: meta.guildId });
    if (ch.type === 'CATEGORY') {
      const children = await prisma.channel.findMany({ where: { guildId: meta.guildId!, parentId: null }, include: dmInclude });
      for (const c of children) await bus.toChannel(c.id, 'CHANNEL_UPDATE', toChannel(c));
    }
    return { ok: true };
  });

  // Sobrescritas de permissão
  app.put<{ Params: { id: string; targetId: string } }>('/channels/:id/permissions/:targetId', async (req) => {
    const id = parse(zId, req.params.id);
    const targetId = parse(zId, req.params.targetId);
    const actor = req.auth.userId;
    const { meta, perms } = await requireChannelPerm(id, actor, P.MANAGE_ROLES);
    if (!meta.guildId) throw badRequest('Ação inválida.');
    const body = parse(
      z.object({ type: z.enum(['role', 'member']), allow: z.string().regex(/^\d{1,20}$/), deny: z.string().regex(/^\d{1,20}$/) }),
      req.body,
    );
    const allow = BigInt(body.allow) & CHANNEL_SCOPED_PERMISSIONS;
    const deny = BigInt(body.deny) & CHANNEL_SCOPED_PERMISSIONS & ~allow;
    // não pode mexer em permissões que não possui
    if (((allow | deny) & ~perms) !== 0n && !has(perms, P.ADMINISTRATOR)) throw forbidden('Você não pode alterar permissões que você não tem.');
    const g = await getGuild(meta.guildId);
    if (body.type === 'role') {
      const role = g?.roles.find((r) => r.id === targetId);
      if (!role) throw badRequest('Cargo inválido.');
      if (targetId !== meta.guildId) requireRoleBelow(g!, actor, role.position);
    } else if (!g?.members.has(targetId)) throw badRequest('Membro inválido.');
    const before = new Set(await usersWhoCanView(id));
    await prisma.permissionOverwrite.upsert({
      where: { channelId_targetId: { channelId: id, targetId } },
      create: { channelId: id, targetId, type: body.type === 'role' ? 'ROLE' : 'MEMBER', allow, deny },
      update: { allow, deny, type: body.type === 'role' ? 'ROLE' : 'MEMBER' },
    });
    await afterOverwriteChange(meta.guildId, id, before, actor);
    return { ok: true };
  });

  app.delete<{ Params: { id: string; targetId: string } }>('/channels/:id/permissions/:targetId', async (req) => {
    const id = parse(zId, req.params.id);
    const targetId = parse(zId, req.params.targetId);
    const { meta } = await requireChannelPerm(id, req.auth.userId, P.MANAGE_ROLES);
    if (!meta.guildId) throw badRequest('Ação inválida.');
    const before = new Set(await usersWhoCanView(id));
    await prisma.permissionOverwrite.deleteMany({ where: { channelId: id, targetId } });
    await afterOverwriteChange(meta.guildId, id, before, req.auth.userId);
    return { ok: true };
  });

  async function afterOverwriteChange(guildId: string, channelId: string, before: Set<string>, actor: string) {
    invalidateGuild(guildId);
    const ch = await prisma.channel.findUniqueOrThrow({ where: { id: channelId }, include: dmInclude });
    const after = new Set(await usersWhoCanView(channelId));
    const dto = toChannel(ch);
    await bus.toUsers([...after].filter((u) => before.has(u)), 'CHANNEL_UPDATE', dto);
    await bus.toUsers([...after].filter((u) => !before.has(u)), 'CHANNEL_CREATE', dto);
    await bus.toUsers([...before].filter((u) => !after.has(u)), 'CHANNEL_DELETE', { id: channelId, guildId });
    await audit(guildId, actor, 'CHANNEL_OVERWRITE_UPDATE', channelId);
    await voiceHooks.onPermissionsChanged(guildId);
  }

  // Convites
  app.post<{ Params: { id: string } }>('/channels/:id/invites', async (req) => {
    const id = parse(zId, req.params.id);
    const { meta } = await requireChannelPerm(id, req.auth.userId, P.CREATE_INVITE);
    if (!meta.guildId) throw badRequest('Convites são apenas para servidores.');
    const body = parse(
      z.object({
        maxAge: z.number().int().min(0).max(30 * 86400).default(7 * 86400),
        maxUses: z.number().int().min(0).max(1000).default(0),
      }),
      req.body ?? {},
    );
    await limit(`invite:${req.auth.userId}`, 30, 3600);
    let code = inviteCode();
    while (await prisma.invite.findUnique({ where: { code } })) code = inviteCode();
    const inv = await prisma.invite.create({
      data: {
        code,
        guildId: meta.guildId,
        channelId: id,
        inviterId: req.auth.userId,
        maxUses: body.maxUses,
        expiresAt: body.maxAge ? new Date(Date.now() + body.maxAge * 1000) : null,
      },
    });
    await audit(meta.guildId, req.auth.userId, 'INVITE_CREATE', null, { code });
    return { code: inv.code, expiresAt: inv.expiresAt?.toISOString() ?? null, maxUses: inv.maxUses, uses: 0 };
  });

  // ───────────── Mensagens ─────────────
  app.get<{ Params: { id: string } }>('/channels/:id/messages', async (req) => {
    const id = parse(zId, req.params.id);
    const { meta } = await requireChannelPerm(id, req.auth.userId, P.READ_MESSAGE_HISTORY);
    const q = parse(
      z.object({
        before: zId.optional(),
        after: zId.optional(),
        around: zId.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(LIMITS.MESSAGES_PAGE),
      }),
      req.query,
    );
    let rows: MessageRow[];
    if (q.around) {
      const half = Math.floor(q.limit / 2);
      const [older, newer] = await Promise.all([
        prisma.message.findMany({ where: { channelId: id, id: { lte: q.around } }, include: messageInclude, orderBy: { id: 'desc' }, take: half + 1 }),
        prisma.message.findMany({ where: { channelId: id, id: { gt: q.around } }, include: messageInclude, orderBy: { id: 'asc' }, take: half }),
      ]);
      rows = [...newer.reverse(), ...older] as MessageRow[];
    } else if (q.after) {
      rows = (await prisma.message.findMany({ where: { channelId: id, id: { gt: q.after } }, include: messageInclude, orderBy: { id: 'asc' }, take: q.limit })).reverse() as MessageRow[];
    } else {
      rows = (await prisma.message.findMany({
        where: { channelId: id, ...(q.before ? { id: { lt: q.before } } : {}) },
        include: messageInclude,
        orderBy: { id: 'desc' },
        take: q.limit,
      })) as MessageRow[];
    }
    // ordem: mais recentes primeiro
    return hydrateMessages(rows, req.auth.userId, meta.guildId);
  });

  app.post<{ Params: { id: string } }>('/channels/:id/messages', async (req) => {
    const id = parse(zId, req.params.id);
    const me = req.auth.userId;
    const body = parse(
      z.object({
        content: z.string().max(LIMITS.MESSAGE_MAX).default(''),
        nonce: z.string().max(64).optional(),
        replyTo: zId.optional(),
        attachmentIds: z.array(zId).max(LIMITS.ATTACHMENTS_PER_MESSAGE).default([]),
        stickerId: zId.optional(),
        silent: z.boolean().optional(),
      }),
      req.body,
    );
    const content = body.content.replace(/\r\n/g, '\n').trim();
    if (!content && !body.attachmentIds.length && !body.stickerId) throw badRequest('A mensagem está vazia.', undefined, 'EMPTY_MESSAGE');

    const { meta, perms } = await requireChannelPerm(id, me, P.SEND_MESSAGES);
    if (meta.type === 'VOICE' || meta.type === 'VIDEO' || meta.type === 'CATEGORY')
      throw badRequest('Este canal não aceita mensagens.');
    await assertDMAllowed(meta, me);
    if (body.attachmentIds.length && !has(perms, P.ATTACH_FILES)) throw forbidden('Você não pode enviar arquivos aqui.');

    // anti-spam
    await limit(`msg:${me}:${id}`, 8, 5, 'Calma aí! Você está mandando mensagens rápido demais.');
    await limit(`msg-global:${me}`, 40, 10, 'Calma aí! Você está mandando mensagens rápido demais.');
    if (meta.guildId) {
      const ch = await prisma.channel.findUniqueOrThrow({ where: { id }, select: { slowmode: true } });
      if (ch.slowmode > 0 && !has(perms, P.MANAGE_MESSAGES) && !has(perms, P.MANAGE_CHANNELS)) {
        const ok = await kv.setnx(`slow:${id}:${me}`, '1', ch.slowmode);
        if (!ok) throw tooMany(`Modo lento ativo: aguarde ${ch.slowmode}s entre mensagens.`);
      }
    }

    // anexos enviados antes por este usuário e ainda não usados
    const attachments = body.attachmentIds.length
      ? await prisma.attachment.findMany({ where: { id: { in: body.attachmentIds }, uploaderId: me, messageId: null } })
      : [];
    if (attachments.length !== body.attachmentIds.length) throw badRequest('Anexo inválido ou já utilizado.', undefined, 'INVALID_ATTACHMENT');

    let stickerId: string | null = null;
    if (body.stickerId) {
      const st = await prisma.sticker.findUnique({ where: { id: body.stickerId } });
      if (!st) throw badRequest('Figurinha desconhecida.');
      if (st.guildId !== meta.guildId) {
        const member = await prisma.member.findUnique({ where: { guildId_userId: { guildId: st.guildId, userId: me } } });
        if (!member || !has(perms, P.USE_EXTERNAL_EMOJIS)) throw forbidden('Você não pode usar essa figurinha aqui.');
      }
      stickerId = st.id;
    }

    let replyToId: string | null = null;
    let replyAuthor: string | null = null;
    if (body.replyTo) {
      const r = await prisma.message.findUnique({ where: { id: body.replyTo }, select: { id: true, channelId: true, authorId: true } });
      if (r && r.channelId === id) {
        replyToId = r.id;
        replyAuthor = r.authorId;
      }
    }

    // menções
    const viewers = new Set(await usersWhoCanView(id));
    let mentionIds = extractUserMentions(content).filter((u) => viewers.has(u) && u !== me);
    if (replyAuthor && replyAuthor !== me && !body.silent && !mentionIds.includes(replyAuthor)) mentionIds = [...mentionIds, replyAuthor];
    let mentionRoleIds: string[] = [];
    let mentionEveryone = false;
    if (meta.guildId) {
      const roleIds = extractRoleMentions(content);
      if (roleIds.length) {
        const roles = await prisma.role.findMany({ where: { id: { in: roleIds }, guildId: meta.guildId }, select: { id: true, mentionable: true } });
        mentionRoleIds = roles.filter((r) => r.mentionable || has(perms, P.MENTION_EVERYONE)).map((r) => r.id);
      }
      mentionEveryone = hasEveryoneMention(content) && has(perms, P.MENTION_EVERYONE);
    }

    const msgId = newId();
    await prisma.$transaction([
      prisma.message.create({
        data: {
          id: msgId,
          channelId: id,
          authorId: me,
          content,
          type: replyToId ? 'REPLY' : 'DEFAULT',
          replyToId,
          mentionIds,
          mentionRoleIds,
          mentionEveryone,
          stickerId,
          hasAttachments: attachments.length > 0,
          hasLink: LINK_RE.test(content),
        },
      }),
      prisma.attachment.updateMany({ where: { id: { in: attachments.map((a) => a.id) } }, data: { messageId: msgId } }),
      prisma.channel.update({ where: { id }, data: { lastMessageId: msgId } }),
      prisma.readState.upsert({
        where: { userId_channelId: { userId: me, channelId: id } },
        create: { userId: me, channelId: id, lastReadId: msgId, mentions: 0 },
        update: { lastReadId: msgId, mentions: 0 },
      }),
    ]);

    // contadores de menção (para badges de não lidas)
    if (!body.silent) {
      const mentioned = new Set(mentionIds);
      if (mentionEveryone) viewers.forEach((v) => v !== me && mentioned.add(v));
      if (mentionRoleIds.length && meta.guildId) {
        const g = await getGuild(meta.guildId);
        for (const [uid, m] of g?.members ?? []) if (uid !== me && viewers.has(uid) && m.roleIds.some((r) => mentionRoleIds.includes(r))) mentioned.add(uid);
      }
      await bumpMentions(id, [...mentioned]);
    }

    if (!meta.guildId) await reopenForRecipients(id);
    const dto = (await loadMessage(msgId, me, meta.guildId))!;
    dto.nonce = body.nonce ?? null;
    await bus.toUsers(viewers, 'MESSAGE_CREATE', dto);
    return dto;
  });

  app.patch<{ Params: { id: string; mid: string } }>('/channels/:id/messages/:mid', async (req) => {
    const id = parse(zId, req.params.id);
    const mid = parse(zId, req.params.mid);
    const me = req.auth.userId;
    const { meta } = await requireChannelPerm(id, me);
    const { content: raw } = parse(z.object({ content: z.string().max(LIMITS.MESSAGE_MAX) }), req.body);
    const msg = await prisma.message.findUnique({ where: { id: mid } });
    if (!msg || msg.channelId !== id) throw notFound('Mensagem');
    if (msg.authorId !== me) throw forbidden('Você só pode editar suas próprias mensagens.');
    if (!['DEFAULT', 'REPLY'].includes(msg.type)) throw badRequest('Esta mensagem não pode ser editada.');
    const content = raw.replace(/\r\n/g, '\n').trim();
    if (!content && !msg.hasAttachments && !msg.stickerId) throw badRequest('A mensagem não pode ficar vazia.');
    const viewers = new Set(await usersWhoCanView(id));
    await prisma.message.update({
      where: { id: mid },
      data: {
        content,
        editedAt: new Date(),
        mentionIds: extractUserMentions(content).filter((u) => viewers.has(u) && u !== me),
        hasLink: LINK_RE.test(content),
      },
    });
    const dto = (await loadMessage(mid, me, meta.guildId))!;
    await bus.toUsers(viewers, 'MESSAGE_UPDATE', dto);
    return dto;
  });

  app.delete<{ Params: { id: string; mid: string } }>('/channels/:id/messages/:mid', async (req) => {
    const id = parse(zId, req.params.id);
    const mid = parse(zId, req.params.mid);
    const me = req.auth.userId;
    const { meta, perms } = await requireChannelPerm(id, me);
    const msg = await prisma.message.findUnique({ where: { id: mid }, include: { attachments: true } });
    if (!msg || msg.channelId !== id) throw notFound('Mensagem');
    if (msg.authorId !== me && !has(perms, P.MANAGE_MESSAGES)) throw forbidden();
    await prisma.message.delete({ where: { id: mid } });
    for (const a of msg.attachments) await storage.delete(a.storageKey).catch(() => {});
    if (msg.authorId !== me && meta.guildId) await audit(meta.guildId, me, 'MESSAGE_DELETE', msg.authorId, { channelId: id });
    await bus.toChannel(id, 'MESSAGE_DELETE', { id: mid, channelId: id });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/channels/:id/messages/bulk-delete', async (req) => {
    const id = parse(zId, req.params.id);
    const { meta } = await requireChannelPerm(id, req.auth.userId, P.MANAGE_MESSAGES);
    const { ids } = parse(z.object({ ids: z.array(zId).min(1).max(100) }), req.body);
    const msgs = await prisma.message.findMany({ where: { id: { in: ids }, channelId: id }, include: { attachments: true } });
    await prisma.message.deleteMany({ where: { id: { in: msgs.map((m) => m.id) } } });
    for (const m of msgs) for (const a of m.attachments) await storage.delete(a.storageKey).catch(() => {});
    if (meta.guildId) await audit(meta.guildId, req.auth.userId, 'MESSAGE_BULK_DELETE', null, { channelId: id, count: msgs.length });
    await bus.toChannel(id, 'MESSAGE_DELETE_BULK', { channelId: id, ids: msgs.map((m) => m.id) });
    return { ok: true, deleted: msgs.length };
  });

  // Reações
  app.put<{ Params: { id: string; mid: string; emoji: string } }>('/channels/:id/messages/:mid/reactions/:emoji/@me', async (req) => {
    const id = parse(zId, req.params.id);
    const mid = parse(zId, req.params.mid);
    const me = req.auth.userId;
    const { meta, perms } = await requireChannelPerm(id, me, P.READ_MESSAGE_HISTORY);
    await assertDMAllowed(meta, me);
    const emoji = await parseEmojiParam(req.params.emoji, me, meta);
    const key = emojiKey(emoji);
    const msg = await prisma.message.findUnique({ where: { id: mid }, select: { channelId: true } });
    if (!msg || msg.channelId !== id) throw notFound('Mensagem');
    const existingKinds = await prisma.reaction.groupBy({ by: ['emojiKey'], where: { messageId: mid } });
    const exists = existingKinds.some((k) => k.emojiKey === key);
    if (!exists) {
      if (!has(perms, P.ADD_REACTIONS)) throw forbidden('Você não pode adicionar reações aqui.');
      if (existingKinds.length >= LIMITS.REACTIONS_PER_MESSAGE) throw badRequest('Limite de reações diferentes atingido.');
    }
    await limit(`react:${me}`, 30, 10, 'Calma com as reações! 😅');
    await prisma.reaction.upsert({
      where: { messageId_userId_emojiKey: { messageId: mid, userId: me, emojiKey: key } },
      create: { messageId: mid, userId: me, emojiKey: key, emojiName: emoji.name, emojiId: emoji.id, animated: !!emoji.animated },
      update: {},
    });
    await bus.toChannel(id, 'MESSAGE_REACTION_ADD', { channelId: id, messageId: mid, userId: me, emoji });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; mid: string; emoji: string; userId: string } }>(
    '/channels/:id/messages/:mid/reactions/:emoji/:userId',
    async (req) => {
      const id = parse(zId, req.params.id);
      const mid = parse(zId, req.params.mid);
      const me = req.auth.userId;
      const target = req.params.userId === '@me' ? me : parse(zId, req.params.userId);
      const { meta, perms } = await requireChannelPerm(id, me);
      if (target !== me && !has(perms, P.MANAGE_MESSAGES)) throw forbidden();
      const emoji = await parseEmojiParam(req.params.emoji, me, meta).catch(() => {
        const v = decodeURIComponent(req.params.emoji);
        const m = /^([a-zA-Z0-9_]{2,32}):(\d{15,20})$/.exec(v);
        return m ? { id: m[2]!, name: m[1]! } : { id: null, name: v };
      });
      const r = await prisma.reaction.deleteMany({ where: { messageId: mid, userId: target, emojiKey: emojiKey(emoji) } });
      if (r.count) await bus.toChannel(id, 'MESSAGE_REACTION_REMOVE', { channelId: id, messageId: mid, userId: target, emoji });
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string; mid: string; emoji: string } }>('/channels/:id/messages/:mid/reactions/:emoji', async (req) => {
    const id = parse(zId, req.params.id);
    const mid = parse(zId, req.params.mid);
    await requireChannelPerm(id, req.auth.userId, P.READ_MESSAGE_HISTORY);
    const v = decodeURIComponent(req.params.emoji);
    const m = /^([a-zA-Z0-9_]{2,32}):(\d{15,20})$/.exec(v);
    const key = m ? m[2]! : v;
    const rows = await prisma.reaction.findMany({
      where: { messageId: mid, emojiKey: key },
      include: { user: { select: publicUserSelect } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return rows.map((r) => toPublicUser(r.user));
  });

  // Fixadas
  app.get<{ Params: { id: string } }>('/channels/:id/pins', async (req) => {
    const id = parse(zId, req.params.id);
    const { meta } = await requireChannelPerm(id, req.auth.userId, P.READ_MESSAGE_HISTORY);
    const rows = (await prisma.message.findMany({
      where: { channelId: id, pinned: true },
      include: messageInclude,
      orderBy: { pinnedAt: 'desc' },
      take: 50,
    })) as MessageRow[];
    return hydrateMessages(rows, req.auth.userId, meta.guildId);
  });

  for (const method of ['put', 'delete'] as const) {
    app[method]<{ Params: { id: string; mid: string } }>('/channels/:id/pins/:mid', async (req) => {
      const id = parse(zId, req.params.id);
      const mid = parse(zId, req.params.mid);
      const me = req.auth.userId;
      const r = await channelPermissions(id, me);
      if (!r || !has(r.perms, P.VIEW_CHANNEL)) throw notFound('Canal');
      if (!has(r.perms, P.PIN_MESSAGES) && !has(r.perms, P.MANAGE_MESSAGES)) throw forbidden();
      const msg = await prisma.message.findUnique({ where: { id: mid } });
      if (!msg || msg.channelId !== id) throw notFound('Mensagem');
      const pin = method === 'put';
      if (msg.pinned === pin) return { ok: true };
      if (pin && (await prisma.message.count({ where: { channelId: id, pinned: true } })) >= 50)
        throw badRequest('Limite de 50 mensagens fixadas atingido.');
      await prisma.message.update({ where: { id: mid }, data: { pinned: pin, pinnedAt: pin ? new Date() : null } });
      const dto = (await loadMessage(mid, me, r.meta.guildId))!;
      await bus.toChannel(id, 'MESSAGE_UPDATE', dto);
      await bus.toChannel(id, 'CHANNEL_PINS_UPDATE', { channelId: id });
      if (pin) await createSystemMessage(id, me, 'PIN', { replyToId: mid });
      if (r.meta.guildId) await audit(r.meta.guildId, me, pin ? 'MESSAGE_PIN' : 'MESSAGE_UNPIN', msg.authorId, { channelId: id, messageId: mid });
      return { ok: true };
    });
  }

  // Leitura
  app.post<{ Params: { id: string } }>('/channels/:id/ack', async (req) => {
    const id = parse(zId, req.params.id);
    const { messageId } = parse(z.object({ messageId: zId }), req.body);
    await requireChannelPerm(id, req.auth.userId);
    await prisma.readState.upsert({
      where: { userId_channelId: { userId: req.auth.userId, channelId: id } },
      create: { userId: req.auth.userId, channelId: id, lastReadId: messageId, mentions: 0 },
      update: { lastReadId: messageId, mentions: 0 },
    });
    await bus.toUser(req.auth.userId, 'MESSAGE_ACK', { channelId: id, messageId });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/guilds/:id/ack', async (req) => {
    const guildId = parse(zId, req.params.id);
    const g = await getGuild(guildId);
    if (!g?.members.has(req.auth.userId)) throw notFound('Servidor');
    const chans = await prisma.channel.findMany({ where: { guildId, lastMessageId: { not: null } }, select: { id: true, lastMessageId: true } });
    for (const c of chans) {
      const r = await channelPermissions(c.id, req.auth.userId);
      if (!r || !has(r.perms, P.VIEW_CHANNEL)) continue;
      await prisma.readState.upsert({
        where: { userId_channelId: { userId: req.auth.userId, channelId: c.id } },
        create: { userId: req.auth.userId, channelId: c.id, lastReadId: c.lastMessageId, mentions: 0 },
        update: { lastReadId: c.lastMessageId, mentions: 0 },
      });
      await bus.toUser(req.auth.userId, 'MESSAGE_ACK', { channelId: c.id, messageId: c.lastMessageId! });
    }
    return { ok: true };
  });
}

