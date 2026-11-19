// Gera os ícones do app Android a partir do ícone do Vinlancord (apps/desktop/build/icon.svg).
import sharp from 'sharp';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const svg = readFileSync('../desktop/build/icon.svg');
const res = 'android/app/src/main/res';
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  const legacy = Math.round(48 * k);
  const fg = Math.round(108 * k);
  const icon = await sharp(svg, { density: 384 }).resize(legacy, legacy).png().toBuffer();
  writeFileSync(join(res, `mipmap-${d}`, 'ic_launcher.png'), icon);
  writeFileSync(join(res, `mipmap-${d}`, 'ic_launcher_round.png'), icon);
  // ícone adaptativo: o desenho ocupa a "zona segura" central (66%)
  const inner = Math.round(fg * 0.66);
  const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  const pad = Math.round((fg - inner) / 2);
  const fgImg = await sharp({ create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, left: pad, top: pad }])
    .png()
    .toBuffer();
  writeFileSync(join(res, `mipmap-${d}`, 'ic_launcher_foreground.png'), fgImg);
}
writeFileSync(join(res, 'values', 'ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0A0A0C</color>\n</resources>\n');
// tela de abertura: fundo escuro com o logo
for (const dir of readdirSync(res).filter((x) => x.startsWith('drawable'))) {
  const f = join(res, dir, 'splash.png');
  try {
    const meta = await sharp(f).metadata();
    const s = Math.round(Math.min(meta.width, meta.height) * 0.28);
    const logo = await sharp(svg, { density: 384 }).resize(s, s).png().toBuffer();
    const out = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: '#040405' } })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toBuffer();
    writeFileSync(f, out);
  } catch {
    /* sem splash nesta pasta */
  }
}
console.log('Ícones do Android gerados.');
