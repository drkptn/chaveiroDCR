/**
 * Teste do app desktop (Electron): janela sem moldura, splash, ponte segura,
 * token no cofre do sistema, seletor de telas e configurações do Windows.
 * Requer o app compilado (npm run build -w @vinlancord/desktop) e, no Linux, um display (xvfb-run).
 * Rode com: DESKTOP_E2E=1 xvfb-run -a npx playwright test desktop
 */
import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.skip(!process.env.DESKTOP_E2E, 'defina DESKTOP_E2E=1 para testar o app desktop');

test('app desktop abre, autentica e expõe recursos nativos', async ({ baseURL }) => {
  const app = await electron.launch({
    executablePath: require('electron') as unknown as string,
    args: [join(__dirname, '..', '..', 'apps', 'desktop'), '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: { ...process.env, VINLANCORD_USER_DATA: mkdtempSync(join(tmpdir(), 'vinlancord-e2e-')) },
  });
  await expect.poll(() => app.windows().some((w) => w.url().startsWith('app://vinlancord'))).toBe(true);
  const win = app.windows().find((w) => w.url().startsWith('app://vinlancord'))!;
  await win.waitForLoadState();
  // aponta o app para o servidor de teste
  await win.evaluate((url) => localStorage.setItem('vl:server', url!), baseURL);
  await win.reload();
  await expect(win.getByText('Que bom te ver de novo!')).toBeVisible();
  // barra de título própria com botões de janela
  await expect(win.getByRole('button', { name: 'Minimizar' })).toBeVisible();
  await expect(win.getByRole('button', { name: 'Fechar' })).toBeVisible();

  const s = Date.now().toString(36).slice(-5);
  await win.getByText('Criar conta').click();
  await win.locator('input[type=email]').fill(`desk_${s}@e2e.dev`);
  await win.locator('input[autocomplete=username]').fill(`desk_${s}`);
  await win.locator('input[autocomplete=new-password]').fill('senha-desktop-123');
  await win.getByRole('button', { name: 'Criar conta' }).click();
  await expect(win.getByRole('heading', { name: 'Ativos agora' })).toBeVisible();

  const native = await win.evaluate(async () => {
    const v = (window as any).vinlancord;
    return {
      tokenNoCofre: !!(await v.secure.get('vl:token')),
      tokenNoLocalStorage: localStorage.getItem('vl:token'),
      telas: (await v.screen.getSources()).filter((x: { type: string }) => x.type === 'screen').length,
      processos: (await v.activity.listProcesses()).length,
      configuracoes: await v.settings.get(),
    };
  });
  expect(native.tokenNoCofre).toBe(true);
  expect(native.tokenNoLocalStorage).toBeNull();
  expect(native.telas).toBeGreaterThan(0);
  expect(native.processos).toBeGreaterThan(0);
  expect(native.configuracoes).toMatchObject({ minimizeToTray: true });
  await app.close();
});
