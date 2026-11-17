import type { EmojiRef, Message as MessageDTO, MessageReference, Reaction as ReactionDTO } from '@vinlancord/shared';
import { prisma } from '../lib/db';
import { imageUrl, messageType, publicUserSelect, toAttachment, toPublicUser } from '../lib/serialize';
import type { Attachment, Message, Reaction } from '../generated/prisma/client';
import type { UserRow } from '../lib/serialize';

export const messageInclude = {
  author: { select: publicUserSelect },
  attachments: { orderBy: { id: 'asc' as const } },
  reactions: { orderBy: { createdAt: 'asc' as const } },
} as const;

export type MessageRow = Message & { author: UserRow; attachments: Attachment[]; reactions: Reaction[] };

function aggregateReactions(rows: Reaction[], viewerId: string): ReactionDTO[] {
  const map = new Map<string, ReactionDTO>();
  for (const r of rows) {
    let agg = map.get(r.emojiKey);
    if (!agg) {
      const emoji: EmojiRef = r.emojiId
        ? { id: r.emojiId, name: r.emojiName, animated: r.animated, url: imageUrl(`public/emojis/${r.emojiId}`) }
        : { id: null, name: r.emojiName };
      agg = { emoji, count: 0, me: false };
      map.set(r.emojiKey, agg);
    }
    agg.count++;
    if (r.userId === viewerId) agg.me = true;
  }
  return [...map.values()];
}

/** Converte mensagens do banco em DTOs, carregando respostas e figurinhas em lote. */
export async function hydrateMessages(rows: MessageRow[], viewerId: string, guildId: string | null = null): Promise<MessageDTO[]> {
  if (!rows.length) return [];
  const replyIds = [...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x))];
  const stickerIds = [...new Set(rows.map((r) => r.stickerId).filter((x): x is string => !!x))];
  const [replies, stickers, emojiRows] = await Promise.all([
    replyIds.length
      ? prisma.message.findMany({
          where: { id: { in: replyIds } },
          select: { id: true, authorId: true, content: true, hasAttachments: true, channelId: true },
        })
      : [],
    stickerIds.length ? prisma.sticker.findMany({ where: { id: { in: stickerIds } } }) : [],
    // Reações com emoji custom: resolve a imagem real
    (() => {
      const ids = [...new Set(rows.flatMap((r) => r.reactions.map((x) => x.emojiId)).filter((x): x is string => !!x))];
      return ids.length ? prisma.emoji.findMany({ where: { id: { in: ids } }, select: { id: true, imageKey: true } }) : [];
    })(),
  ]);
  const replyMap = new Map(replies.map((r) => [r.id, r]));
  const stickerMap = new Map(stickers.map((s) => [s.id, s]));
  const emojiMap = new Map(emojiRows.map((e) => [e.id, e.imageKey]));

  return rows.map((m) => {
    let reference: MessageReference | null = null;
    if (m.replyToId) {
      const r = replyMap.get(m.replyToId);
      reference = r && r.channelId === m.channelId
        ? { id: r.id, authorId: r.authorId, content: r.content.slice(0, 200), deleted: false, hasAttachments: r.hasAttachments }
        : { id: m.replyToId, authorId: null, content: '', deleted: true, hasAttachments: false };
    }
    const st = m.stickerId ? stickerMap.get(m.stickerId) : null;
    const reactions = aggregateReactions(m.reactions, viewerId).map((r) =>
      r.emoji.id ? { ...r, emoji: { ...r.emoji, url: emojiMap.has(r.emoji.id) ? imageUrl(emojiMap.get(r.emoji.id)) : null } } : r,
    );
    return {
      id: m.id,
      channelId: m.channelId,
      guildId,
      author: toPublicUser(m.author),
      content: m.content,
      type: messageType(m.type),
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      pinned: m.pinned,
      mentions: m.mentionIds,
      mentionRoles: m.mentionRoleIds,
      mentionEveryone: m.mentionEveryone,
      attachments: m.attachments.map(toAttachment),
      reactions,
      reference,
      sticker: st ? { id: st.id, name: st.name, url: imageUrl(st.imageKey)!, format: st.format as 'png' } : null,
      call: (m.callData as MessageDTO['call']) ?? null,
    };
  });
}

/** Para eventos em tempo real: a lista de reações é por espectador, então `me` é recalculado no cliente. */
export async function loadMessage(id: string, viewerId: string, guildId: string | null) {
  const row = await prisma.message.findUnique({ where: { id }, include: messageInclude });
  if (!row) return null;
  const [dto] = await hydrateMessages([row as MessageRow], viewerId, guildId);
  return dto!;
}
