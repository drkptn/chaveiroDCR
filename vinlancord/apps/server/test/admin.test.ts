import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, gateway, registerUser, startServer, stopServer, sleep } from './helpers';

let base = '';
beforeAll(async () => {
  base = await startServer();
});
afterAll(stopServer);

const admin = (path: string, body: unknown, token?: string) =>
  fetch(`${base}/api/v1${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(token !== undefined ? { 'x-admin-token': token } : {}) },
    body: JSON.stringify(body),
  });

describe('selos do operador', () => {
  it('só o operador (ADMIN_TOKEN) concede o selo de criador, e todos veem', async () => {
    const d = await registerUser('criador');
    const amigo = await registerUser('amigo');
    // ninguém se dá selo pela API normal
    const self = await d.api.patch('/users/@me', { badges: ['creator'] } as never);
    expect(self.body?.badges).toBeUndefined();
    // sem chave / chave errada
    expect((await admin(`/admin/users/${d.user.username}/badges`, { badges: ['creator'] })).status).toBe(403);
    expect((await admin(`/admin/users/${d.user.username}/badges`, { badges: ['creator'] }, 'chave-errada-chave-errada-123')).status).toBe(403);
    // selo desconhecido
    expect((await admin(`/admin/users/${d.user.username}/badges`, { badges: ['deus'] }, 'test-admin-token-test-admin-token-123')).status).toBe(400);
    // concede
    const gw = await gateway(d.token);
    const ok = await admin(`/admin/users/${d.user.username}/badges`, { badges: ['creator'] }, 'test-admin-token-test-admin-token-123');
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { badges: string[] }).badges).toEqual(['creator']);
    // aparece no perfil público para outro usuário e chega ao vivo
    const prof = await amigo.api.get(`/users/${d.user.id}/profile`);
    expect(prof.body.user.badges).toEqual(['creator']);
    await sleep(200);
    expect(gw.events.some((e) => e.t === 'USER_UPDATE' && (e.d as { badges?: string[] }).badges?.includes('creator'))).toBe(true);
    gw.close();
    // remove
    const off = await admin(`/admin/users/${d.user.username}/badges`, { badges: [] }, 'test-admin-token-test-admin-token-123');
    expect(((await off.json()) as { badges: string[] }).badges).toEqual([]);
    expect((await amigo.api.get(`/users/${d.user.id}/profile`)).body.user.badges).toBeUndefined();
  });
});

describe('Painel do Criador', () => {
  const TOKEN = 'test-admin-token-test-admin-token-123';
  it('só a conta criadora usa o painel; criador é único; suspender, anunciar e apagar funcionam', async () => {
    const d = await registerUser('lord');
    const outro = await registerUser('outro');
    const vitima = await registerUser('vitima');
    // ninguém é criador ainda
    expect((await d.api.get('/creator/overview')).status).toBe(403);
    expect((await admin(`/admin/users/${d.user.username}/badges`, { badges: ['creator'] }, TOKEN)).status).toBe(200);
    expect((await outro.api.get('/creator/overview')).status).toBe(403);
    const ov = await d.api.get('/creator/overview');
    expect(ov.status).toBe(200);
    expect(ov.body.users).toBeGreaterThanOrEqual(3);

    // lista de contas e busca
    const list = await d.api.get(`/creator/users?q=${vitima.user.username}`);
    expect(list.body.map((r: { user: { id: string } }) => r.user.id)).toContain(vitima.user.id);

    // suspender: sessão cai e login é recusado; reativar volta ao normal
    expect((await d.api.post(`/creator/users/${d.user.id}/suspend`, { suspended: true })).status).toBe(403);
    expect((await d.api.post(`/creator/users/${vitima.user.id}/suspend`, { suspended: true })).status).toBe(200);
    expect((await vitima.api.get('/users/@me')).status).toBe(401);
    const login = await client().post('/auth/login', { login: vitima.user.username, password: vitima.password });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect((await d.api.post(`/creator/users/${vitima.user.id}/suspend`, { suspended: false })).status).toBe(200);
    expect((await client().post('/auth/login', { login: vitima.user.username, password: vitima.password })).status).toBe(200);

    // anúncio chega a quem está conectado
    const gw = await gateway(outro.token);
    const ann = await d.api.post('/creator/announce', { text: 'Atualização hoje à noite!' });
    expect(ann.status).toBe(200);
    const ev = await gw.waitFor('ANNOUNCEMENT');
    expect((ev as { text: string }).text).toBe('Atualização hoje à noite!');
    gw.close();

    // apagar comunidade de outra pessoa
    const g = await outro.api.post('/guilds', { name: 'Comunidade do outro' });
    expect((await d.api.get('/creator/guilds')).body.some((x: { id: string }) => x.id === g.body.id)).toBe(true);
    expect((await d.api.del(`/creator/guilds/${g.body.id}`)).status).toBe(200);
    expect((await outro.api.get(`/guilds/${g.body.id}`)).status).toBe(404);

    // criador é único: registrar outra conta tira o selo da anterior
    expect((await admin(`/admin/users/${outro.user.username}/badges`, { badges: ['creator'] }, TOKEN)).status).toBe(200);
    expect((await d.api.get('/creator/overview')).status).toBe(403);
    expect((await outro.api.get('/creator/overview')).status).toBe(200);
  });
});
