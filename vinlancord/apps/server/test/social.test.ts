import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gateway, makeFriends, registerUser, startServer, stopServer } from './helpers';

beforeAll(startServer);
afterAll(stopServer);

describe('amizades e DMs', () => {
  it('envia, recebe e aceita pedido de amizade com eventos em tempo real', async () => {
    const a = await registerUser('ana');
    const b = await registerUser('beto');
    const gwA = await gateway(a.token);
    const gwB = await gateway(b.token);
    const r = await a.api.post('/relationships', { username: b.user.username });
    expect(r.status).toBe(200);
    expect(r.body.type).toBe('outgoing');
    const inc = await gwB.waitFor('RELATIONSHIP_ADD', (d) => d.type === 'incoming');
    expect(inc.user.id).toBe(a.user.id);
    expect((await b.api.put(`/relationships/${a.user.id}`)).body.type).toBe('friend');
    await gwA.waitFor('RELATIONSHIP_ADD', (d) => d.type === 'friend');
    // amigo passa a receber presença
    await gwA.waitFor('PRESENCE_UPDATE', (d) => d.userId === b.user.id && d.status === 'online');
    const list = await a.api.get('/relationships');
    expect(list.body.map((x: any) => x.type)).toEqual(['friend']);
    // remover
    await a.api.del(`/relationships/${b.user.id}`);
    await gwB.waitFor('RELATIONSHIP_REMOVE', (d) => d.id === a.user.id);
    gwA.close();
    gwB.close();
  });

  it('não permite adicionar a si mesmo nem quem bloqueou', async () => {
    const a = await registerUser('cris');
    const b = await registerUser('dani');
    expect((await a.api.post('/relationships', { userId: a.user.id })).status).toBe(400);
    await b.api.put(`/relationships/${a.user.id}/block`);
    const r = await a.api.post('/relationships', { userId: b.user.id });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('FRIEND_REQUEST_BLOCKED');
    // DM bloqueada
    const dm = await a.api.post('/users/@me/channels', { recipients: [b.user.id] });
    expect(dm.status).toBe(403);
  });

  it('respeita privacidade de pedidos de amizade e DMs', async () => {
    const a = await registerUser('eva');
    const b = await registerUser('fred');
    await b.api.patch('/users/@me/settings', { privacy: { friendRequestsFrom: 'nobody', dmsFrom: 'friends' } });
    expect((await a.api.post('/relationships', { userId: b.user.id })).status).toBe(400);
    expect((await a.api.post('/users/@me/channels', { recipients: [b.user.id] })).body.error.code).toBe('DM_PRIVACY');
  });

  it('troca mensagens privadas em tempo real com indicador de digitação', async () => {
    const a = await registerUser('gil');
    const b = await registerUser('hana');
    await makeFriends(a, b);
    const gwB = await gateway(b.token);
    const gwA = await gateway(a.token);
    const dm = await a.api.post('/users/@me/channels', { recipients: [b.user.id] });
    expect(dm.status).toBe(200);
    expect(dm.body.type).toBe('dm');
    await gwA.rpc('typing.start', { channelId: dm.body.id });
    const typing = await gwB.waitFor('TYPING_START', (d) => d.channelId === dm.body.id);
    expect(typing.userId).toBe(a.user.id);
    const sent = await a.api.post(`/channels/${dm.body.id}/messages`, { content: 'oi **D**! <script>x</script>', nonce: 'n1' });
    expect(sent.status).toBe(200);
    // DM fechada reabre para o destinatário
    await gwB.waitFor('CHANNEL_CREATE', (d) => d.id === dm.body.id);
    const msg = await gwB.waitFor('MESSAGE_CREATE', (d) => d.channelId === dm.body.id);
    expect(msg.content).toBe('oi **D**! <script>x</script>');
    expect(msg.author.id).toBe(a.user.id);
    expect(msg.nonce).toBe('n1');
    const hist = await b.api.get(`/channels/${dm.body.id}/messages`);
    expect(hist.body).toHaveLength(1);
    // terceiro não vê a DM
    const c = await registerUser('ivo');
    expect((await c.api.get(`/channels/${dm.body.id}/messages`)).status).toBe(404);
    expect((await c.api.post(`/channels/${dm.body.id}/messages`, { content: 'intruso' })).status).toBe(404);
    gwA.close();
    gwB.close();
  });

  it('cria grupo apenas com amigos', async () => {
    const a = await registerUser('jo');
    const b = await registerUser('ka');
    const c = await registerUser('lu');
    await makeFriends(a, b);
    expect((await a.api.post('/users/@me/channels', { recipients: [b.user.id, c.user.id] })).status).toBe(403);
    await makeFriends(a, c);
    const g = await a.api.post('/users/@me/channels', { recipients: [b.user.id, c.user.id] });
    expect(g.body.type).toBe('group_dm');
    expect(g.body.recipients).toHaveLength(3);
    const renamed = await b.api.patch(`/channels/${g.body.id}`, { name: 'Rolê de sexta' });
    expect(renamed.body.name).toBe('Rolê de sexta');
  });

  it('esconde detalhes do perfil conforme a privacidade', async () => {
    const a = await registerUser('mia');
    const b = await registerUser('nico');
    await b.api.patch('/users/@me', { bio: 'minha bio secreta', links: [{ label: 'site', url: 'https://example.com' }] });
    await b.api.patch('/users/@me/settings', { privacy: { profileDetails: 'friends' } });
    const p1 = await a.api.get(`/users/${b.user.id}/profile`);
    expect(p1.body.bio).toBeNull();
    expect(p1.body.hidden).toContain('bio');
    await makeFriends(a, b);
    const p2 = await a.api.get(`/users/${b.user.id}/profile`);
    expect(p2.body.bio).toBe('minha bio secreta');
    expect(p2.body.relationship).toBe('friend');
    const bad = await b.api.patch('/users/@me', { links: [{ label: 'x', url: 'javascript:alert(1)' }] });
    expect(bad.status).toBe(400);
  });
});
