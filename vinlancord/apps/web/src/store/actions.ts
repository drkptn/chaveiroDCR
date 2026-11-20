import { markFresh } from '../lib/fresh';
/** Ações do cliente: autenticação, conexão, mensagens e afins. */
import {
  LIMITS,
  compareSnowflakes,
  type ActiveCall,
  type Channel,
  type EmojiRef,
  type GatewayEventName,
  type GuildFull,
  type Member,
  type Message,
  type PublicUser,
  type ReadyPayload,
  type Relationship,
  type ScheduledEvent,
  type SelfUser,
  type UserSettings,
  type UserStatus,
  type VoiceState,
} from '@vinlancord/shared';
import { api, tokenStore } from '../lib/api';
import { gateway } from '../lib/gateway';
import { voice, useVoice } from '../lib/voice/engine';
import { handleNotifications } from '../lib/notify';
import { playSound } from '../lib/sounds';
import { S, setS, applyReady, reducers, resetStore, type ClientMessage } from './index';
import { ui, useUI } from './ui';
import { nav } from '../lib/nav';

/* ─────────────────────────── sessão ─────────────────────────── */

export function startSession(token: string) {
  api.setToken(token);
  gateway.setHandlers(onDispatch, (status, info) => {
    setS({ conn: status });
    if (status === 'offline' && (info?.code === 4004 || info?.code === 4010)) void logout(true);
  });
  gateway.connect(api.gatewayUrl(), token);
}

api.onUnauthorized(() => void logout(true));

export async function login(loginStr: string, password: string) {
  const r = await api.post<{ token: string; user: SelfUser }>('/auth/login', { login: loginStr, password, device: deviceInfo() });
  await tokenStore.save(r.token);
  startSession(r.token);
}

export async function register(body: { email: string; username: string; displayName?: string; password: string; registrationCode?: string }) {
  const r = await api.post<{ token: string | null; user: SelfUser; verificationRequired: boolean }>('/auth/register', { ...body, device: deviceInfo() });
  if (r.token) {
    await tokenStore.save(r.token);
    startSession(r.token);
  }
  return r;
}

function deviceInfo() {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'dispositivo';
  const isDesktop = !!window.vinlancord;
  return { name: isDesktop ? `Além-Mar para ${os}` : `Navegador no ${os}`, platform: isDesktop ? 'desktop' : 'web' };
}

export async function logout(expired = false) {
  if (!expired) await api.post('/auth/logout').catch(() => {});
  await voice.leave(true).catch(() => {});
  gateway.disconnect();
  await tokenStore.clear();
  api.setToken(null);
  resetStore();
  useUI.setState({ modals: [], menu: null, popout: null });
  nav('/login');
  if (expired) ui.toast({ kind: 'info', title: 'Sessão encerrada', body: 'Entre novamente para continuar.' });
}

/* ─────────────────────────── gateway ─────────────────────────── */

let firstReady = true;

function onDispatch(t: GatewayEventName, d: unknown) {
  if (t === 'READY') {
    applyReady(d as ReadyPayload);
    if (!firstReady) void voice.onGatewayReady();
    firstReady = false;
    // recarrega o canal aberto (pode ter perdido mensagens durante a queda)
    const ch = useUI.getState().currentChannelId;
    if (ch) void loadMessages(ch);
    return;
  }
  if (t === 'SESSION_REVOKED') {
    void logout(true);
    return;
  }
  // efeitos que precisam do estado anterior
  if (t === 'VOICE_STATE_UPDATE') voiceSounds(d as VoiceState | { userId: string; channelId: null });
  if (t === 'CALL_CREATE' || t === 'CALL_UPDATE') callNotice(d as ActiveCall);
  if (t === 'RELATIONSHIP_ADD') friendNotice(d as Relationship);

  reducers[t]?.(d);

  if (t === 'MESSAGE_CREATE') {
    handleNotifications(d as Message);
    if (useUI.getState().currentChannelId === (d as Message).channelId) scheduleAck((d as Message).channelId);
  }
  if (t.startsWith('VOICE_')) voice.handleEvent(t as 'VOICE_PRODUCER_NEW', d as never);
  if (t === 'GUILD_DELETE' && useUI.getState().currentGuildId === (d as { id: string }).id) nav('/channels/@me');
  if (t === 'CHANNEL_DELETE' && useUI.getState().currentChannelId === (d as { id: string }).id) {
    const gid = useUI.getState().currentGuildId;
    nav(gid ? `/channels/${gid}` : '/channels/@me');
  }
}

function voiceSounds(v: VoiceState | { userId: string; channelId: null }) {
  const s = S();
  const mine = useVoice.getState().channelId;
  if (!mine || v.userId === s.me?.id) return;
  const prev = s.voiceStates[v.userId]?.channelId ?? null;
  if (!S().settings.notifications.voiceJoinSound) return;
  if (v.channelId === mine && prev !== mine) playSound('join');
  else if (prev === mine && v.channelId !== mine) playSound('leave');
}

