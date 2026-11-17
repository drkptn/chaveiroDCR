/** Busca, eventos, denúncias, GIFs, saúde e métricas. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import client from 'prom-client';
import { LIMITS, P, has, snowflakeFromTime, type GifResult } from '@vinlancord/shared';
import { config } from '../config';
import { prisma } from '../lib/db';
import { ApiError, badRequest, forbidden, notFound } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { newId } from '../lib/ids';
import { kv } from '../lib/kv';
import { limit } from '../lib/ratelimit';
import { deleteImage, processImage } from '../lib/media';
import { readSingleFile } from '../lib/upload';
import { publicUserSelect, toEvent, toPublicUser } from '../lib/serialize';
import { parse, zId } from '../lib/validate';
import { bus } from '../services/bus';
import { channelPermissions, getGuild, requireGuildPerm, requireMember, channelPermsFromSnapshot } from '../services/perms';
import { hydrateMessages, messageInclude, type MessageRow } from '../services/messages';
import { audit } from '../services/guilds';
import { createSystemMessage } from '../services/systemMessages';

export const metrics = {
  registry: new client.Registry(),
};
client.collectDefaultMetrics({ register: metrics.registry, prefix: 'vinlancord_' });
export const gauges = {
  sockets: new client.Gauge({ name: 'vinlancord_gateway_connections', help: 'Conexões WebSocket ativas', registers: [metrics.registry] }),
  voicePeers: new client.Gauge({ name: 'vinlancord_voice_peers', help: 'Participantes em chamadas', registers: [metrics.registry] }),
  voiceRooms: new client.Gauge({ name: 'vinlancord_voice_rooms', help: 'Salas de voz ativas', registers: [metrics.registry] }),
  messages: new client.Counter({ name: 'vinlancord_messages_total', help: 'Mensagens enviadas', registers: [metrics.registry] }),
  httpErrors: new client.Counter({ name: 'vinlancord_http_errors_total', help: 'Erros HTTP 5xx', registers: [metrics.registry] }),
};

const zEvent = z.object({
  name: z.string().trim().min(1).max(LIMITS.EVENT_NAME_MAX),
  description: z.string().max(LIMITS.EVENT_DESCRIPTION_MAX).default(''),
  location: z.string().trim().max(100).default(''),
  channelId: zId.nullable().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable().optional(),
});

async function eventDto(eventId: string, viewer: string) {
  const e = await prisma.scheduledEvent.findUnique({ where: { id: eventId }, include: { _count: { select: { rsvps: true } } } });
  if (!e) return null;
  const me = !!(await prisma.eventRsvp.findUnique({ where: { eventId_userId: { eventId, userId: viewer } } }));
  return toEvent(e, me);
}

async function broadcastEvent(guildId: string, eventId: string, kind: 'EVENT_CREATE' | 'EVENT_UPDATE') {
  const e = await prisma.scheduledEvent.findUnique({ where: { id: eventId }, include: { _count: { select: { rsvps: true } } } });
  if (!e) return;
  // `me` é calculado por usuário no cliente a partir de EVENT_RSVP; aqui enviamos false
  await bus.toGuild(guildId, kind, toEvent(e, false));
}

export default async function miscRoutes(app: FastifyInstance) {
  // ───────────── Saúde e métricas ─────────────
  app.get('/health', async () => {
    let db = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      /* fora do ar */
    }
    const redis = await kv.ping();
    const { voiceStatus } = await import('../voice/service');
    return { ok: db && redis, db, kv: { kind: kv.kind, ok: redis }, voice: voiceStatus(), uptime: Math.round(process.uptime()) };
  });

  app.get('/metrics', async (req, reply) => {
    const token = config.METRICS_TOKEN;
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
    if (token ? req.headers.authorization !== `Bearer ${token}` : !local) throw notFound('Rota');
    reply.header('Content-Type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  // ───────────── Busca de mensagens ─────────────
  app.get('/search/messages', { preHandler: requireAuth }, async (req) => {
    const me = req.auth.userId;
    const q = parse(
      z.object({
        q: z.string().trim().max(200).optional(),
        guildId: zId.optional(),
        channelId: zId.optional(),
        authorId: zId.optional(),
        has: z.enum(['image', 'video', 'file', 'link', 'sticker']).optional(),
        mentions: zId.optional(),
        pinned: z.enum(['true', 'false']).optional(),
        before: z.string().datetime().optional(),
        after: z.string().datetime().optional(),
        offset: z.coerce.number().int().min(0).max(5000).default(0),
      }),
      req.query,
    );
    await limit(`search:${me}`, 30, 60, 'Muitas buscas seguidas. Respira um pouco 😅');
    let channelIds: string[] = [];
    if (q.channelId) {
      const r = await channelPermissions(q.channelId, me);
      if (!r || !has(r.perms, P.VIEW_CHANNEL | P.READ_MESSAGE_HISTORY)) throw notFound('Canal');
      channelIds = [q.channelId];
    } else if (q.guildId) {
      const g = await requireMember(q.guildId, me);
      channelIds = [...g.channels.values()]
        .filter((c) => c.type === 'TEXT' && has(channelPermsFromSnapshot(g, c.id, me), P.VIEW_CHANNEL | P.READ_MESSAGE_HISTORY))
        .map((c) => c.id);
    } else {
      channelIds = (await prisma.channelRecipient.findMany({ where: { userId: me }, select: { channelId: true } })).map((c) => c.channelId);
    }
    if (!channelIds.length) return { total: 0, messages: [] };
    const idRange: { lt?: string; gt?: string } = {};
    if (q.before) idRange.lt = snowflakeFromTime(new Date(q.before).getTime());
    if (q.after) idRange.gt = snowflakeFromTime(new Date(q.after).getTime());
    const where = {
      channelId: { in: channelIds },
      type: { in: ['DEFAULT', 'REPLY'] as ('DEFAULT' | 'REPLY')[] },
      ...(Object.keys(idRange).length ? { id: idRange } : {}),
      ...(q.q ? { content: { contains: q.q, mode: 'insensitive' as const } } : {}),
      ...(q.authorId ? { authorId: q.authorId } : {}),
      ...(q.mentions ? { mentionIds: { has: q.mentions } } : {}),
      ...(q.pinned ? { pinned: q.pinned === 'true' } : {}),
      ...(q.has === 'link' ? { hasLink: true } : {}),
      ...(q.has === 'file' ? { hasAttachments: true } : {}),
      ...(q.has === 'sticker' ? { stickerId: { not: null } } : {}),
      ...(q.has === 'image' ? { attachments: { some: { contentType: { startsWith: 'image/' } } } } : {}),
      ...(q.has === 'video' ? { attachments: { some: { contentType: { startsWith: 'video/' } } } } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.message.count({ where }),
      prisma.message.findMany({ where, include: { ...messageInclude, channel: { select: { guildId: true } } }, orderBy: { id: 'desc' }, skip: q.offset, take: 25 }),
    ]);
    const messages = [];
    for (const r of rows as (MessageRow & { channel: { guildId: string | null } })[])
      messages.push(...(await hydrateMessages([r], me, r.channel.guildId)));
    return { total, messages };
  });

  // ───────────── Eventos ─────────────
  app.get<{ Params: { id: string } }>('/guilds/:id/events', { preHandler: requireAuth }, async (req) => {
    const guildId = parse(zId, req.params.id);
    await requireMember(guildId, req.auth.userId);
    const rows = await prisma.scheduledEvent.findMany({
      where: { guildId, status: { in: ['SCHEDULED', 'ACTIVE'] } },
      include: { _count: { select: { rsvps: true } }, rsvps: { where: { userId: req.auth.userId }, select: { userId: true } } },
      orderBy: { startAt: 'asc' },
    });
    return rows.map((e) => toEvent(e, e.rsvps.length > 0));
  });

  app.post<{ Params: { id: string } }>('/guilds/:id/events', { preHandler: requireAuth }, async (req) => {
    const guildId = parse(zId, req.params.id);
    await requireGuildPerm(guildId, req.auth.userId, P.MANAGE_EVENTS);
    const body = parse(zEvent, req.body);
    const startAt = new Date(body.startAt);
    if (startAt.getTime() < Date.now() - 60_000) throw badRequest('O evento precisa começar no futuro.', { startAt: 'Data no passado' });
    const endAt = body.endAt ? new Date(body.endAt) : null;
    if (endAt && endAt <= startAt) throw badRequest('O fim precisa ser depois do início.', { endAt: 'Antes do início' });
    if (body.channelId) {
      const g = await getGuild(guildId);
      if (!g?.channels.has(body.channelId)) throw badRequest('Canal inválido.');
    }
    const e = await prisma.scheduledEvent.create({
      data: { id: newId(), guildId, creatorId: req.auth.userId, name: body.name, description: body.description, location: body.location, channelId: body.channelId ?? null, startAt, endAt },
    });
    await prisma.eventRsvp.create({ data: { eventId: e.id, userId: req.auth.userId } });
    await audit(guildId, req.auth.userId, 'EVENT_CREATE', e.id, { name: e.name });
    await broadcastEvent(guildId, e.id, 'EVENT_CREATE');
    return eventDto(e.id, req.auth.userId);
  });

  app.patch<{ Params: { id: string; eid: string } }>('/guilds/:id/events/:eid', { preHandler: requireAuth }, async (req) => {
    const guildId = parse(zId, req.params.id);
    const eid = parse(zId, req.params.eid);
    await requireGuildPerm(guildId, req.auth.userId, P.MANAGE_EVENTS);
    const body = parse(zEvent.partial().extend({ status: z.enum(['scheduled', 'active', 'completed', 'canceled']).optional() }), req.body);
    const e = await prisma.scheduledEvent.findFirst({ where: { id: eid, guildId } });
    if (!e) throw notFound('Evento');
    await prisma.scheduledEvent.update({
      where: { id: eid },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.channelId !== undefined ? { channelId: body.channelId } : {}),
        ...(body.startAt ? { startAt: new Date(body.startAt), notifiedAt: null } : {}),
        ...(body.endAt !== undefined ? { endAt: body.endAt ? new Date(body.endAt) : null } : {}),
        ...(body.status ? { status: body.status.toUpperCase() as 'SCHEDULED' } : {}),
      },
    });
    await broadcastEvent(guildId, eid, 'EVENT_UPDATE');
    return eventDto(eid, req.auth.userId);
  });

  app.post<{ Params: { id: string; eid: string } }>('/guilds/:id/events/:eid/cover', { preHandler: requireAuth }, async (req) => {
    const guildId = parse(zId, req.params.id);
    const eid = parse(zId, req.params.eid);
    await requireGuildPerm(guildId, req.auth.userId, P.MANAGE_EVENTS);
    const e = await prisma.scheduledEvent.findFirst({ where: { id: eid, guildId } });
    if (!e) throw notFound('Evento');
    const { buffer } = await readSingleFile(req, LIMITS.BANNER_MAX_SIZE);
    const img = await processImage(buffer, { prefix: `events/${guildId}`, width: 1200, height: 480, fit: 'cover', maxBytes: LIMITS.BANNER_MAX_SIZE });
    await prisma.scheduledEvent.update({ where: { id: eid }, data: { coverKey: img.key } });
    await deleteImage(e.coverKey);
    await broadcastEvent(guildId, eid, 'EVENT_UPDATE');
    return eventDto(eid, req.auth.userId);
  });

  app.delete<{ Params: { id: string; eid: string } }>('/guilds/:id/events/:eid', { preHandler: requireAuth }, async (req) => {
    const guildId = parse(zId, req.params.id);
    const eid = parse(zId, req.params.eid);
    await requireGuildPerm(guildId, req.auth.userId, P.MANAGE_EVENTS);
    const e = await prisma.scheduledEvent.findFirst({ where: { id: eid, guildId } });
    if (!e) throw notFound('Evento');
    await prisma.scheduledEvent.delete({ where: { id: eid } });
    await deleteImage(e.coverKey);
    await bus.toGuild(guildId, 'EVENT_DELETE', { id: eid, guildId });
    return { ok: true };
  });

  for (const method of ['put', 'delete'] as const) {
    app[method]<{ Params: { id: string; eid: string } }>('/guilds/:id/events/:eid/rsvp', { preHandler: requireAuth }, async (req) => {
      const guildId = parse(zId, req.params.id);
      const eid = parse(zId, req.params.eid);
      await requireMember(guildId, req.auth.userId);
      const e = await prisma.scheduledEvent.findFirst({ where: { id: eid, guildId } });
      if (!e) throw notFound('Evento');
      if (method === 'put')
        await prisma.eventRsvp.upsert({ where: { eventId_userId: { eventId: eid, userId: req.auth.userId } }, create: { eventId: eid, userId: req.auth.userId }, update: {} });
      else await prisma.eventRsvp.deleteMany({ where: { eventId: eid, userId: req.auth.userId } });
      await broadcastEvent(guildId, eid, 'EVENT_UPDATE');
      return eventDto(eid, req.auth.userId);
    });
  }

  // ───────────── Denúncias ─────────────
  app.post('/reports', { preHandler: requireAuth }, async (req) => {
    const body = parse(
      z.object({
        targetType: z.enum(['user', 'message', 'guild']),
        targetId: zId,
        channelId: zId.optional(),
        reason: z.enum(['spam', 'assedio', 'odio', 'violencia', 'conteudo_sexual', 'golpe', 'menor_de_idade', 'outro']),
        details: z.string().max(LIMITS.REPORT_DETAILS_MAX).default(''),
      }),
      req.body,
    );
    const me = req.auth.userId;
    await limit(`report:${me}`, 10, 3600, 'Você enviou muitas denúncias. Obrigado, nossa equipe vai analisar.');
    let snapshot: Record<string, unknown> | null = null;
    let guildId: string | null = null;
    if (body.targetType === 'message') {
      if (!body.channelId) throw badRequest('Informe o canal da mensagem.');
      const r = await channelPermissions(body.channelId, me);
      if (!r || !has(r.perms, P.VIEW_CHANNEL)) throw notFound('Mensagem');
      const m = await prisma.message.findUnique({ where: { id: body.targetId }, include: { attachments: true } });
      if (!m || m.channelId !== body.channelId) throw notFound('Mensagem');
      snapshot = { authorId: m.authorId, content: m.content, channelId: m.channelId, attachments: m.attachments.map((a) => a.filename), createdAt: m.createdAt };
      guildId = r.meta.guildId;
    } else if (body.targetType === 'user') {
      const u = await prisma.user.findUnique({ where: { id: body.targetId }, select: publicUserSelect });
      if (!u) throw notFound('Usuário');
      snapshot = { username: u.username, displayName: u.displayName };
    } else {
      const g = await prisma.guild.findUnique({ where: { id: body.targetId } });
      if (!g) throw notFound('Servidor');
      snapshot = { name: g.name, ownerId: g.ownerId };
      guildId = g.id;
    }
    await prisma.report.create({
      data: { id: newId(), reporterId: me, targetType: body.targetType, targetId: body.targetId, guildId, reason: body.reason, details: body.details, snapshot: snapshot as object },
    });
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/guilds/:id/reports', { preHandler: requireAuth }, async (req) => {
    const guildId = parse(zId, req.params.id);
    await requireGuildPerm(guildId, req.auth.userId, P.MANAGE_MESSAGES);
    const rows = await prisma.report.findMany({ where: { guildId, targetType: 'message' }, orderBy: { id: 'desc' }, take: 100 });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  });

  app.patch<{ Params: { id: string; rid: string } }>('/guilds/:id/reports/:rid', { preHandler: requireAuth }, async (req) => {
    const guildId = parse(zId, req.params.id);
    await requireGuildPerm(guildId, req.auth.userId, P.MANAGE_MESSAGES);
    const { status } = parse(z.object({ status: z.enum(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED']) }), req.body);
    const r = await prisma.report.updateMany({ where: { id: req.params.rid, guildId }, data: { status } });
    if (!r.count) throw notFound('Denúncia');
    return { ok: true };
  });

  // ───────────── GIFs (proxy da GIPHY: a chave nunca vai para o cliente) ─────────────
  app.get('/gifs/search', { preHandler: requireAuth }, async (req) => {
    const { q, offset } = parse(
      z.object({ q: z.string().trim().max(100).default(''), offset: z.coerce.number().int().min(0).max(500).default(0) }),
      req.query,
    );
    if (!config.GIPHY_API_KEY) throw new ApiError(503, 'GIFS_DISABLED', 'A busca de GIFs não está configurada neste servidor.');
    await limit(`gifs:${req.auth.userId}`, 60, 60);
    const cacheKey = `gif:${q.toLowerCase()}:${offset}`;
    const cached = await kv.get(cacheKey);
    if (cached) return JSON.parse(cached);
    const endpoint = q ? 'search' : 'trending';
    const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`);
    url.searchParams.set('api_key', config.GIPHY_API_KEY);
    url.searchParams.set('limit', '30');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('rating', 'pg-13');
    url.searchParams.set('lang', 'pt');
    if (q) url.searchParams.set('q', q);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new ApiError(502, 'GIFS_UPSTREAM', 'Não foi possível buscar GIFs agora.');
    const json = (await res.json()) as {
      data: { id: string; title: string; images: Record<string, { url: string; width: string; height: string; webp?: string; mp4?: string }> }[];
    };
    const out: GifResult[] = json.data
      .map((g) => {
        const full = g.images.downsized_medium ?? g.images.original;
        const prev = g.images.fixed_width ?? full;
        if (!full || !prev) return null;
        return { id: g.id, title: g.title, url: full.url, preview: prev.webp ?? prev.url, width: Number(prev.width), height: Number(prev.height) };
      })
      .filter((x): x is GifResult => !!x);
    await kv.set(cacheKey, JSON.stringify(out), 600);
    return out;
  });
}

/** Agendador de eventos: avisa quem confirmou presença quando o evento começa. */
export async function tickEvents() {
  const now = new Date();
  const starting = await prisma.scheduledEvent.findMany({
    where: { status: 'SCHEDULED', startAt: { lte: now }, notifiedAt: null },
    include: { rsvps: { select: { userId: true } }, guild: { select: { systemChannelId: true } } },
    take: 50,
  });
  for (const e of starting) {
    await prisma.scheduledEvent.update({ where: { id: e.id }, data: { status: 'ACTIVE', notifiedAt: now } });
    if (e.guild.systemChannelId) {
      const ids = e.rsvps.map((r) => r.userId);
      await createSystemMessage(e.guild.systemChannelId, e.creatorId, 'EVENT', {
        content: `📅 O evento **${e.name.replace(/[*_~`|]/g, '')}** começou! ${ids.map((i) => `<@${i}>`).join(' ')}`.slice(0, 3900),
        mentionIds: ids,
      }).catch(() => {});
      if (ids.length) {
        await prisma.$executeRaw`
          INSERT INTO "ReadState" ("userId", "channelId", "mentions")
          SELECT u, ${e.guild.systemChannelId}, 1 FROM unnest(${ids}::text[]) AS u
          ON CONFLICT ("userId", "channelId") DO UPDATE SET "mentions" = "ReadState"."mentions" + 1`;
      }
    }
    await broadcastEvent(e.guildId, e.id, 'EVENT_UPDATE');
  }
  const ending = await prisma.scheduledEvent.findMany({
    where: { status: 'ACTIVE', OR: [{ endAt: { lte: now } }, { endAt: null, startAt: { lte: new Date(now.getTime() - 12 * 3600_000) } }] },
    take: 50,
  });
  for (const e of ending) {
    await prisma.scheduledEvent.update({ where: { id: e.id }, data: { status: 'COMPLETED' } });
    await broadcastEvent(e.guildId, e.id, 'EVENT_UPDATE');
  }
}

