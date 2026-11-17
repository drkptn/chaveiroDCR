/** Upload de anexos e entrega de arquivos com controle de acesso. */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { LIMITS, INLINE_AUDIO_TYPES, INLINE_IMAGE_TYPES, INLINE_VIDEO_TYPES } from '@vinlancord/shared';
import { prisma } from '../lib/db';
import { badRequest, notFound } from '../lib/errors';
import { requireAuth } from '../lib/auth';
import { newId } from '../lib/ids';
import { limit } from '../lib/ratelimit';
import { inspectAttachment, sanitizeFilename } from '../lib/media';
import { readSingleFile } from '../lib/upload';
import { toAttachment } from '../lib/serialize';
import { isValidKey, storage, verifySignature } from '../storage';

const SAFE_INLINE = new Set([...INLINE_IMAGE_TYPES, ...INLINE_VIDEO_TYPES, ...INLINE_AUDIO_TYPES, 'text/plain']);
const typeCache = new Map<string, { contentType: string; filename: string }>();

async function resolveMeta(key: string) {
  if (key.startsWith('public/')) return { contentType: 'image/webp', filename: key.split('/').pop()! };
  const cached = typeCache.get(key);
  if (cached) return cached;
  const a = await prisma.attachment.findFirst({ where: { storageKey: key }, select: { contentType: true, filename: true } });
  if (!a) return null;
  if (typeCache.size > 5000) typeCache.clear();
  typeCache.set(key, a);
  return a;
}

export default async function fileRoutes(app: FastifyInstance) {
  app.post('/api/v1/attachments', { preHandler: requireAuth }, async (req) => {
    await limit(`upload:${req.auth.userId}`, 40, 60, 'Muitos uploads em sequência. Aguarde um pouco.');
    const { buffer, filename, fields } = await readSingleFile(req, LIMITS.ATTACHMENT_MAX_SIZE);
    if (!buffer.length) throw badRequest('Arquivo vazio.');
    const name = sanitizeFilename(filename);
    const info = await inspectAttachment(buffer, name);
    const id = newId();
    const storageKey = `attachments/${id}/${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await storage.put(storageKey, info.body, info.contentType);
    const a = await prisma.attachment.create({
      data: {
        id,
        uploaderId: req.auth.userId,
        filename: name,
        contentType: info.contentType,
        size: info.body.length,
        storageKey,
        width: info.width,
        height: info.height,
        spoiler: fields.spoiler === 'true' || name.startsWith('SPOILER_'),
      },
    });
    return toAttachment(a);
  });

  app.delete<{ Params: { id: string } }>('/api/v1/attachments/:id', { preHandler: requireAuth }, async (req) => {
    const a = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!a || a.uploaderId !== req.auth.userId || a.messageId) throw notFound('Anexo');
    await prisma.attachment.delete({ where: { id: a.id } });
    await storage.delete(a.storageKey).catch(() => {});
    return { ok: true };
  });

  app.get<{ Params: { '*': string }; Querystring: { exp?: string; sig?: string; name?: string; download?: string } }>(
    '/files/*',
    async (req, reply) => {
      const key = req.params['*'];
      if (!isValidKey(key)) throw notFound('Arquivo');
      if (!verifySignature(key, req.query.exp, req.query.sig)) throw notFound('Arquivo');
      const meta = await resolveMeta(key);
      if (!meta) throw notFound('Arquivo');

      const inline = SAFE_INLINE.has(meta.contentType) && req.query.download !== '1';
      const disposition = `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.filename)}`;
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      reply.header('Cache-Control', key.startsWith('public/') ? 'public, max-age=31536000, immutable' : 'private, max-age=86400');

      if (storage.presign) {
        return reply.redirect(await storage.presign(key, meta.filename, !inline), 302);
      }
      const path = storage.localPath!(key);
      let size: number;
      try {
        const s = await stat(path);
        if (!s.isFile()) throw new Error();
        size = s.size;
      } catch {
        throw notFound('Arquivo');
      }
      reply.header('Content-Type', inline ? meta.contentType : 'application/octet-stream');
      reply.header('Content-Disposition', disposition);
      reply.header('Accept-Ranges', 'bytes');

      const range = req.headers.range;
      const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
      if (m && (m[1] || m[2])) {
        let start = m[1] ? Number(m[1]) : size - Number(m[2]);
        let end = m[1] && m[2] ? Number(m[2]) : size - 1;
        if (start < 0) start = 0;
        if (end >= size) end = size - 1;
        if (start > end || start >= size) {
          reply.header('Content-Range', `bytes */${size}`);
          return reply.code(416).send();
        }
        reply.code(206);
        reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
        reply.header('Content-Length', end - start + 1);
        return reply.send(createReadStream(path, { start, end }));
      }
      reply.header('Content-Length', size);
      return reply.send(createReadStream(path));
    },
  );
}

/** Remove anexos enviados mas nunca usados em mensagens (após 24h). */
export async function cleanupOrphanAttachments() {
  const old = await prisma.attachment.findMany({
    where: { messageId: null, createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
    take: 500,
  });
  for (const a of old) {
    await storage.delete(a.storageKey).catch(() => {});
    await prisma.attachment.delete({ where: { id: a.id } }).catch(() => {});
  }
  return old.length;
}
