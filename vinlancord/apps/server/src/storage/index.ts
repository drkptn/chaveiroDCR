/**
 * Armazenamento de objetos.
 * - `local`: arquivos em disco, servidos por /files com assinatura HMAC.
 * - `s3`: qualquer S3 compatível (AWS, MinIO, R2, B2...). /files valida a
 *   assinatura e redireciona para uma URL pré-assinada de curta duração.
 *
 * Prefixo `public/` = avatares, ícones, banners, emojis, figurinhas (chave
 * aleatória, sem expiração). Demais chaves exigem assinatura com validade.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { hmac, safeEqual } from '../lib/ids';

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Apenas local: caminho absoluto do arquivo (para streaming com Range). */
  localPath?(key: string): string;
  /** Apenas S3: URL pré-assinada. */
  presign?(key: string, filename?: string, download?: boolean): Promise<string>;
}

const KEY_RE = /^[a-zA-Z0-9/_.-]{1,300}$/;
export function isValidKey(key: string) {
  return KEY_RE.test(key) && !key.includes('..') && !key.startsWith('/');
}

class LocalDriver implements StorageDriver {
  private root = resolve(config.STORAGE_LOCAL_DIR);
  private path(key: string) {
    if (!isValidKey(key)) throw new Error('chave inválida');
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root + sep)) throw new Error('chave inválida');
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
  localPath(key: string) {
    return this.path(key);
  }
}

class S3Driver implements StorageDriver {
  private client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT || undefined,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials:
      config.S3_ACCESS_KEY && config.S3_SECRET_KEY
        ? { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY }
        : undefined,
  });
  private presignClient = config.S3_PUBLIC_ENDPOINT
    ? new S3Client({
        region: config.S3_REGION,
        endpoint: config.S3_PUBLIC_ENDPOINT,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
        credentials:
          config.S3_ACCESS_KEY && config.S3_SECRET_KEY
            ? { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY }
            : undefined,
      })
    : this.client;
  private bucket = config.S3_BUCKET!;

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async presign(key: string, filename?: string, download?: boolean) {
    const disposition = filename
      ? `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`
      : undefined;
    return getSignedUrl(
      this.presignClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: disposition }),
      { expiresIn: 600 },
    );
  }
}

if (config.STORAGE_DRIVER === 's3' && !config.S3_BUCKET) {
  console.error('❌ STORAGE_DRIVER=s3 exige S3_BUCKET (e credenciais).');
  process.exit(1);
}

export const storage: StorageDriver = config.STORAGE_DRIVER === 's3' ? new S3Driver() : new LocalDriver();

const base = () => config.PUBLIC_URL.replace(/\/$/, '');

/** URL estável para um arquivo público. */
export function publicUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `${base()}/files/${key}`;
}

/** Janela de validade: 24h, alinhada para a URL ser estável (cache do navegador). */
const WINDOW = 12 * 3600;
export function signedUrl(key: string, filename?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = (Math.floor(now / WINDOW) + 2) * WINDOW;
  const sig = hmac(`${key}|${exp}`);
  const name = filename ? `&name=${encodeURIComponent(filename)}` : '';
  return `${base()}/files/${key}?exp=${exp}&sig=${sig}${name}`;
}

export function verifySignature(key: string, exp: string | undefined, sig: string | undefined): boolean {
  if (key.startsWith('public/')) return true;
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(hmac(`${key}|${exp}`), sig);
}
