// Carrega a extensão de verdade no Chromium e roda a faxina no mock.
// Uso: node test/extension.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = path.join(here, '..', 'extensao');
const MOCK = readFileSync(path.join(here, 'mock-tiktok.html'), 'utf8');

const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(os.tmpdir(), 'trr-')), {
  headless: true,
  channel: 'chromium',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
await ctx.route('https://www.tiktok.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: MOCK }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  sessionStorage.setItem('mock:n', '4');
  localStorage.setItem('trr:settings:v1', JSON.stringify({ speed: 'turbo', limit: 0 }));
});
await page.goto('https://www.tiktok.com/foryou?v=menu');
const pill = page.locator('#trr-root .pill');
await pill.waitFor({ timeout: 15000 });
console.log('content script injetado; pílula:', (await pill.textContent()).trim());
await pill.click();
await page.locator('#trr-root').getByRole('button', { name: 'Começar' }).click();
await page.waitForFunction(() => /limpinho|Parei|erro|Terminei/i.test(
  document.querySelector('#trr-root').shadowRoot.querySelector('.st').textContent), null, { timeout: 180000 });
const status = await page.evaluate(() => document.querySelector('#trr-root').shadowRoot.querySelector('.st').textContent);
const events = await page.evaluate(() => window.__mockEvents);
const left = await page.evaluate(() => Object.values(window.__mockDb()).filter(Boolean).length);
await ctx.close();
console.log('status:', status);
console.log('eventos:', events.join(', '), '| sobraram:', left, '| erros:', errors.length);
process.exit(left === 0 && !events.some((e) => e.startsWith('repost ')) && !errors.length ? 0 : 1);
