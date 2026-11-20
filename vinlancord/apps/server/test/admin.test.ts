import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gateway, registerUser, startServer, stopServer, sleep } from './helpers';

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
    expect((await ok.json()).badges).toEqual(['creator']);
    // aparece no perfil público para outro usuário e chega ao vivo
    const prof = await amigo.api.get(`/users/${d.user.id}/profile`);
    expect(prof.body.user.badges).toEqual(['creator']);
    await sleep(200);
    expect(gw.events.some((e) => e.t === 'USER_UPDATE' && (e.d as { badges?: string[] }).badges?.includes('creator'))).toBe(true);
    gw.close();
    // remove
    const off = await admin(`/admin/users/${d.user.username}/badges`, { badges: [] }, 'test-admin-token-test-admin-token-123');
    expect((await off.json()).badges).toEqual([]);
    expect((await amigo.api.get(`/users/${d.user.id}/profile`)).body.user.badges).toBeUndefined();
  });
});
