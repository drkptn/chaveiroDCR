import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, gateway, registerUser, startServer, stopServer, sleep } from './helpers';

beforeAll(startServer);
afterAll(stopServer);

describe('autenticação', () => {
  it('cria conta, faz login por usuário e e-mail e rejeita senha errada', async () => {
    const u = await registerUser('ana');
    expect(u.user.username).toMatch(/^ana/);
    expect(u.user.passwordHash).toBeUndefined();
    const byName = await client().post('/auth/login', { login: u.user.username, password: u.password });
    expect(byName.status).toBe(200);
    expect(byName.body.token).toBeTruthy();
    const byEmail = await client().post('/auth/login', { login: u.user.email.toUpperCase(), password: u.password });
    expect(byEmail.status).toBe(200);
    const wrong = await client().post('/auth/login', { login: u.user.username, password: 'errada-123456' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    const ghost = await client().post('/auth/login', { login: 'naoexiste', password: 'qualquer-123' });
    expect(ghost.status).toBe(401);
  });

  it('impede nomes e e-mails duplicados e valida campos', async () => {
    const u = await registerUser('bia');
    const dup = await client().post('/auth/register', { email: u.user.email, username: u.user.username, password: 'outra-senha-123' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.fields.email).toBeTruthy();
    expect(dup.body.error.fields.username).toBeTruthy();
    const bad = await client().post('/auth/register', { email: 'x', username: 'A B', password: '1' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(['email', 'username', 'password']));
  });

  it('exige token nas rotas protegidas', async () => {
    expect((await client().get('/users/@me')).status).toBe(401);
    expect((await client('token-falso-token-falso-123').get('/users/@me')).status).toBe(401);
  });

  it('lista e revoga sessões (dispositivos conectados)', async () => {
    const u = await registerUser('caio');
    const second = await client().post('/auth/login', { login: u.user.username, password: u.password, device: { name: 'PC do quarto', platform: 'desktop' } });
    const sessions = await u.api.get('/auth/sessions');
    expect(sessions.body).toHaveLength(2);
    expect(sessions.body.filter((s: any) => s.current)).toHaveLength(1);
    const gw = await gateway(second.body.token);
    const other = sessions.body.find((s: any) => !s.current);
    expect((await u.api.del(`/auth/sessions/${other.id}`)).status).toBe(200);
    await gw.waitFor('SESSION_REVOKED');
    await sleep(100);
    expect(gw.ws.readyState).toBeGreaterThanOrEqual(2);
    const after = await client(second.body.token).get('/users/@me');
    expect(after.status).toBe(401);
  });

  it('recupera senha por e-mail e invalida sessões antigas', async () => {
    const { testOutbox } = await import('../src/lib/mailer');
    const u = await registerUser('duda');
    expect((await client().post('/auth/forgot-password', { email: u.user.email })).status).toBe(200);
    // resposta igual para e-mail inexistente
    expect((await client().post('/auth/forgot-password', { email: 'ninguem@test.dev' })).status).toBe(200);
    const mail = testOutbox.get(u.user.email)!;
    expect(mail.subject).toMatch(/senha/i);
    const token = new URL(mail.link.replace('/#/', '/')).searchParams.get('token')!;
    expect((await client().post('/auth/reset-password', { token, password: 'nova-senha-forte-9' })).status).toBe(200);
    expect((await client().post('/auth/reset-password', { token, password: 'nova-senha-forte-9' })).status).toBe(400);
    expect((await u.api.get('/users/@me')).status).toBe(401);
    const login = await client().post('/auth/login', { login: u.user.username, password: 'nova-senha-forte-9' });
    expect(login.status).toBe(200);
  });

  it('verifica e-mail', async () => {
    const { testOutbox } = await import('../src/lib/mailer');
    const u = await registerUser('edu');
    const mail = testOutbox.get(u.user.email)!;
    const token = new URL(mail.link.replace('/#/', '/')).searchParams.get('token')!;
    expect((await client().post('/auth/verify-email', { token })).status).toBe(200);
    expect((await u.api.get('/users/@me')).body.emailVerified).toBe(true);
  });

  it('altera nome de usuário e senha exigindo a senha atual', async () => {
    const u = await registerUser('fabi');
    const wrong = await u.api.patch('/users/@me/username', { username: 'fabi_nova', password: 'errada-000' });
    expect(wrong.status).toBe(403);
    const ok = await u.api.patch('/users/@me/username', { username: `fabi_${Date.now() % 100000}`, password: u.password });
    expect(ok.status).toBe(200);
    const pw = await u.api.patch('/users/@me/password', { currentPassword: u.password, newPassword: 'outra-senha-boa-1' });
    expect(pw.status).toBe(200);
    // a sessão atual continua válida
    expect((await u.api.get('/users/@me')).status).toBe(200);
  });

  it('salva configurações e status', async () => {
    const u = await registerUser('gabi');
    const s = await u.api.patch('/users/@me/settings', { theme: 'aurora', accent: '#22d3ee', privacy: { showActivity: false } });
    expect(s.status).toBe(200);
    expect(s.body.theme).toBe('aurora');
    expect(s.body.privacy.showActivity).toBe(false);
    expect(s.body.privacy.dmsFrom).toBe('server_members');
    const bad = await u.api.patch('/users/@me/settings', { accent: 'red' });
    expect(bad.status).toBe(400);
    const st = await u.api.put('/users/@me/status', { status: 'dnd' });
    expect(st.body.status).toBe('dnd');
    const cs = await u.api.put('/users/@me/custom-status', { text: 'jogando bola', emoji: '⚽', expiresAt: null });
    expect(cs.body.customStatus.text).toBe('jogando bola');
    const cleared = await u.api.put('/users/@me/custom-status', null);
    expect(cleared.body.customStatus).toBeNull();
  });
});
