// Servidor padrão embutido no app e o certificado fixado (pinning) quando o servidor usa só IP.
// Fonte: variáveis VINLANCORD_SERVER_URL / VINLANCORD_SERVER_PIN ou o arquivo default-server.txt:
//   linha 1: https://endereço
//   linha 2 (opcional): sha256=<impressão digital SHA-256 do certificado, em hex>
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function serverConfig() {
  const file = join(root, 'default-server.txt');
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
  const url = (process.env.VINLANCORD_SERVER_URL || lines[0] || '').replace(/\/+$/, '');
  const pinRaw = process.env.VINLANCORD_SERVER_PIN || lines.find((l) => l.startsWith('sha256='))?.slice(7) || '';
  const pin = pinRaw.replace(/[^0-9a-f]/gi, '').toLowerCase();
  if (url && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)) throw new Error(`Endereço de servidor inválido: ${url}`);
  if (pin && pin.length !== 64) throw new Error('A impressão digital do certificado deve ter 64 caracteres hex (SHA-256).');
  const host = url ? new URL(url).hostname.toLowerCase() : '';
  return { url, pins: url && pin ? { [host]: pin } : {} };
}
