// Gera os ícones do app (PNG em vários tamanhos, .ico do Windows, bandeja e badge) a partir do SVG.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, '..', 'build');
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const svg = readFileSync(join(build, 'icon.svg'));
mkdirSync(join(build, 'icons'), { recursive: true });
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const pngs = {};
for (const s of sizes) {
  pngs[s] = await sharp(svg, { density: Math.ceil((72 * s) / 128) }).resize(s, s).png().toBuffer();
  writeFileSync(join(build, 'icons', `${s}x${s}.png`), pngs[s]);
}
writeFileSync(join(build, 'icon.png'), pngs[512]);
writeFileSync(join(build, 'tray.png'), pngs[32]);

// .ico com entradas PNG (Windows Vista+)
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
const entries = [];
let offset = 6 + 16 * icoSizes.length;
for (const s of icoSizes) {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0);
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[s].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[s].length;
  entries.push(e);
}
writeFileSync(join(build, 'icon.ico'), Buffer.concat([header, ...entries, ...icoSizes.map((s) => pngs[s])]));

// badge (sobreposição na barra de tarefas do Windows)
const badge = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#f04459" stroke="#0b0b10" stroke-width="3"/></svg>');
writeFileSync(join(build, 'badge.png'), await sharp(badge).png().toBuffer());
console.log('Ícones gerados em', build);
