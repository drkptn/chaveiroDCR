import type { FastifyInstance } from 'fastify';
import type { Invite } from '@vinlancord/shared';
import { P, has } from '@vinlancord/shared';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { forbidden, notFound } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { limit } from '../lib/ratelimit';
import { imageUrl, publicUserSelect, toPublicUser } from '../lib/serialize';
import { parse } from '../lib/validate';
import { getPresences } from '../services/presence';
import { buildGuildFull, audit } from '../services/guilds';
import { guildPermissions } from '../services/perms';
import { addMember } from './guilds';

const zCode = z.string().regex(/^[a-zA-Z0-9-]{4,16}$/, 'Convite inválido');

async function loadInvite(code: string) {
  const inv = await prisma.invite.findUnique({ where: { code }, include: { guild: { include: { _count: { select: { members: true } } } } } });
  if (!inv) return null;
  if (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) return null;
  if (inv.maxUses && inv.uses >= inv.maxUses) return null;
  return inv;
}

export default async function inviteRoutes(app: FastifyInstance) {
  app.get<{ Params: { code: string } }>('/invites/:code', async (req): Promise<Invite> => {
    const code = parse(zCode, req.params.code);
    await limit(`invite-view:${req.ip}`, 60, 60);
    const inv = await loadInvite(code);
    if (!inv) throw notFound('Convite');
    const memberIds = await prisma.member.findMany({ where: { guildId: inv.guildId }, select: { userId: true }, take: 5000 });
    const online = (await getPresences(memberIds.map((m) => m.userId))).length;
    const inviter = inv.inviterId ? await prisma.user.findUnique({ where: { id: inv.inviterId }, select: publicUserSelect }) : null;
    return {
      code: inv.code,
      guild: {
        id: inv.guild.id,
        name: inv.guild.name,
        icon: imageUrl(inv.guild.iconKey),
        banner: imageUrl(inv.guild.bannerKey),
        description: inv.guild.description,
        memberCount: inv.guild._count.members,
        onlineCount: online,
      },
      channelId: inv.channelId,
      inviter: inviter ? toPublicUser(inviter) : null,
      uses: inv.uses,
      maxUses: inv.maxUses,
      expiresAt: inv.expiresAt?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
    };
  });

  app.post<{ Params: { code: string } }>('/invites/:code', { preHandler: requireAuth }, async (req) => {
    const code = parse(zCode, req.params.code);
    await limit(`invite-join:${req.auth.userId}`, 20, 600);
    const inv = await loadInvite(code);
    if (!inv) throw notFound('Convite');
    const ban = await prisma.ban.findUnique({ where: { guildId_userId: { guildId: inv.guildId, userId: req.auth.userId } } });
    if (ban) throw forbidden('Você está banido deste servidor.', 'BANNED');
    const joined = await addMember(inv.guildId, req.auth.userId);
    if (joined) {
      await prisma.invite.update({ where: { code }, data: { uses: { increment: 1 } } });
      await audit(inv.guildId, req.auth.userId, 'MEMBER_JOIN', req.auth.userId, { invite: code });
    }
    return { guild: await buildGuildFull(inv.guildId, req.auth.userId), channelId: inv.channelId, alreadyMember: !joined };
  });

  app.delete<{ Params: { code: string } }>('/invites/:code', { preHandler: requireAuth }, async (req) => {
    const code = parse(zCode, req.params.code);
    const inv = await prisma.invite.findUnique({ where: { code } });
    if (!inv) throw notFound('Convite');
    const perms = await guildPermissions(inv.guildId, req.auth.userId);
    if (inv.inviterId !== req.auth.userId && !has(perms, P.MANAGE_GUILD)) throw forbidden();
    await prisma.invite.delete({ where: { code } });
    await audit(inv.guildId, req.auth.userId, 'INVITE_DELETE', null, { code });
    return { ok: true };
  });

}
