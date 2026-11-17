import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { P } from '@vinlancord/shared';
import { gateway, registerUser, startServer, stopServer } from './helpers';

beforeAll(startServer);
afterAll(stopServer);

async function setup() {
  const owner = await registerUser('dono');
  const member = await registerUser('membro');
  const g = await owner.api.post('/guilds', { name: 'Servidor da Galera', template: 'amigos' });
  expect(g.status).toBe(200);
  const general = g.body.channels.find((c: any) => c.type === 'text');
  const inv = await owner.api.post(`/channels/${general.id}/invites`, { maxAge: 3600, maxUses: 0 });
  expect(inv.status).toBe(200);
  const join = await member.api.post(`/invites/${inv.body.code}`);
  expect(join.status).toBe(200);
  return { owner, member, guild: g.body, general, code: inv.body.code };
}

describe('servidores, canais e permissões', () => {
  it('cria servidor com modelo, canais e cargo @everyone', async () => {
    const { guild, owner } = await setup();
    expect(guild.roles).toHaveLength(1);
    expect(guild.roles[0].id).toBe(guild.id);
    expect(guild.channels.filter((c: any) => c.type === 'category').length).toBeGreaterThan(0);
    expect(guild.channels.some((c: any) => c.type === 'voice')).toBe(true);
    expect(guild.channels.some((c: any) => c.type === 'video')).toBe(true);
    const gw = await gateway(owner.token);
    expect(gw.ready.guilds.map((x: any) => x.id)).toContain(guild.id);
    gw.close();
  });

  it('prévia de convite pública e entrada com evento de novo membro', async () => {
    const owner = await registerUser('dono2');
    const g = await owner.api.post('/guilds', { name: 'Clube', template: 'vazio' });
    const ch = g.body.channels.find((c: any) => c.type === 'text');
    const inv = await owner.api.post(`/channels/${ch.id}/invites`, {});
    const gw = await gateway(owner.token);
    const joiner = await registerUser('novato');
    const preview = await joiner.api.get(`/invites/${inv.body.code}`);
    expect(preview.body.guild.name).toBe('Clube');
    expect(preview.body.guild.memberCount).toBe(1);
    await joiner.api.post(`/invites/${inv.body.code}`);
    const ev = await gw.waitFor('GUILD_MEMBER_ADD', (d) => d.member.userId === joiner.user.id);
    expect(ev.user.username).toBe(joiner.user.username);
    // mensagem de boas-vindas no canal do sistema
    await gw.waitFor('MESSAGE_CREATE', (d) => d.type === 'member_join' && d.author.id === joiner.user.id);
    gw.close();
  });

  it('canal privado fica invisível para quem não tem acesso', async () => {
    const { owner, member, guild } = await setup();
    const priv = await owner.api.post(`/guilds/${guild.id}/channels`, { name: 'Staff', type: 'text', private: true });
    expect(priv.status).toBe(200);
    expect((await member.api.get(`/channels/${priv.body.id}/messages`)).status).toBe(404);
    expect((await member.api.post(`/channels/${priv.body.id}/messages`, { content: 'oi' })).status).toBe(404);
    const full = await member.api.get(`/guilds/${guild.id}`);
    expect(full.body.channels.map((c: any) => c.id)).not.toContain(priv.body.id);
    // liberar para o membro via sobrescrita
    const gw = await gateway(member.token);
    await owner.api.put(`/channels/${priv.body.id}/permissions/${member.user.id}`, {
      type: 'member',
      allow: String(P.VIEW_CHANNEL | P.SEND_MESSAGES),
      deny: '0',
    });
    await gw.waitFor('CHANNEL_CREATE', (d) => d.id === priv.body.id);
    expect((await member.api.post(`/channels/${priv.body.id}/messages`, { content: 'agora sim' })).status).toBe(200);
    gw.close();
  });

  it('bloqueia envio quando @everyone perde SEND_MESSAGES no canal', async () => {
    const { owner, member, guild, general } = await setup();
    await owner.api.put(`/channels/${general.id}/permissions/${guild.id}`, { type: 'role', allow: '0', deny: String(P.SEND_MESSAGES) });
    expect((await member.api.post(`/channels/${general.id}/messages`, { content: 'oi' })).status).toBe(403);
    // dono continua podendo
    expect((await owner.api.post(`/channels/${general.id}/messages`, { content: 'oi' })).status).toBe(200);
  });

  it('cargos: só concede o que tem, respeita hierarquia e gerencia mensagens', async () => {
    const { owner, member, guild, general } = await setup();
    const third = await registerUser('terceiro');
    const inv = await owner.api.post(`/channels/${general.id}/invites`, {});
    await third.api.post(`/invites/${inv.body.code}`);

    const mod = await owner.api.post(`/guilds/${guild.id}/roles`, {
      name: 'Moderador',
      color: '#7c5cff',
      permissions: String(P.MANAGE_MESSAGES | P.KICK_MEMBERS | P.MANAGE_ROLES),
      hoist: true,
    });
    expect(mod.status).toBe(200);
    expect((await owner.api.patch(`/guilds/${guild.id}/members/${member.user.id}`, { roles: [mod.body.id] })).status).toBe(200);

    // moderador não pode criar cargo com ADMINISTRATOR
    const esc = await member.api.post(`/guilds/${guild.id}/roles`, { name: 'hack', permissions: String(P.ADMINISTRATOR) });
    expect(esc.status).toBe(403);
    // não pode se dar o próprio cargo de novo nem mexer no dono
    expect((await member.api.del(`/guilds/${guild.id}/members/${owner.user.id}`)).status).toBe(403);

    // apaga mensagem de outro
    const m = await third.api.post(`/channels/${general.id}/messages`, { content: 'spam' });
    expect((await third.api.del(`/channels/${general.id}/messages/${m.body.id}`)).status).toBe(200);
    const m2 = await third.api.post(`/channels/${general.id}/messages`, { content: 'spam 2' });
    expect((await member.api.del(`/channels/${general.id}/messages/${m2.body.id}`)).status).toBe(200);
    // terceiro não pode apagar do moderador
    const m3 = await member.api.post(`/channels/${general.id}/messages`, { content: 'regras' });
    expect((await third.api.del(`/channels/${general.id}/messages/${m3.body.id}`)).status).toBe(403);
    // expulsar
    expect((await member.api.del(`/guilds/${guild.id}/members/${third.user.id}`)).status).toBe(200);
    expect((await third.api.get(`/guilds/${guild.id}`)).status).toBe(404);
    const log = await owner.api.get(`/guilds/${guild.id}/audit-log`);
    expect(log.body.entries.map((e: any) => e.action)).toEqual(expect.arrayContaining(['MEMBER_KICK', 'ROLE_CREATE', 'MEMBER_ROLE_UPDATE']));
  });

  it('banimento remove o membro e impede retorno pelo convite', async () => {
    const { owner, member, guild, code } = await setup();
    const gw = await gateway(member.token);
    expect((await owner.api.put(`/guilds/${guild.id}/bans/${member.user.id}`, { reason: 'teste' })).status).toBe(200);
    await gw.waitFor('GUILD_DELETE', (d) => d.id === guild.id);
    const again = await member.api.post(`/invites/${code}`);
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('BANNED');
    const bans = await owner.api.get(`/guilds/${guild.id}/bans`);
    expect(bans.body[0].user.id).toBe(member.user.id);
    await owner.api.del(`/guilds/${guild.id}/bans/${member.user.id}`);
    expect((await member.api.post(`/invites/${code}`)).status).toBe(200);
    gw.close();
  });

  it('castigo (timeout) impede mensagens', async () => {
    const { owner, member, guild, general } = await setup();
    const until = new Date(Date.now() + 60_000).toISOString();
    expect((await owner.api.patch(`/guilds/${guild.id}/members/${member.user.id}`, { timeoutUntil: until })).status).toBe(200);
    expect((await member.api.post(`/channels/${general.id}/messages`, { content: 'oi' })).status).toBe(403);
    await owner.api.patch(`/guilds/${guild.id}/members/${member.user.id}`, { timeoutUntil: null });
    expect((await member.api.post(`/channels/${general.id}/messages`, { content: 'voltei' })).status).toBe(200);
  });

  it('dono não pode sair; membro pode; servidor público aparece no explorar', async () => {
    const { owner, member, guild } = await setup();
    expect((await owner.api.del(`/guilds/${guild.id}/members/@me`)).status).toBe(400);
    await owner.api.patch(`/guilds/${guild.id}`, { isPublic: true, description: 'Servidor aberto' });
    const disc = await member.api.get('/discover?q=Galera');
    expect(disc.body.some((g: any) => g.id === guild.id)).toBe(true);
    expect((await member.api.del(`/guilds/${guild.id}/members/@me`)).status).toBe(200);
    const pub = await member.api.post(`/discover/${guild.id}/join`);
    expect(pub.status).toBe(200);
    // excluir exige senha
    expect((await owner.api.del(`/guilds/${guild.id}`, { password: 'errada' })).status).toBe(403);
    expect((await owner.api.del(`/guilds/${guild.id}`, { password: owner.password })).status).toBe(200);
  });
});
