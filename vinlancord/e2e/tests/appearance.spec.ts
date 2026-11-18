/**
 * Personalização ponta a ponta: escolher a estética antes de entrar, mudar
 * detalhes no Estúdio de Aparência e ver tudo acompanhar a conta em outro
 * dispositivo (contexto de navegador separado).
 */
import { test, expect, type Page } from '@playwright/test';

const stamp = Date.now().toString(36).slice(-5);
const U = { name: 'Corvo', username: `corvo_${stamp}`, email: `corvo_${stamp}@e2e.dev`, password: 'senha-do-corvo-123' };

const preset = (p: Page) => p.evaluate(() => document.documentElement.dataset.preset);
const attr = (p: Page, k: string) => p.evaluate((k) => document.documentElement.dataset[k], k);

test('estética escolhida e personalizada acompanha a conta', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();

  // 1) Antes de entrar: escolhe "Muralha" na tela de cadastro
  await a.goto('/#/register');
  await a.getByRole('button', { name: 'Muralha', exact: true }).click();
  await expect.poll(() => preset(a)).toBe('muralha');
  await a.locator('input[type=email]').fill(U.email);
  await a.locator('input[placeholder="D"]').fill(U.name);
  await a.locator('input[autocomplete=username]').fill(U.username);
  await a.locator('input[autocomplete=new-password]').fill(U.password);
  await a.getByRole('button', { name: 'Criar conta' }).click();
  await a.waitForURL(/#\/channels\/@me/);
  await expect(a.getByRole('heading', { name: 'Ativos agora' })).toBeVisible();
  // a escolha feita antes do login vira a estética da conta
  await expect.poll(() => preset(a)).toBe('muralha');
  await expect(a.locator('.vl-ambience canvas')).toBeVisible();

  // 2) No Estúdio: troca para "Rebelião" e muda formas e animações
  await a.getByRole('button', { name: 'Configurações' }).first().click();
  await a.getByRole('button', { name: 'Aparência' }).click();
  await expect(a.getByRole('heading', { name: 'Estúdio de Aparência' })).toBeVisible();
  await a.getByRole('button', { name: /^Rebelião/ }).first().click();
  await expect.poll(() => preset(a)).toBe('rebeliao');
  await a.getByRole('tab', { name: 'Formas' }).click();
  await a.getByRole('button', { name: /^Losango/ }).first().click();
  await expect.poll(() => attr(a, 'serverShape')).toBe('diamond');
  await a.getByRole('button', { name: /^Carta/ }).click();
  await expect.poll(() => attr(a, 'msg')).toBe('letter');
  await a.getByRole('tab', { name: 'Animações' }).click();
  await a.getByRole('button', { name: /^Persiana/ }).click();
  await expect.poll(() => attr(a, 'transition')).toBe('shutter');
  await a.getByRole('tab', { name: 'Cores' }).click();
  await a.getByRole('button', { name: 'Destaque #22d3ee' }).click();
  await expect.poll(() => a.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--vl-accent').trim())).toBe('#22d3ee');
  await a.keyboard.press('Escape');

  // salvo na conta (o estúdio salva com um pequeno atraso)
  await expect
    .poll(async () => {
      const s = await a.evaluate(async () => {
        const r = await fetch('/api/v1/users/@me/settings', { headers: { authorization: `Bearer ${localStorage.getItem('vl:token')}` } });
        return r.json();
      });
      return [s.appearance?.preset, s.appearance?.serverShape, s.appearance?.messageStyle, s.appearance?.transition, s.appearance?.colors?.accent].join(',');
    })
    .toBe('rebeliao,diamond,letter,shutter,#22d3ee');

  // 3) Outro dispositivo: entra na mesma conta e recebe a aparência
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto('/#/login');
  await b.locator('input').first().fill(U.email);
  await b.locator('input[type=password]').fill(U.password);
  await b.getByRole('button', { name: 'Entrar' }).click();
  await b.waitForURL(/#\/channels\/@me/);
  await expect.poll(() => preset(b)).toBe('rebeliao');
  await expect.poll(() => attr(b, 'serverShape')).toBe('diamond');
  await expect.poll(() => b.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--vl-accent').trim())).toBe('#22d3ee');

  // 4) Mudança ao vivo num dispositivo chega no outro pelo gateway
  await a.getByRole('button', { name: 'Configurações' }).first().click();
  await a.getByRole('button', { name: 'Aparência' }).click();
  await a.getByRole('button', { name: /^Pergaminho/ }).first().click();
  await expect.poll(() => preset(a)).toBe('pergaminho');
  await expect.poll(() => preset(b), { timeout: 15_000 }).toBe('pergaminho');
  await expect.poll(() => b.evaluate(() => document.documentElement.classList.contains('light'))).toBe(true);

  await ctxA.close();
  await ctxB.close();
});
