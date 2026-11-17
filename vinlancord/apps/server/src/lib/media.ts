/** Validação e processamento de mídia enviada pelos usuários. */
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { INLINE_AUDIO_TYPES, INLINE_IMAGE_TYPES, INLINE_VIDEO_TYPES, type AttachmentKind } from '@vinlancord/shared';
import { badRequest } from './errors';
import { randomToken } from './ids';
import { storage } from '../storage';

sharp.cache(false);
sharp.concurrency(2);

const IMAGE_INPUT = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const MAX_PIXELS = 40_000_000;

export interface ProcessedImage {
  key: string;
  animated: boolean;
}

/**
 * Processa uma imagem (estática ou animada) redimensionando e convertendo para WebP.
 * Para imagens animadas também grava `<key>.static.webp` com o primeiro quadro.
 * A chave retornada não inclui extensão; arquivos: `<key>.webp` (+ `.static.webp`).
 */
export async function processImage(
  buf: Buffer,
  opts: { prefix: string; width: number; height: number; fit: 'cover' | 'inside' | 'contain'; maxBytes: number; name?: string },
): Promise<ProcessedImage> {
  if (buf.length > opts.maxBytes) throw badRequest(`Imagem muito grande (máx. ${Math.round(opts.maxBytes / 1024 / 1024)} MB).`);
  const type = await fileTypeFromBuffer(buf);
  if (!type || !IMAGE_INPUT.has(type.mime)) throw badRequest('Formato de imagem não suportado. Use PNG, JPG, GIF ou WebP.');

  let meta: { pages?: number };
  try {
    meta = await sharp(buf, { animated: true, limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw badRequest('Não foi possível ler essa imagem.');
  }
  const animated = (meta.pages ?? 1) > 1;
  const rand = opts.name ?? (animated ? 'a_' : '') + randomToken(12);
  const key = `public/${opts.prefix}/${rand}`;

  const resize = {
    width: opts.width,
    height: opts.height,
    fit: opts.fit,
    withoutEnlargement: opts.fit !== 'cover',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  } as const;

  const out = await sharp(buf, { animated, limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize(resize)
    .webp({ quality: animated ? 80 : 88, effort: 4, loop: 0 })
    .toBuffer();
  await storage.put(`${key}.webp`, out, 'image/webp');

  if (animated) {
    const still = await sharp(buf, { animated: false, limitInputPixels: MAX_PIXELS })
      .resize(resize)
      .webp({ quality: 88 })
      .toBuffer();
    await storage.put(`${key}.static.webp`, still, 'image/webp');
  }
  return { key, animated };
}

export async function deleteImage(key: string | null | undefined) {
  if (!key) return;
  await Promise.all([storage.delete(`${key}.webp`), storage.delete(`${key}.static.webp`)]).catch(() => {});
}

const TEXT_EXT = new Set(['txt', 'md', 'csv', 'log', 'json', 'yml', 'yaml', 'ini', 'cfg', 'xml', 'ts', 'js', 'py', 'c', 'cpp', 'h', 'java', 'rs', 'go', 'lua', 'sh']);
/** Tipos executáveis/perigosos nunca são renderizados — apenas download. */
const BLOCKED_INLINE = new Set(['image/svg+xml', 'text/html', 'application/xhtml+xml', 'application/javascript']);

export interface InspectedFile {
  contentType: string;
  kind: AttachmentKind;
  width: number | null;
  height: number | null;
  body: Buffer;
}

/** Detecta o tipo real pelo conteúdo (magic bytes), nunca pelo que o cliente diz. */
export async function inspectAttachment(buf: Buffer, filename: string): Promise<InspectedFile> {
  const type = await fileTypeFromBuffer(buf);
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  let mime = type?.mime ?? (TEXT_EXT.has(ext) && isProbablyText(buf) ? 'text/plain' : 'application/octet-stream');
  if (BLOCKED_INLINE.has(mime)) mime = 'application/octet-stream';

  let kind: AttachmentKind = 'file';
  let width: number | null = null;
  let height: number | null = null;
  let body = buf;

  if (INLINE_IMAGE_TYPES.includes(mime)) {
    try {
      const img = sharp(buf, { animated: true, limitInputPixels: MAX_PIXELS });
      const meta = await img.metadata();
      width = meta.width ?? null;
      height = meta.pageHeight ?? meta.height ?? null;
      kind = 'image';
      // Remove metadados (EXIF/GPS) de fotos estáticas, preservando a orientação.
      if (mime === 'image/jpeg') body = await sharp(buf).rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer();
      else if (mime === 'image/png' && buf.length < 20 * 1024 * 1024) body = await sharp(buf).png({ compressionLevel: 6 }).toBuffer();
      if (mime === 'image/jpeg') {
        const m2 = await sharp(body).metadata();
        width = m2.width ?? width;
        height = m2.height ?? height;
      }
    } catch {
      kind = 'file';
      mime = 'application/octet-stream';
    }
  } else if (INLINE_VIDEO_TYPES.includes(mime)) {
    kind = 'video';
  } else if (INLINE_AUDIO_TYPES.includes(mime)) {
    kind = 'audio';
  }
  return { contentType: mime, kind, width, height, body };
}

function isProbablyText(buf: Buffer) {
  const n = Math.min(buf.length, 4096);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
  return true;
}

export function kindOf(contentType: string): AttachmentKind {
  if (INLINE_IMAGE_TYPES.includes(contentType)) return 'image';
  if (INLINE_VIDEO_TYPES.includes(contentType)) return 'video';
  if (INLINE_AUDIO_TYPES.includes(contentType)) return 'audio';
  return 'file';
}

/** Nome de arquivo seguro (sem caminhos, controle ou caracteres problemáticos). */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'arquivo';
  const clean = base
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 200);
  return clean || 'arquivo';
}
