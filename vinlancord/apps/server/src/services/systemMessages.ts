import { prisma } from '../lib/db';
import { newId } from '../lib/ids';
import { bus } from './bus';
import { loadMessage } from './messages';
import { getChannelMeta } from './perms';

type SystemType = 'MEMBER_JOIN' | 'CALL' | 'PIN' | 'GROUP_ADD' | 'GROUP_REMOVE' | 'GROUP_NAME' | 'EVENT';

/** Cria uma mensagem de sistema (entrou no servidor, chamada, fixou mensagem…) e transmite. */
export async function createSystemMessage(
  channelId: string,
  authorId: string,
  type: SystemType,
  opts: { content?: string; callData?: object; mentionIds?: string[]; replyToId?: string } = {},
) {
  const id = newId();
  await prisma.$transaction([
    prisma.message.create({
      data: {
        id,
        channelId,
        authorId,
        type,
        content: opts.content ?? '',
        callData: opts.callData,
        mentionIds: opts.mentionIds ?? [],
        replyToId: opts.replyToId ?? null,
      },
    }),
    prisma.channel.update({ where: { id: channelId }, data: { lastMessageId: id } }),
  ]);
  const meta = await getChannelMeta(channelId);
  const dto = await loadMessage(id, authorId, meta?.guildId ?? null);
  if (dto) await bus.toChannel(channelId, 'MESSAGE_CREATE', dto);
  return dto;
}
