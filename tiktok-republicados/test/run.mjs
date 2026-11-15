// Teste de ponta a ponta contra um "TikTok de mentirinha" (test/mock-tiktok.html).
// Uso: node test/run.mjs   (precisa do Playwright com Chromium)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const MOCK = readFileSync(path.join(here, 'mock-tiktok.html'), 'utf8');
const SCRIPT = readFileSync(path.join(here, '..', 'src', 'remover.js'), 'utf8');
const BOOKMARKLET_FILE = path.join(here, '..', 'dist', 'bookmarklet.txt');

async function scenario(browser, { name, variant, n = 6, limit = 0, inject = 'script' }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('https://www.tiktok.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: MOCK }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(({ n, limit }) => {
    sessionStorage.setItem('mock:n', String(n));
    localStorage.setItem('trr:settings:v1', JSON.stringify({ speed: 'turbo', limit }));
  }, { n, limit });
  await page.goto(`https://www.tiktok.com/foryou?v=${variant}`);

  if (inject === 'bookmarklet') {
    const bm = readFileSync(BOOKMARKLET_FILE, 'utf8').trim();
    if (!bm.startsWith('javascript:')) throw new Error('bookmarklet inválido');
    await page.evaluate((src) => (0, eval)(src), decodeURIComponent(bm.slice('javascript:'.length)));
  } else {
    await page.addScriptTag({ content: SCRIPT });
  }

  const root = page.locator('#trr-root');
  await root.getByRole('button', { name: 'Começar' }).click();
  const status = root.locator('.st');
  await page.waitForFunction(() => {
    const st = document.querySelector('#trr-root').shadowRoot.querySelector('.st');
    return /limpinho|Limite de|Parei|erro|Terminei|Recarrega/i.test(st.textContent);
  }, null, { timeout: 240000 });

  const finalStatus = await status.textContent();
  const dbState = await page.evaluate(() => window.__mockDb());
  const events = await page.evaluate(() => window.__mockEvents);
  const remaining = Object.values(dbState).filter(Boolean).length;
  const accidental = events.filter((e) => e.startsWith('repost '));
  const removed = events.filter((e) => e.startsWith('unrepost ')).length;
  const stats = await page.evaluate(() => {
    const s = document.querySelector('#trr-root').shadowRoot;
    return [...s.querySelectorAll('.stat i')].map((i) => i.textContent);
  });
  await page.screenshot({ path: path.join(here, `shot-${name}.png`) });
  await ctx.close();

  const expectRemaining = limit ? n - limit : 0;
  const ok = remaining === expectRemaining && accidental.length === 0 && errors.length === 0 && removed === n - expectRemaining;
  return { name, ok, finalStatus, remaining, removed, accidental, errors, stats };
}

const browser = await chromium.launch();
const results = await Promise.all([
  scenario(browser, { name: 'menu', variant: 'menu', n: 6 }),
  scenario(browser, { name: 'direto', variant: 'direct', n: 6 }),
  scenario(browser, { name: 'limite', variant: 'direct', n: 5, limit: 2 }),
  scenario(browser, { name: 'favorito', variant: 'menu', n: 3, inject: 'bookmarklet' }),
]);
await browser.close();

let allOk = true;
for (const r of results) {
  allOk = allOk && r.ok;
  console.log(`${r.ok ? 'PASSOU' : 'FALHOU'}  ${r.name.padEnd(9)} removidos=${r.removed} sobraram=${r.remaining} contadores=${r.stats.join('/')} acidentais=${r.accidental.length} erros=${r.errors.length}`);
  console.log(`          status: ${r.finalStatus}`);
  if (r.errors.length) console.log('          ', r.errors);
}
process.exit(allOk ? 0 : 1);
