import { LIMITS } from '@vinlancord/shared';
import { prisma } from '../lib/db';
import { badRequest, forbidden } from '../lib/errors';
import { newId } from '../lib/ids';
import { toChannel } from '../lib/serialize';
import { bus } from './bus';
import { invalidateChannel } from './perms';
import { areFriends, getSettings, isBlockedEitherWay, mutualGuildIds } from './users';

export const dmInclude = { overwrites: true, recipients: { select: { userId: true } } } as const;

/** Verifica se `from` pode iniciar/enviar DM para `to` (bloqueios + privacidade). */
export async function assertCanDM(from: string, to: string) {
  if (await isBlockedEitherWay(from, to)) throw forbidden('Não é possível enviar mensagens para esse usuário.', 'DM_BLOCKED');
  if (await areFriends(from, to)) return;
  const pref = (await getSettings(to)).privacy.dmsFrom;
  if (pref === 'friends') throw forbidden('Esse usuário só aceita mensagens de amigos.', 'DM_PRIVACY');
  if (pref === 'server_members' && (await mutualGuildIds(from, to)).length === 0)
    throw forbidden('Vocês precisam ser amigos ou estar em um servidor em comum.', 'DM_PRIVACY');
}

export async function openDM(me: string, other: string) {
  if (me === other) throw badRequest('Você não pode abrir uma conversa consigo mesmo.');
  const dmKey = [me, other].sort().join(':');
  let ch = await prisma.channel.findUnique({ where: { dmKey }, include: dmInclude });
  if (!ch) {
    await assertCanDM(me, other);
    const id = newId();
    ch = await prisma.channel.create({
      data: { id, type: 'DM', dmKey, recipients: { create: [{ userId: me }, { userId: other, closed: true }] } },
      include: dmInclude,
    });
  } else {
    await prisma.channelRecipient.update({ where: { channelId_userId: { channelId: ch.id, userId: me } }, data: { closed: false } });
  }
  const dto = toChannel(ch);
  await bus.toUser(me, 'CHANNEL_CREATE', dto);
  return dto;
}

export async function createGroupDM(me: string, others: string[]) {
  const ids = [...new Set(others.filter((o) => o !== me))];
  if (ids.length + 1 > LIMITS.GROUP_DM_MAX) throw badRequest(`Grupos podem ter no máximo ${LIMITS.GROUP_DM_MAX} pessoas.`);
  for (const o of ids) {
    if (!(await areFriends(me, o))) throw forbidden('Você só pode adicionar amigos a um grupo.', 'NOT_FRIENDS');
  }
  const id = newId();
  const ch = await prisma.channel.create({
    data: { id, type: 'GROUP_DM', ownerId: me, recipients: { create: [me, ...ids].map((userId) => ({ userId })) } },
    include: dmInclude,
  });
  const dto = toChannel(ch);
  await bus.toUsers([me, ...ids], 'CHANNEL_CREATE', dto);
  return dto;
}

/** Reabre DMs fechadas quando chega mensagem nova. */
export async function reopenForRecipients(channelId: string) {
  const closed = await prisma.channelRecipient.findMany({ where: { channelId, closed: true }, select: { userId: true } });
  if (!closed.length) return;
  await prisma.channelRecipient.updateMany({ where: { channelId, closed: true }, data: { closed: false } });
  invalidateChannel(channelId);
  const ch = await prisma.channel.findUniqueOrThrow({ where: { id: channelId }, include: dmInclude });
  await bus.toUsers(closed.map((c) => c.userId), 'CHANNEL_CREATE', toChannel(ch));
}
