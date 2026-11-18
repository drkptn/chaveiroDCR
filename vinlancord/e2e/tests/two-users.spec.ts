/**
 * Fluxo completo com dois usuários independentes (Ana e Beto), em contextos
 * de navegador separados — equivalente a dois computadores:
 * cadastro → amizade → DM em tempo real → servidor + convite → reações e anexo
 * → canal de voz com áudio real → câmera → compartilhamento de tela
 * → queda de conexão e reconexão → chamada privada com toque → persistência.
 */
import { test, expect, type Page, type Browser } from '@playwright/test';
import { deflateSync } from 'node:zlib';

/** Gera um PNG RGB sólido (sem dependências) para testar anexos. */
function makePng(w: number, h: number, rgb: [number, number, number]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const stamp = Date.now().toString(36).slice(-5);
const ANA = { name: 'Ana', username: `ana_${stamp}`, email: `ana_${stamp}@e2e.dev`, password: 'senha-da-ana-123' };
const BETO = { name: 'Beto', username: `beto_${stamp}`, email: `beto_${stamp}@e2e.dev`, password: 'senha-do-beto-123' };

async function register(page: Page, u: typeof ANA) {
  await page.goto('/#/register');
  await page.locator('input[type=email]').fill(u.email);
  await page.locator('input[placeholder="D"]').fill(u.name);
  await page.locator('input[autocomplete=username]').fill(u.username);
  await page.locator('input[autocomplete=new-password]').fill(u.password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.waitForURL(/#\/channels\/@me/);
  await expect(page.getByRole('heading', { name: 'Ativos agora' })).toBeVisible();
}

/** Soma de bytes recebidos via WebRTC (prova que a mídia está fluindo de verdade). */
async function inbound(page: Page, kind: 'audio' | 'video') {
  return page.evaluate(async (k) => {
    const v = (window as any).__vlVoice;
    const st = await v.debugStats();
    return ((st.recv ?? []) as any[]).filter((r) => r.type === 'inbound-rtp' && r.kind === k).reduce((n, r) => n + (r.bytesReceived ?? 0), 0);
  }, kind);
}

async function outbound(page: Page, kind: 'audio' | 'video') {
  return page.evaluate(async (k) => {
    const v = (window as any).__vlVoice;
    const st = await v.debugStats();
    return ((st.send ?? []) as any[]).filter((r) => r.type === 'outbound-rtp' && r.kind === k).reduce((n, r) => n + (r.bytesSent ?? 0), 0);
  }, kind);
}

async function expectGrowing(fn: () => Promise<number>, label: string) {
  const a = await fn();
  await expect.poll(fn, { message: `${label} deveria aumentar`, timeout: 15_000, intervals: [500, 1000, 1500] }).toBeGreaterThan(a + 1000);
}

const openPages: Page[] = [];
const allErrors: string[][] = [];
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus) {
    for (const [i, p] of openPages.entries()) await p.screenshot({ path: info.outputPath(`falha-usuario-${i + 1}.png`) }).catch(() => {});
    allErrors.forEach((e, i) => e.length && console.log(`Erros do usuário ${i + 1}:\n` + e.join('\n')));
  }
});

