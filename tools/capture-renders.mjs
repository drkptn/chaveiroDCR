/**
 * Captura os renders do estúdio 3D e gera WebP otimizados em /public/renders.
 *   1) npm run studio        (servidor com STUDIO=1 na porta 3100)
 *   2) npm run renders       (este script)
 * Opções: --only=copias,emblema   --base=http://localhost:3100
 */
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(require.resolve("playwright", { paths: [process.env.NODE_PATH ?? "", "/usr/lib/node_modules", "/usr/local/lib/node_modules"] })));
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const BASE = args.base ?? "http://localhost:3100";
const OUT = path.resolve("public/renders");
const only = args.only ? new Set(args.only.split(",")) : null;
const want = (n) => !only || only.has(n);

const TURNTABLES = ["copias", "automotivas", "fechaduras", "abertura", "seguranca", "emblema"];
const FRAMES = 24;
const SIZE = 480;
const COLS = 8;

const browser = await chromium.launch({ args: ["--ignore-gpu-blocklist"] });
await mkdir(OUT, { recursive: true });

async function open(query, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("  pageerror", e.message));
  await page.goto(`${BASE}/estudio/?${query}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__rendered !== undefined, null, { timeout: 180000 });
  return page;
}

async function grab(page, frame) {
  if (frame !== undefined) {
    await page.evaluate((i) => {
      window.__rendered = -1;
      window.__frame(i);
    }, frame);
    await page.waitForFunction((i) => window.__rendered === i, frame, { timeout: 120000 });
  }
  return page.locator("#stage").screenshot({ omitBackground: true, type: "png", timeout: 240000 });
}

for (const name of TURNTABLES.filter(want)) {
  const t0 = Date.now();
  const page = await open(`obj=${name}&size=${SIZE}&frames=${FRAMES}`, SIZE, SIZE);
  const frames = [];
  for (let i = 0; i < FRAMES; i++) frames.push(await grab(page, i));
  await page.close();
  const rows = Math.ceil(FRAMES / COLS);
  const sheet = await sharp({ create: { width: SIZE * COLS, height: SIZE * rows, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((input, i) => ({ input, left: (i % COLS) * SIZE, top: Math.floor(i / COLS) * SIZE })))
    .webp({ quality: 74, alphaQuality: 80, effort: 6 })
    .toBuffer();
  await writeFile(path.join(OUT, `${name}-360.webp`), sheet);
  await sharp(frames[0]).webp({ quality: 82, alphaQuality: 85 }).toFile(path.join(OUT, `${name}.webp`));
  console.log(`✓ ${name}  ${(sheet.length / 1024).toFixed(0)} KB  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

for (const name of ["pin", "spring", "screw"].filter(want)) {
  const page = await open(`obj=${name}&size=360`, 360, 360);
  const png = await grab(page);
  await page.close();
  await sharp(png).webp({ quality: 80, alphaQuality: 85 }).toFile(path.join(OUT, `part-${name}.webp`));
  console.log(`✓ part-${name}`);
}

const GALLERY = ["gal-cilindro", "gal-tetra", "gal-gorje", "gal-embutir", "gal-digital", "gal-chaves"];
for (const name of GALLERY.filter(want)) {
  const page = await open(`obj=${name}&w=1200&h=900&bg=1`, 1200, 900);
  const png = await grab(page);
  await page.close();
  await sharp(png).webp({ quality: 80 }).toFile(path.join(OUT, `${name}.webp`));
  console.log(`✓ ${name}`);
}

if (want("hero")) {
  for (const [label, w, h] of [["wide", 1920, 1200], ["tall", 1080, 1920]]) {
    const page = await open(`obj=hero&w=${w}&h=${h}`, w, h);
    await page.waitForTimeout(1500);
    const png = await grab(page);
    await page.close();
    await sharp(png).webp({ quality: 78, alphaQuality: 80, effort: 6 }).toFile(path.join(OUT, `hero-${label}.webp`));
    console.log(`✓ hero-${label}`);
  }
}

if (want("og")) {
  const page = await open(`obj=og&w=1200&h=630`, 1200, 630);
  await page.waitForTimeout(1500);
  const png = await grab(page);
  await page.close();
  await sharp(png).flatten({ background: "#090c11" }).jpeg({ quality: 86, mozjpeg: true }).toFile(path.resolve("public/og.jpg"));
  await sharp(png).flatten({ background: "#090c11" }).resize(180, 180, { fit: "cover", position: "right" }).png().toFile(path.resolve("public/apple-icon.png"));
  console.log("✓ og.jpg");
}

await browser.close();
