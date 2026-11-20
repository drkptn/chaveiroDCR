/**
 * Ações do operador do servidor (quem roda a máquina): exige o cabeçalho X-Admin-Token
 * igual ao ADMIN_TOKEN da configuração. Sem ADMIN_TOKEN configurado, as rotas nem existem.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BADGES } from '@vinlancord/shared';
import { config } from '../config';
import { prisma } from '../lib/db';
import { ApiError, notFound } from '../lib/errors';
import { safeEqual } from '../lib/ids';
import { limit } from '../lib/ratelimit';
import { parse } from '../lib/validate';
import { broadcastUserUpdate } from './users';

const zBadges = z.object({ badges: z.array(z.enum(Object.keys(BADGES) as [string, ...string[]])).max(10) });

export default async function adminRoutes(app: FastifyInstance) {
  if (!config.ADMIN_TOKEN || config.ADMIN_TOKEN.length < 24) return;

  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api/v1/admin/')) return;
    await limit(`admin:${req.ip}`, 20, 60);
    const token = String(req.headers['x-admin-token'] ?? '');
    if (!safeEqual(token, config.ADMIN_TOKEN)) throw new ApiError(403, 'FORBIDDEN', 'Chave de administrador inválida.');
  });

  /** Define os selos de um usuário (pelo nome de usuário). */
  app.put('/admin/users/:username/badges', async (req) => {
    const { username } = req.params as { username: string };
    const { badges } = parse(zBadges, req.body);
    const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true } });
    if (!user) throw notFound('Usuário');
    await prisma.user.update({ where: { id: user.id }, data: { badges: [...new Set(badges)] } });
    const updated = await broadcastUserUpdate(user.id);
    return { id: updated.id, username: updated.username, badges: updated.badges };
  });
}
