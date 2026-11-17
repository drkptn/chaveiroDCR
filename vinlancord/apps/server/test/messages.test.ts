import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { gateway, registerUser, startServer, stopServer } from './helpers';

let base = '';
beforeAll(async () => {
  base = await startServer();
});
afterAll(stopServer);

async function setup() {
  const owner = await registerUser('dona');
  const member = await registerUser('parca');
  const g = await owner.api.post('/guilds', { name: 'Chat', template: 'vazio' });
  const ch = g.body.channels.find((c: any) => c.type === 'text');
  const inv = await owner.api.post(`/channels/${ch.id}/invites`, {});
  await member.api.post(`/invites/${inv.body.code}`);
  return { owner, member, guild: g.body, ch };
}

function upload(api: any, name: string, buf: Buffer, type = 'application/octet-stream') {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(buf)], { type }), name);
  return api.post('/attachments', fd);
}

describe('chat', () => {
  it('envia, edita, responde, reage, fixa e apaga mensagens com eventos', async () => {
    const { owner, member, ch } = await setup();
    const gw = await gateway(member.token);
    const m1 = await owner.api.post(`/channels/${ch.id}/messages`, { content: 'primeira' });
    expect(m1.status).toBe(200);
    await gw.waitFor('MESSAGE_CREATE', (d) => d.id === m1.body.id);

    const reply = await member.api.post(`/channels/${ch.id}/messages`, { content: 'respondendo', replyTo: m1.body.id });
    expect(reply.body.type).toBe('reply');
    expect(reply.body.reference.id).toBe(m1.body.id);
    expect(reply.body.mentions).toContain(owner.user.id);

    const edited = await owner.api.patch(`/channels/${ch.id}/messages/${m1.body.id}`, { content: 'primeira (editada)' });
    expect(edited.body.editedAt).toBeTruthy();
    await gw.waitFor('MESSAGE_UPDATE', (d) => d.id === m1.body.id);
    expect((await member.api.patch(`/channels/${ch.id}/messages/${m1.body.id}`, { content: 'hack' })).status).toBe(403);

    const emoji = encodeURIComponent('🔥');
    expect((await member.api.put(`/channels/${ch.id}/messages/${m1.body.id}/reactions/${emoji}/@me`)).status).toBe(200);
    await gw.waitFor('MESSAGE_REACTION_ADD', (d) => d.messageId === m1.body.id && d.emoji.name === '🔥');
    expect((await member.api.put(`/channels/${ch.id}/messages/${m1.body.id}/reactions/${encodeURIComponent('abc')}/@me`)).status).toBe(400);
    const hist = await owner.api.get(`/channels/${ch.id}/messages`);
    const r = hist.body.find((m: any) => m.id === m1.body.id).reactions[0];
    expect(r).toMatchObject({ count: 1, me: false, emoji: { name: '🔥' } });
    await member.api.del(`/channels/${ch.id}/messages/${m1.body.id}/reactions/${emoji}/@me`);
    await gw.waitFor('MESSAGE_REACTION_REMOVE', (d) => d.messageId === m1.body.id);

    // membros comuns não fixam; dono sim
    expect((await member.api.put(`/channels/${ch.id}/pins/${m1.body.id}`)).status).toBe(403);
    expect((await owner.api.put(`/channels/${ch.id}/pins/${m1.body.id}`)).status).toBe(200);
    const pins = await member.api.get(`/channels/${ch.id}/pins`);
    expect(pins.body.map((m: any) => m.id)).toEqual([m1.body.id]);

    expect((await owner.api.del(`/channels/${ch.id}/messages/${m1.body.id}`)).status).toBe(200);
    await gw.waitFor('MESSAGE_DELETE', (d) => d.id === m1.body.id);
    const after = await member.api.get(`/channels/${ch.id}/messages`);
    const rep = after.body.find((m: any) => m.id === reply.body.id);
    expect(rep.reference.deleted).toBe(true);
    gw.close();
  });

  it('pagina o histórico do mais novo para o mais antigo', async () => {
    const { owner, ch } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push((await owner.api.post(`/channels/${ch.id}/messages`, { content: `msg ${i}` })).body.id);
    const page1 = await owner.api.get(`/channels/${ch.id}/messages?limit=5`);
    expect(page1.body.map((m: any) => m.content)).toEqual(['msg 11', 'msg 10', 'msg 9', 'msg 8', 'msg 7']);
    const page2 = await owner.api.get(`/channels/${ch.id}/messages?limit=5&before=${page1.body[4].id}`);
    expect(page2.body[0].content).toBe('msg 6');
    const around = await owner.api.get(`/channels/${ch.id}/messages?limit=4&around=${ids[5]}`);
    expect(around.body.map((m: any) => m.content)).toContain('msg 5');
  });

  it('conta menções, marca como lido e busca no histórico', async () => {
    const { owner, member, ch, guild } = await setup();
    await owner.api.post(`/channels/${ch.id}/messages`, { content: `ei <@${member.user.id}> olha o churrasco` });
    const gw = await gateway(member.token);
    const rs = gw.ready.readStates.find((r: any) => r.channelId === ch.id);
    expect(rs.mentions).toBe(1);
    const inbox = await member.api.get('/users/@me/mentions');
    expect(inbox.body[0].content).toMatch(/churrasco/);
    const last = (await member.api.get(`/channels/${ch.id}/messages?limit=1`)).body[0];
    await member.api.post(`/channels/${ch.id}/ack`, { messageId: last.id });
    await gw.waitFor('MESSAGE_ACK', (d) => d.channelId === ch.id);
    const found = await member.api.get(`/search/messages?guildId=${guild.id}&q=CHURRAS`);
    expect(found.body.total).toBe(1);
    const byAuthor = await member.api.get(`/search/messages?guildId=${guild.id}&authorId=${member.user.id}`);
    expect(byAuthor.body.total).toBe(0);
    // @everyone só com permissão
    const ev = await member.api.post(`/channels/${ch.id}/messages`, { content: '@everyone acordem' });
    expect(ev.body.mentionEveryone).toBe(false);
    const ev2 = await owner.api.post(`/channels/${ch.id}/messages`, { content: '@everyone reunião' });
    expect(ev2.body.mentionEveryone).toBe(true);
    gw.close();
  });

  it('valida mensagens vazias, longas e modo lento', async () => {
    const { owner, member, ch } = await setup();
    expect((await member.api.post(`/channels/${ch.id}/messages`, { content: '   ' })).status).toBe(400);
    expect((await member.api.post(`/channels/${ch.id}/messages`, { content: 'x'.repeat(4001) })).status).toBe(400);
    await owner.api.patch(`/channels/${ch.id}`, { slowmode: 30 });
    expect((await member.api.post(`/channels/${ch.id}/messages`, { content: 'um' })).status).toBe(200);
    expect((await member.api.post(`/channels/${ch.id}/messages`, { content: 'dois' })).status).toBe(429);
    expect((await owner.api.post(`/channels/${ch.id}/messages`, { content: 'dono ignora' })).status).toBe(200);
  });

  it('anexos: detecta o tipo real, remove EXIF e protege a URL com assinatura', async () => {
    const { owner, member, ch } = await setup();
    const png = await sharp({ create: { width: 64, height: 40, channels: 3, background: '#7c5cff' } }).png().toBuffer();
    const up = await upload(owner.api, 'foto.png', png, 'image/png');
    expect(up.status).toBe(200);
    expect(up.body).toMatchObject({ kind: 'image', width: 64, height: 40, contentType: 'image/png' });
    const msg = await owner.api.post(`/channels/${ch.id}/messages`, { content: '', attachmentIds: [up.body.id] });
    expect(msg.body.attachments[0].id).toBe(up.body.id);
    // reuso do mesmo anexo é negado
    expect((await owner.api.post(`/channels/${ch.id}/messages`, { attachmentIds: [up.body.id] })).status).toBe(400);
    // anexo de outra pessoa é negado
    const up2 = await upload(owner.api, 'b.png', png, 'image/png');
    expect((await member.api.post(`/channels/${ch.id}/messages`, { attachmentIds: [up2.body.id] })).status).toBe(400);

    const url = new URL(msg.body.attachments[0].url);
    expect(url.origin).toBe(base);
    const ok = await fetch(url);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    const ranged = await fetch(url, { headers: { range: 'bytes=0-9' } });
    expect(ranged.status).toBe(206);
    expect((await ranged.arrayBuffer()).byteLength).toBe(10);
    url.searchParams.set('sig', 'x' + url.searchParams.get('sig')!.slice(1));
    expect((await fetch(url)).status).toBe(404);

    // HTML disfarçado de PNG vira download genérico
    const fake = await upload(owner.api, 'virus.png', Buffer.from('<html><script>alert(1)</script></html>'), 'image/png');
    expect(fake.body.kind).toBe('file');
    expect(fake.body.contentType).not.toMatch(/image|html/);
    const svg = await upload(owner.api, 'logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    expect(svg.body.kind).toBe('file');
    const svgRes = await fetch(svg.body.url);
    expect(svgRes.headers.get('content-type')).toBe('application/octet-stream');
    expect(svgRes.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  it('avatar animado gera versão estática e URL pública', async () => {
    const { owner } = await setup();
    const frames = await sharp({ create: { width: 32, height: 64, channels: 4, background: '#22d3ee' } })
      .gif()
      .toBuffer();
    const gif = await sharp(frames, { animated: true }).gif().toBuffer();
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(gif)], { type: 'image/gif' }), 'a.gif');
    const r = await owner.api.post('/users/@me/avatar', fd);
    expect(r.status).toBe(200);
    expect(r.body.avatar).toMatch(/\/files\/public\/avatars\/.+\.webp$/);
    const img = await fetch(r.body.avatar);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/webp');
    const notImage = new FormData();
    notImage.append('file', new Blob([new Uint8Array(Buffer.from('texto'))]), 'x.png');
    expect((await owner.api.post('/users/@me/avatar', notImage)).status).toBe(400);
  });

  it('emojis personalizados do servidor em reações', async () => {
    const { owner, member, guild, ch } = await setup();
    const png = await sharp({ create: { width: 128, height: 128, channels: 4, background: '#ff0' } }).png().toBuffer();
    const fd = new FormData();
    fd.append('name', 'risada');
    fd.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'risada.png');
    const e = await owner.api.post(`/guilds/${guild.id}/emojis`, fd);
    expect(e.status).toBe(200);
    expect(e.body.url).toContain(`/public/emojis/${e.body.id}.webp`);
    const m = await owner.api.post(`/channels/${ch.id}/messages`, { content: `kkk <:risada:${e.body.id}>` });
    expect((await member.api.put(`/channels/${ch.id}/messages/${m.body.id}/reactions/${encodeURIComponent(`risada:${e.body.id}`)}/@me`)).status).toBe(200);
    const h = await member.api.get(`/channels/${ch.id}/messages?limit=1`);
    expect(h.body[0].reactions[0].emoji).toMatchObject({ id: e.body.id, name: 'risada' });
    expect(h.body[0].reactions[0].emoji.url).toContain(e.body.id);
    expect((await member.api.post(`/guilds/${guild.id}/emojis`, fd)).status).toBe(403);
  });

  it('denúncias guardam um retrato da mensagem', async () => {
    const { owner, member, ch, guild } = await setup();
    const m = await member.api.post(`/channels/${ch.id}/messages`, { content: 'mensagem ofensiva' });
    const rep = await owner.api.post('/reports', { targetType: 'message', targetId: m.body.id, channelId: ch.id, reason: 'assedio', details: 'teste' });
    expect(rep.status).toBe(200);
    const list = await owner.api.get(`/guilds/${guild.id}/reports`);
    expect(list.body[0].snapshot.content).toBe('mensagem ofensiva');
    expect((await member.api.get(`/guilds/${guild.id}/reports`)).status).toBe(403);
  });
});
