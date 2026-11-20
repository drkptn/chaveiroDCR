// Gera os ícones do app Android a partir do ícone do Além-Mar (apps/desktop/build/icon.svg).
import sharp from 'sharp';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const svg = readFileSync('../desktop/build/icon.svg');
// versão "sangrada" (sem cantos arredondados nem borda) para o ícone adaptativo: o Android aplica a máscara
const bleed = Buffer.from(
  svg
    .toString()
    .replace(/<clipPath id="c"><path d="[^"]+"\/><\/clipPath>/, '<clipPath id="c"><rect width="128" height="128"/></clipPath>')
    .replace(/<path d="M64 5c[^"]+"[^>]*\/>/, ''),
);
const res = 'android/app/src/main/res';
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  const legacy = Math.round(48 * k);
  const fg = Math.round(108 * k);
  const icon = await sharp(svg, { density: 384 }).resize(legacy, legacy).png().toBuffer();
  writeFileSync(join(res, `mipmap-${d}`, 'ic_launcher.png'), icon);
  writeFileSync(join(res, `mipmap-${d}`, 'ic_launcher_round.png'), icon);
  // ícone adaptativo: a cena ocupa tudo; a brecha com a luz fica no centro (zona segura)
  const fgImg = await sharp(bleed, { density: 384 }).resize(fg, fg).png().toBuffer();
  writeFileSync(join(res, `mipmap-${d}`, 'ic_launcher_foreground.png'), fgImg);
}
writeFileSync(join(res, 'values', 'ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#030A1A</color>\n</resources>\n');
// tela de abertura: fundo escuro com o logo
for (const dir of readdirSync(res).filter((x) => x.startsWith('drawable'))) {
  const f = join(res, dir, 'splash.png');
  try {
    const meta = await sharp(f).metadata();
    const s = Math.round(Math.min(meta.width, meta.height) * 0.28);
    const logo = await sharp(svg, { density: 384 }).resize(s, s).png().toBuffer();
    const out = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: '#02060f' } })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toBuffer();
    writeFileSync(f, out);
  } catch {
    /* sem splash nesta pasta */
  }
}
console.log('Ícones do Android gerados.');
