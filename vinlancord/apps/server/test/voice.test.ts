import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { P } from '@vinlancord/shared';
import { gateway, makeFriends, registerUser, sleep, startServer, stopServer } from './helpers';

beforeAll(startServer);
afterAll(stopServer);

async function setup() {
  const owner = await registerUser('voz');
  const member = await registerUser('ouvinte');
  const g = await owner.api.post('/guilds', { name: 'Voz', template: 'amigos' });
  const text = g.body.channels.find((c: any) => c.type === 'text');
  const voice = g.body.channels.find((c: any) => c.type === 'voice');
  const inv = await owner.api.post(`/channels/${text.id}/invites`, {});
  await member.api.post(`/invites/${inv.body.code}`);
  return { owner, member, guild: g.body, voice };
}

describe('sinalização de voz (SFU)', () => {
  it('entra, cria transportes, vê estados e sai', async () => {
    const { owner, member, voice } = await setup();
    const gwO = await gateway(owner.token);
    const gwM = await gateway(member.token);
    const join = await gwO.rpc('voice.join', { channelId: voice.id, selfMute: false, selfDeaf: false, voiceSessionId: randomUUID() });
    expect(join.routerRtpCapabilities.codecs.map((c: any) => c.mimeType)).toEqual(expect.arrayContaining(['audio/opus', 'video/VP8', 'video/H264']));
    const st = await gwM.waitFor('VOICE_STATE_UPDATE', (d) => d.userId === owner.user.id && d.channelId === voice.id);
    expect(st.selfMute).toBe(false);
    const send = await gwO.rpc('voice.createTransport', { direction: 'send' });
    expect(send.iceCandidates.length).toBeGreaterThan(0);
    expect(send.iceCandidates[0].address).toBe('127.0.0.1');
    expect(send.dtlsParameters.fingerprints.length).toBeGreaterThan(0);
    const recv = await gwO.rpc('voice.createTransport', { direction: 'recv' });
    expect(recv.id).not.toBe(send.id);

    // novo READY enxerga quem está na voz
    const gwM2 = await gateway(member.token);
    expect(gwM2.ready.voiceStates.some((v: any) => v.userId === owner.user.id)).toBe(true);

    const join2 = await gwM.rpc('voice.join', { channelId: voice.id, selfMute: true, selfDeaf: false, voiceSessionId: randomUUID() });
    expect(join2.voiceStates).toHaveLength(2);

    await gwO.rpc('voice.updateState', { selfMute: true });
    await gwM.waitFor('VOICE_STATE_UPDATE', (d) => d.userId === owner.user.id && d.selfMute === true);

    await gwO.rpc('voice.leave', {});
    await gwM.waitFor('VOICE_STATE_UPDATE', (d) => d.userId === owner.user.id && d.channelId === null);
    await expect(gwO.rpc('voice.createTransport', { direction: 'send' })).rejects.toMatchObject({ code: 'NOT_IN_VOICE' });
    [gwO, gwM, gwM2].forEach((g) => g.close());
  });

  it('respeita CONNECT, silenciamento pelo servidor e moderação', async () => {
    const { owner, member, voice, guild } = await setup();
    const gwM = await gateway(member.token);
    const gwO = await gateway(owner.token);
    await owner.api.put(`/channels/${voice.id}/permissions/${guild.id}`, { type: 'role', allow: '0', deny: String(P.CONNECT) });
    await expect(gwM.rpc('voice.join', { channelId: voice.id, selfMute: false, selfDeaf: false, voiceSessionId: randomUUID() })).rejects.toThrow(/permissão/);
    await owner.api.del(`/channels/${voice.id}/permissions/${guild.id}`);
    await gwM.rpc('voice.join', { channelId: voice.id, selfMute: false, selfDeaf: false, voiceSessionId: randomUUID() });
    // silenciar pelo servidor
    await owner.api.patch(`/guilds/${guild.id}/members/${member.user.id}`, { mute: true });
    await gwO.waitFor('VOICE_STATE_UPDATE', (d) => d.userId === member.user.id && d.serverMute === true);
    // desconectar via moderação
    await gwO.rpc('voice.moderate', { userId: member.user.id, disconnect: true });
    await gwM.waitFor('VOICE_DISCONNECTED', (d) => d.reason === 'kicked');
    // membro comum não pode desconectar o dono
    await gwO.rpc('voice.join', { channelId: voice.id, selfMute: false, selfDeaf: false, voiceSessionId: randomUUID() });
    await expect(gwM.rpc('voice.moderate', { userId: owner.user.id, disconnect: true })).rejects.toBeTruthy();
    gwM.close();
    gwO.close();
  });

  it('mantém a sessão de voz durante queda do WebSocket e retoma', async () => {
    const { owner, member, voice } = await setup();
    const gwM = await gateway(member.token);
    let gwO = await gateway(owner.token);
    const vs = randomUUID();
    await gwO.rpc('voice.join', { channelId: voice.id, selfMute: false, selfDeaf: false, voiceSessionId: vs });
    gwO.ws.terminate();
    await sleep(300);
    gwO = await gateway(owner.token);
    expect(gwO.ready.voiceStates.some((v: any) => v.userId === owner.user.id)).toBe(true);
    expect(await gwO.rpc('voice.resume', { voiceSessionId: vs })).toEqual({ ok: true });
    expect(await gwO.rpc('voice.resume', { voiceSessionId: randomUUID() })).toEqual({ ok: false });
    // não houve saída
    expect(gwM.events.some((e) => e.t === 'VOICE_STATE_UPDATE' && e.d.userId === owner.user.id && e.d.channelId === null)).toBe(false);
    gwO.close();
    gwM.close();
  });

  it('chamada privada: toca, recusa e encerra com registro', async () => {
    const a = await registerUser('liga');
    const b = await registerUser('atende');
    await makeFriends(a, b);
    const dm = await a.api.post('/users/@me/channels', { recipients: [b.user.id] });
    const gwA = await gateway(a.token);
    const gwB = await gateway(b.token);
    await gwA.rpc('voice.join', { channelId: dm.body.id, selfMute: false, selfDeaf: false, voiceSessionId: randomUUID() });
    const call = await gwB.waitFor('CALL_CREATE', (d) => d.channelId === dm.body.id);
    expect(call.ringing).toEqual([b.user.id]);
    await gwB.waitFor('MESSAGE_CREATE', (d) => d.type === 'call');
    await gwB.rpc('call.decline', { channelId: dm.body.id });
    const upd = await gwA.waitFor('CALL_UPDATE', (d) => d.channelId === dm.body.id && d.ringing.length === 0);
    expect(upd.ringing).toEqual([]);
    await gwA.rpc('voice.leave', {});
    await gwB.waitFor('CALL_DELETE', (d) => d.channelId === dm.body.id);
    const ended = await gwB.waitFor('MESSAGE_UPDATE', (d) => d.type === 'call' && d.call?.endedAt);
    expect(ended.call.participants).toEqual([a.user.id]);
    gwA.close();
    gwB.close();
  });
});
