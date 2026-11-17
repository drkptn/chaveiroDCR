import type { FastifyRequest } from 'fastify';
import { badRequest } from './errors';
import { formatBytes } from '@vinlancord/shared';

/** Lê um único arquivo multipart para memória, respeitando o limite de tamanho. */
export async function readSingleFile(req: FastifyRequest, maxBytes: number) {
  if (!req.isMultipart()) throw badRequest('Envie o arquivo como multipart/form-data.');
  const file = await req.file({ limits: { fileSize: maxBytes, files: 1 } });
  if (!file) throw badRequest('Nenhum arquivo enviado.');
  const buf = await file.toBuffer();
  if (file.file.truncated) throw badRequest(`Arquivo muito grande (máx. ${formatBytes(maxBytes)}).`, undefined, 'FILE_TOO_LARGE');
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(file.fields)) {
    const f = v as { type?: string; value?: unknown } | undefined;
    if (f && f.type === 'field' && typeof f.value === 'string') fields[k] = f.value;
  }
  return { buffer: buf, filename: file.filename, mimetype: file.mimetype, fields };
}