function callNotice(c: ActiveCall) {
  const me = S().me?.id;
  if (!me) return;
  const wasRinging = S().calls[c.channelId]?.ringing.includes(me);
  if (c.ringing.includes(me) && !wasRinging && !useUI.getState().focused) {
    window.vinlancord?.notify.flash();
    if (S().settings.notifications.desktop && Notification.permission === 'granted' && S().me?.status !== 'dnd') {
      const caller = S().users[c.startedBy];
      const n = new Notification('Chamada recebida', { body: `${caller?.displayName ?? 'Alguém'} está te ligando no Além-Mar`, silent: true, tag: 'call-' + c.channelId });
      n.onclick = () => {
        window.vinlancord?.window.focus();
        window.focus();
        nav(`/channels/@me/${c.channelId}`);
      };
    }
  }
}

function friendNotice(r: Relationship) {
  const prev = S().relationships[r.id];
  if (r.type === 'incoming' && prev?.type !== 'incoming' && S().settings.notifications.friendRequests) {
    playSound('notify');
    ui.toast({ kind: 'info', title: 'Pedido de amizade', body: `${r.user.displayName} quer ser seu amigo!`, avatar: { userId: r.user.id }, onClick: () => nav('/channels/@me?tab=pending') });
  }
  if (r.type === 'friend' && prev?.type === 'outgoing') {
    ui.toast({ kind: 'success', title: 'Nova amizade!', body: `${r.user.displayName} aceitou seu pedido.`, avatar: { userId: r.user.id } });
  }
}

/* ─────────────────────────── mensagens ─────────────────────────── */

export async function loadMessages(channelId: string, opts: { before?: string } = {}) {
  const cur = S().messages[channelId];
  if (cur?.loading) return;
  setS((s) => ({
    messages: {
      ...s.messages,
      [channelId]: { items: opts.before ? cur?.items ?? [] : cur?.items ?? [], hasMoreBefore: cur?.hasMoreBefore ?? true, hasMoreAfter: false, loaded: cur?.loaded ?? false, loading: true },
    },
  }));
  try {
    const q = new URLSearchParams({ limit: String(LIMITS.MESSAGES_PAGE) });
    if (opts.before) q.set('before', opts.before);
    const list = await api.get<Message[]>(`/channels/${channelId}/messages?${q}`);
    const asc = list.slice().reverse();
    setS((s) => {
      const prev = s.messages[channelId];
      const pending = prev?.items.filter((m) => m.pending || m.failed) ?? [];
      // mensagens que chegaram pelo gateway enquanto o histórico carregava não podem se perder
      const lastFetched = asc[asc.length - 1]?.id;
      const fetchedIds = new Set(asc.map((m) => m.id));
      const arrived = (prev?.items ?? []).filter(
        (m) => !m.pending && !m.failed && !fetchedIds.has(m.id) && (!lastFetched || compareSnowflakes(m.id, lastFetched) > 0),
      );
      const items = opts.before ? [...asc, ...(prev?.items ?? [])] : [...asc, ...arrived, ...pending];
      return {
        messages: {
          ...s.messages,
          [channelId]: { items, hasMoreBefore: list.length >= LIMITS.MESSAGES_PAGE, hasMoreAfter: false, loading: false, loaded: true, highlight: prev?.highlight ?? null },
        },
        users: { ...s.users, ...Object.fromEntries(list.map((m) => [m.author.id, m.author])) },
      };
    });
  } catch (e) {
    setS((s) => ({ messages: { ...s.messages, [channelId]: { ...(s.messages[channelId] ?? { items: [], hasMoreBefore: true, hasMoreAfter: false, loaded: false }), loading: false } } }));
    ui.error(e, 'Não foi possível carregar as mensagens');
  }
}

/** Abre o histórico ao redor de uma mensagem (resultado de busca, resposta). */
export async function jumpToMessage(channelId: string, messageId: string) {
  const cm = S().messages[channelId];
  if (cm?.items.some((m) => m.id === messageId)) {
    setS((s) => ({ messages: { ...s.messages, [channelId]: { ...s.messages[channelId]!, highlight: messageId } } }));
    return;
  }
  const list = await api.get<Message[]>(`/channels/${channelId}/messages?around=${messageId}&limit=50`);
  const asc = list.slice().reverse();
  const latest = S().channels[channelId]?.lastMessageId;
  setS((s) => ({
    messages: {
      ...s.messages,
      [channelId]: {
        items: asc,
        hasMoreBefore: true,
        hasMoreAfter: !!latest && asc[asc.length - 1]?.id !== latest,
        loading: false,
        loaded: true,
        highlight: messageId,
      },
    },
  }));
}