async function newUser(browser: Browser) {
  const ctx = await browser.newContext();
  await ctx.grantPermissions(['microphone', 'camera', 'notifications']);
  const page = await ctx.newPage();
  openPages.push(page);
  const errors: string[] = [];
  allErrors.push(errors);
  page.on('pageerror', (e) => errors.push(e.message + '\n' + (e.stack ?? '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  return { ctx, page, errors };
}

test('dois usuários: amizade, chat, servidor, voz, vídeo, tela, reconexão e chamada', async ({ browser }) => {
  const A = await newUser(browser);
  const B = await newUser(browser);
  const a = A.page;
  const b = B.page;

  await test.step('cadastro dos dois usuários', async () => {
    await register(a, ANA);
    await register(b, BETO);
  });

  await test.step('pedido de amizade em tempo real', async () => {
    await a.getByRole('button', { name: 'Adicionar amigo' }).first().click();
    await a.getByPlaceholder('Nome de usuário ou ID').fill(BETO.username);
    await a.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(a.getByText(/Pedido de amizade enviado/)).toBeVisible();
    // Beto recebe sem recarregar
    await b.getByRole('button', { name: /Pendentes/ }).click();
    await expect(b.getByText(ANA.name, { exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Aceitar' }).click();
    await a.getByRole('button', { name: 'Todos' }).click();
    await expect(a.getByText(BETO.name, { exact: true }).first()).toBeVisible();
  });

  await test.step('mensagens diretas com indicador de digitação e Markdown', async () => {
    await a.getByRole('button', { name: 'Mensagem' }).first().click();
    await a.waitForURL(/#\/channels\/@me\/\d+/);
    const box = a.locator('textarea');
    await box.fill('Oi, Beto! Isso aqui é **negrito** e ~~tachado~~');
    await box.press('Enter');
    await expect(a.locator('strong', { hasText: 'negrito' })).toBeVisible();
    // Beto vê a DM aparecer e a mensagem chegar
    await b.getByRole('button', { name: 'Todos' }).click();
    await b.getByRole('button', { name: 'Mensagem' }).first().click();
    await expect(b.locator('strong', { hasText: 'negrito' })).toBeVisible();
    await expect(b.locator('s', { hasText: 'tachado' })).toBeVisible();
    // digitação
    await a.locator('textarea').pressSequentially('digitando…', { delay: 30 });
    await expect(b.getByText(/está digitando/)).toBeVisible();
    await a.locator('textarea').fill('');
    await b.locator('textarea').fill('Oi, Ana! Chegou certinho 🎉');
    await b.locator('textarea').press('Enter');
    await expect(a.getByText('Oi, Ana! Chegou certinho')).toBeVisible();
  });

  let inviteCode = '';
  await test.step('servidor, convite e entrada do segundo usuário', async () => {
    await a.getByRole('button', { name: 'Criar ou entrar em um servidor' }).click();
    const dlg = a.getByRole('dialog');
    await dlg.getByRole('button', { name: /^Amigos/ }).click();
    await dlg.locator('input:not([type=file])').fill('Resenha da Galera');
    await dlg.getByRole('button', { name: 'Criar servidor' }).click();
    await a.waitForURL(/#\/channels\/\d+\/\d+/);
    await expect(a.getByText('Bem-vindo(a) a #geral!')).toBeVisible();
    await a.getByRole('button', { name: /Resenha da Galera/ }).first().click();
    await a.getByRole('button', { name: 'Convidar pessoas' }).first().click();
    const linkInput = a.locator('input[readonly]');
    await expect(linkInput).toHaveValue(/invite\/[a-zA-Z0-9]+/);
    inviteCode = (await linkInput.inputValue()).split('/').pop()!;
    await a.keyboard.press('Escape');

    await b.getByRole('button', { name: 'Criar ou entrar em um servidor' }).click();
    await b.getByRole('dialog').getByRole('button', { name: 'Entrar em um servidor' }).click();
    await b.getByPlaceholder(/invite/).fill(inviteCode);
    await expect(b.getByRole('dialog').getByText('Resenha da Galera')).toBeVisible();
    await b.getByRole('dialog').getByRole('button', { name: 'Entrar', exact: true }).click();
    await b.waitForURL(/#\/channels\/\d+\/\d+/);
    // Ana vê a mensagem de boas-vindas do sistema
    await expect(a.getByText(new RegExp(BETO.name)).first()).toBeVisible();
  });

  await test.step('chat do servidor com reação e anexo', async () => {
    await a.locator('textarea').fill(`Bem-vindo, @${BETO.username}!`);
    await a.locator('textarea').press('Enter');
    const msg = b.locator('[data-mid]', { hasText: 'Bem-vindo,' }).last();
    await expect(msg).toBeVisible();
    await expect(msg.locator('.mention')).toHaveText(`@${BETO.name}`);
    await msg.hover();
    await msg.getByRole('button', { name: 'Reagir com 👍' }).click();
    await expect(a.locator('[data-mid]', { hasText: 'Bem-vindo,' }).last().getByRole('button', { name: /👍\s*1/ })).toBeVisible();

    // anexo de imagem (PNG gerado na hora)
    const png = makePng(160, 90, [124, 92, 255]);
    await a.locator('input[type=file]').first().setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png });
    await a.locator('textarea').fill('olha essa imagem');
    await a.locator('textarea').press('Enter');
    await expect(b.locator('img[alt="pixel.png"]')).toBeVisible();
    await expect.poll(() => b.locator('img[alt="pixel.png"]').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(160);
  });

  await test.step('canal de voz com áudio real entre os dois', async () => {
    await a.getByText('Resenha', { exact: true }).click();
    await expect(a.getByRole('button', { name: 'Desconectar da chamada' })).toBeVisible();
    await b.getByText('Resenha', { exact: true }).click();
    await expect(b.getByRole('button', { name: 'Desconectar da chamada' })).toBeVisible();
    // os dois aparecem na lista do canal
    await expect(a.locator('aside').getByText(BETO.name, { exact: true }).first()).toBeVisible();
    await expectGrowing(() => outbound(a, 'audio'), 'áudio enviado pela Ana');
    await expectGrowing(() => inbound(b, 'audio'), 'áudio recebido pelo Beto');
    await expectGrowing(() => inbound(a, 'audio'), 'áudio recebido pela Ana');
    await expect(a.getByText('Voz conectada')).toBeVisible();
  });

  await test.step('câmera ligada chega ao outro lado', async () => {
    await a.getByRole('button', { name: 'Ligar câmera' }).click();
    await expectGrowing(() => inbound(b, 'video'), 'vídeo recebido pelo Beto');
    await expect.poll(() => b.evaluate(() => [...document.querySelectorAll('video')].some((v) => v.videoWidth > 0))).toBe(true);
    await a.getByRole('button', { name: 'Desligar câmera' }).click();
  });

  await test.step('compartilhamento de tela com "assistir transmissão"', async () => {
    await a.getByRole('button', { name: 'Compartilhar tela' }).click();
    await a.getByRole('button', { name: 'Transmitir' }).click();
    await expect(a.getByRole('button', { name: 'Parar compartilhamento' })).toBeVisible();
    await expect(b.getByText(/AO VIVO/).first()).toBeVisible();
    await b.getByRole('button', { name: 'Assistir transmissão' }).click();
    await expect
      .poll(() => b.evaluate(() => [...document.querySelectorAll('video')].map((v) => v.videoWidth).sort((x, y) => y - x)[0] ?? 0), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(640);
    await a.getByRole('button', { name: 'Parar compartilhamento' }).click();
    await expect(b.getByText(/AO VIVO/)).toHaveCount(0);
  });

  await test.step('queda de rede: reconecta e a chamada continua', async () => {
    await A.ctx.setOffline(true);
    await a.waitForTimeout(3000);
    await A.ctx.setOffline(false);
    await expect(a.getByText(/Conexão perdida/)).toHaveCount(0, { timeout: 30_000 });
    await expectGrowing(() => inbound(a, 'audio'), 'áudio após reconexão');
    await a.getByRole('button', { name: 'Desconectar da chamada' }).click();
    await b.getByRole('button', { name: 'Desconectar da chamada' }).click();
  });

  await test.step('chamada privada com toque e atendimento', async () => {
    await a.getByRole('button', { name: 'Mensagens diretas' }).click();
    await a.locator('nav[aria-label="Servidores"]').waitFor();
    await a.getByText(BETO.name, { exact: true }).first().click();
    await a.getByRole('button', { name: 'Iniciar chamada de voz' }).click();
    await expect(b.getByText('Chamada recebida…')).toBeVisible();
    await b.getByRole('button', { name: 'Atender chamada' }).click();
    await expectGrowing(() => inbound(b, 'audio'), 'áudio da chamada privada');
    await a.getByRole('button', { name: 'Desconectar da chamada' }).first().click();
    await b.getByRole('button', { name: 'Desconectar da chamada' }).first().click();
    await expect(b.getByText(/iniciou uma chamada que durou/)).toBeVisible();
  });

  await test.step('persistência: histórico continua após recarregar', async () => {
    await b.reload();
    await expect(b.getByText('Oi, Ana! Chegou certinho')).toBeVisible();
  });

  expect(A.errors, 'erros de página da Ana').toEqual([]);
  expect(B.errors, 'erros de página do Beto').toEqual([]);
  await A.ctx.close();
  await B.ctx.close();
});