export function clearHighlight(channelId: string) {
  setS((s) => (s.messages[channelId] ? { messages: { ...s.messages, [channelId]: { ...s.messages[channelId]!, highlight: null } } } : {}));
}

export interface OutgoingFile {
  file: File;
  spoiler: boolean;
}

export async function sendMessage(channelId: string, content: string, opts: { replyTo?: string; files?: OutgoingFile[]; stickerId?: string } = {}) {
  resetTyping();
  const s = S();
  const me = s.me!;
  const nonce = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const tempId = `pending-${nonce}`;
  const ref = opts.replyTo ? s.messages[channelId]?.items.find((m) => m.id === opts.replyTo) : null;
  const optimistic: ClientMessage = {
    id: tempId,
    channelId,
    guildId: s.channels[channelId]?.guildId ?? null,
    author: me,
    content,
    type: opts.replyTo ? 'reply' : 'default',
    createdAt: new Date().toISOString(),
    editedAt: null,
    pinned: false,
    mentions: [],
    mentionRoles: [],
    mentionEveryone: false,
    attachments: (opts.files ?? []).map((f, i) => ({
      id: `local-${i}`,
      filename: f.file.name,
      contentType: f.file.type,
      size: f.file.size,
      url: '',
      kind: f.file.type.startsWith('image/') ? 'image' : f.file.type.startsWith('video/') ? 'video' : 'file',
      width: null,
      height: null,
      spoiler: f.spoiler,
    })),
    reactions: [],
    reference: ref ? { id: ref.id, authorId: ref.author.id, content: ref.content.slice(0, 200), deleted: false, hasAttachments: ref.attachments.length > 0 } : null,
    sticker: null,
    call: null,
    nonce,
    pending: true,
  };
  markFresh(optimistic.id);
  setS((st) =>
    st.messages[channelId]
      ? { messages: { ...st.messages, [channelId]: { ...st.messages[channelId]!, items: [...st.messages[channelId]!.items, optimistic] } } }
      : {},
  );

  try {
    const attachmentIds: string[] = [];
    for (const f of opts.files ?? []) {
      const a = await api.upload<{ id: string }>('/attachments', f.file, f.spoiler ? `SPOILER_${f.file.name}` : f.file.name, { spoiler: String(f.spoiler) });
      attachmentIds.push(a.id);
    }
    const msg = await api.post<Message>(`/channels/${channelId}/messages`, { content, nonce, replyTo: opts.replyTo, attachmentIds, stickerId: opts.stickerId });
    // o evento do gateway normalmente já substituiu a mensagem; garante caso tenha chegado antes
    setS((st) => {
      const cm = st.messages[channelId];
      if (!cm) return {};
      const hasReal = cm.items.some((m) => m.id === msg.id);
      const items = cm.items.filter((m) => m.id !== tempId);
      if (!hasReal && !cm.hasMoreAfter) items.push(msg);
      return { messages: { ...st.messages, [channelId]: { ...cm, items } } };
    });
  } catch (e) {
    setS((st) => {
      const cm = st.messages[channelId];
      if (!cm) return {};
      return {
        messages: {
          ...st.messages,
          [channelId]: {
            ...cm,
            items: cm.items.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true, retry: { content, replyTo: opts.replyTo, attachmentIds: [], stickerId: opts.stickerId } } : m)),
          },
        },
      };
    });
    ui.error(e, 'Mensagem não enviada');
  }
}

export function discardFailed(channelId: string, id: string) {
  setS((s) => (s.messages[channelId] ? { messages: { ...s.messages, [channelId]: { ...s.messages[channelId]!, items: s.messages[channelId]!.items.filter((m) => m.id !== id) } } } : {}));
}

export async function retryMessage(channelId: string, m: ClientMessage) {
  discardFailed(channelId, m.id);
  await sendMessage(channelId, m.retry?.content ?? m.content, { replyTo: m.retry?.replyTo, stickerId: m.retry?.stickerId });
}

export async function editMessage(channelId: string, id: string, content: string) {
  await api.patch(`/channels/${channelId}/messages/${id}`, { content });
}

export async function deleteMessage(channelId: string, id: string) {
  await api.del(`/channels/${channelId}/messages/${id}`);
}

export function emojiParam(e: EmojiRef) {
  return encodeURIComponent(e.id ? `${e.name}:${e.id}` : e.name);
}

export async function toggleReaction(channelId: string, messageId: string, emoji: EmojiRef) {
  const msg = S().messages[channelId]?.items.find((m) => m.id === messageId);
  const existing = msg?.reactions.find((r) => (r.emoji.id ?? r.emoji.name) === (emoji.id ?? emoji.name));
  try {
    if (existing?.me) await api.del(`/channels/${channelId}/messages/${messageId}/reactions/${emojiParam(emoji)}/@me`);
    else await api.put(`/channels/${channelId}/messages/${messageId}/reactions/${emojiParam(emoji)}/@me`);
  } catch (e) {
    ui.error(e);
  }
}

const ackTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function scheduleAck(channelId: string) {
  if (!useUI.getState().focused) return;
  const t = ackTimers.get(channelId);
  if (t) clearTimeout(t);
  ackTimers.set(
    channelId,
    setTimeout(() => {
      ackTimers.delete(channelId);
      void ackChannel(channelId);
    }, 600),
  );
}

export async function ackChannel(channelId: string) {
  const s = S();
  const last = s.channels[channelId]?.lastMessageId;
  if (!last) return;
  const rs = s.readStates[channelId];
  if (rs?.lastReadId === last && !rs.mentions) return;
  setS((st) => ({ readStates: { ...st.readStates, [channelId]: { channelId, lastReadId: last, mentions: 0 } } }));
  await api.post(`/channels/${channelId}/ack`, { messageId: last }).catch(() => {});
}

let lastTyping = 0;
let lastTypingChannel = '';
/** Após enviar, a próxima digitação deve avisar de novo imediatamente. */
export function resetTyping() {
  lastTyping = 0;
}
export function sendTyping(channelId: string) {
  const now = Date.now();
  if (channelId === lastTypingChannel && now - lastTyping < 6000) return;
  lastTyping = now;
  lastTypingChannel = channelId;
  void gateway.rpc('typing.start', { channelId }).catch(() => {});
}

/* ─────────────────────────── membros, DMs, amigos ─────────────────────────── */

export async function loadMembers(guildId: string, force = false) {
  if (S().membersLoaded[guildId] && !force) return;
  setS((s) => ({ membersLoaded: { ...s.membersLoaded, [guildId]: true } }));
  try {
    const list = await api.get<{ member: Member; user: PublicUser }[]>(`/guilds/${guildId}/members`);
    setS((s) => ({
      members: { ...s.members, [guildId]: Object.fromEntries(list.map((x) => [x.member.userId, x.member])) },
      users: { ...s.users, ...Object.fromEntries(list.map((x) => [x.user.id, x.user])) },
    }));
  } catch {
    setS((s) => ({ membersLoaded: { ...s.membersLoaded, [guildId]: false } }));
  }
}

export async function openDM(userId: string) {
  const ch = await api.post<Channel>('/users/@me/channels', { recipients: [userId] });
  setS((s) => ({ channels: { ...s.channels, [ch.id]: ch }, privateChannelIds: [ch.id, ...s.privateChannelIds.filter((x) => x !== ch.id)] }));
  nav(`/channels/@me/${ch.id}`);
  return ch;
}

export async function startCall(userId: string) {
  const ch = await openDM(userId);
  await voice.join(ch.id);
}

export async function addFriend(input: string) {
  const v = input.trim().replace(/^@/, '');
  const body = /^\d{15,20}$/.test(v) ? { userId: v } : { username: v.toLowerCase() };
  await api.post('/relationships', body);
}

export async function setStatus(status: Exclude<UserStatus, 'offline'>) {
  const prev = S().me;
  if (prev) setS({ me: { ...prev, status } });
  try {
    await api.put('/users/@me/status', { status });
  } catch (e) {
    if (prev) setS({ me: prev });
    ui.error(e);
  }
}

export async function updateSettings(patch: Partial<UserSettings>) {
  const prev = S().settings;
  setS({ settings: { ...prev, ...patch, privacy: { ...prev.privacy, ...(patch.privacy ?? {}) }, notifications: { ...prev.notifications, ...(patch.notifications ?? {}) } } });
  try {
    const next = await api.patch<UserSettings>('/users/@me/settings', patch);
    setS({ settings: next });
  } catch (e) {
    setS({ settings: prev });
    ui.error(e, 'Não foi possível salvar');
  }
}

export async function loadEvents(guildId: string) {
  const list = await api.get<ScheduledEvent[]>(`/guilds/${guildId}/events`);
  setS((s) => ({ events: { ...s.events, [guildId]: list } }));
}

export async function joinInvite(code: string) {
  const r = await api.post<{ guild: GuildFull; channelId: string | null; alreadyMember: boolean }>(`/invites/${encodeURIComponent(code)}`);
  reducers.GUILD_CREATE!(r.guild);
  const target = r.channelId && S().channels[r.channelId] ? r.channelId : r.guild.channels.find((c) => c.type === 'text')?.id;
  nav(`/channels/${r.guild.id}${target ? '/' + target : ''}`);
  if (!r.alreadyMember) ui.success(`Bem-vindo(a) ao ${r.guild.name}!`);
}

export function joinVoice(channelId: string) {
  voice.join(channelId).catch((e) => ui.error(e, 'Não foi possível entrar na chamada'));
}
