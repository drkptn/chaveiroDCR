/** Estado global do cliente (entidades sincronizadas pelo gateway). */
import { create } from 'zustand';
import { markFresh } from '../lib/fresh';
import {
  DEFAULT_SETTINGS,
  compareSnowflakes,
  emojiKey,
  type ActiveCall,
  type Channel,
  type GuildEmoji,
  type Guild,
  type GuildFull,
  type GuildSticker,
  type Member,
  type Message,
  type NotificationSetting,
  type Presence,
  type PublicUser,
  type ReadState,
  type ReadyPayload,
  type Relationship,
  type Role,
  type ScheduledEvent,
  type SelfUser,
  type UserSettings,
  type VoiceState,
} from '@vinlancord/shared';
import type { GatewayStatus } from '../lib/gateway';

export interface ClientMessage extends Message {
  pending?: boolean;
  failed?: boolean;
  /** dados para reenviar em caso de falha */
  retry?: { content: string; replyTo?: string; attachmentIds: string[]; stickerId?: string };
}

export interface ChannelMessages {
  items: ClientMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  loading: boolean;
  loaded: boolean;
  /** ID para rolar até (busca, resposta) */
  highlight?: string | null;
}

export interface State {
  conn: GatewayStatus;
  booted: boolean;
  sessionId: string | null;
  me: SelfUser | null;
  settings: UserSettings;
  users: Record<string, PublicUser>;
  guilds: Record<string, Guild>;
  guildOrder: string[];
  roles: Record<string, Record<string, Role>>;
  channels: Record<string, Channel>;
  privateChannelIds: string[];
  myMembers: Record<string, Member>;
  members: Record<string, Record<string, Member>>;
  membersLoaded: Record<string, boolean>;
  emojis: Record<string, GuildEmoji[]>;
  stickers: Record<string, GuildSticker[]>;
  relationships: Record<string, Relationship>;
  presences: Record<string, Presence>;
  voiceStates: Record<string, VoiceState>;
  readStates: Record<string, ReadState>;
  notif: Record<string, NotificationSetting>;
  calls: Record<string, ActiveCall>;
  messages: Record<string, ChannelMessages>;
  typing: Record<string, Record<string, number>>;
  events: Record<string, ScheduledEvent[]>;
  speaking: Record<string, number>;
  peerStats: Record<string, { rtt: number; loss: number }>;
}

const initial: State = {
  conn: 'idle',
  booted: false,
  sessionId: null,
  me: null,
  settings: DEFAULT_SETTINGS,
  users: {},
  guilds: {},
  guildOrder: [],
  roles: {},
  channels: {},
  privateChannelIds: [],
  myMembers: {},
  members: {},
  membersLoaded: {},
  emojis: {},
  stickers: {},
  relationships: {},
  presences: {},
  voiceStates: {},
  readStates: {},
  notif: {},
  calls: {},
  messages: {},
  typing: {},
  events: {},
  speaking: {},
  peerStats: {},
};

export const useStore = create<State>()(() => ({ ...initial }));
/** Referências estáveis para seletores (evita re-renderização infinita no Zustand 5). */
export const EMPTY_OBJ: Record<string, never> = Object.freeze({}) as Record<string, never>;
export const EMPTY_ARR: never[] = Object.freeze([]) as unknown as never[];
export const S = () => useStore.getState();
export const setS = useStore.setState;

export function resetStore() {
  useStore.setState({ ...initial }, true);
}

/* ─────────────────────────── helpers ─────────────────────────── */

const omit = <T,>(rec: Record<string, T>, key: string) => {
  if (!(key in rec)) return rec;
  const { [key]: _, ...rest } = rec;
  return rest;
};

function mergeGuild(s: State, g: GuildFull): Partial<State> {
  const { roles, channels, me, emojis, stickers, ...guild } = g;
  const chans = { ...s.channels };
  // remove canais antigos deste servidor (a lista é a fonte da verdade)
  for (const [id, c] of Object.entries(chans)) if (c.guildId === g.id) delete chans[id];
  for (const c of channels) chans[c.id] = c;
  return {
    guilds: { ...s.guilds, [g.id]: guild },
    guildOrder: s.guildOrder.includes(g.id) ? s.guildOrder : [...s.guildOrder, g.id],
    roles: { ...s.roles, [g.id]: Object.fromEntries(roles.map((r) => [r.id, r])) },
    channels: chans,
    myMembers: { ...s.myMembers, [g.id]: me },
    members: s.members[g.id] ? { ...s.members, [g.id]: { ...s.members[g.id], [me.userId]: me } } : s.members,
    emojis: { ...s.emojis, [g.id]: emojis },
    stickers: { ...s.stickers, [g.id]: stickers },
  };
}

function updateMessages(s: State, channelId: string, fn: (cm: ChannelMessages) => ChannelMessages): Partial<State> {
  const cm = s.messages[channelId];
  if (!cm) return {};
  return { messages: { ...s.messages, [channelId]: fn(cm) } };
}

function mapMessage(s: State, channelId: string, id: string, fn: (m: ClientMessage) => ClientMessage): Partial<State> {
  return updateMessages(s, channelId, (cm) => {
    const idx = cm.items.findIndex((m) => m.id === id);
    if (idx < 0) return cm;
    const items = cm.items.slice();
    items[idx] = fn(items[idx]!);
    return { ...cm, items };
  });
}

/* ─────────────────────────── READY + eventos ─────────────────────────── */

export function applyReady(d: ReadyPayload) {
  const s = S();
  let next: Partial<State> = {
    booted: true,
    sessionId: d.sessionId,
    me: d.user,
    settings: d.settings,
    users: { ...s.users, ...Object.fromEntries([...d.users, ...d.relationships.map((r) => r.user)].map((u) => [u.id, u])), [d.user.id]: d.user },
    guilds: {},
    guildOrder: [],
    roles: {},
    channels: {},
    myMembers: {},
    emojis: {},
    stickers: {},
    privateChannelIds: d.privateChannels.map((c) => c.id),
    relationships: Object.fromEntries(d.relationships.map((r) => [r.id, r])),
    presences: Object.fromEntries(d.presences.map((p) => [p.userId, p])),
    voiceStates: Object.fromEntries(d.voiceStates.map((v) => [v.userId, v])),
    readStates: Object.fromEntries(d.readStates.map((r) => [r.channelId, r])),
    notif: Object.fromEntries(d.notificationSettings.map((n) => [n.scopeId, n])),
    calls: Object.fromEntries(d.calls.map((c) => [c.channelId, c])),
    // mensagens em cache podem ter perdido eventos durante a queda: recarrega sob demanda
    messages: {},
    typing: {},
    membersLoaded: {},
  };
  const base = { ...s, ...next } as State;
  let acc = base;
  for (const g of d.guilds) acc = { ...acc, ...mergeGuild(acc, g) };
  for (const c of d.privateChannels) acc.channels[c.id] = c;
  // ordem de pastas/servidores do usuário
  const order = d.settings.guildFolders.filter((id) => acc.guilds[id]);
  for (const id of Object.keys(acc.guilds)) if (!order.includes(id)) order.push(id);
  next = { ...acc, guildOrder: order };
  useStore.setState(next);
}

type Handler = (d: any) => void;

export const reducers: Record<string, Handler> = {
  USER_UPDATE: (u: SelfUser) => setS((s) => ({ me: u, users: { ...s.users, [u.id]: u } })),
  USER_SETTINGS_UPDATE: (settings: UserSettings) => setS({ settings }),
  USER_PUBLIC_UPDATE: (u: PublicUser) => setS((s) => ({ users: { ...s.users, [u.id]: u } })),
  PRESENCE_UPDATE: (p: Presence) => setS((s) => ({ presences: { ...s.presences, [p.userId]: p } })),
  RELATIONSHIP_ADD: (r: Relationship) =>
    setS((s) => ({ relationships: { ...s.relationships, [r.id]: r }, users: { ...s.users, [r.user.id]: r.user } })),
  RELATIONSHIP_REMOVE: ({ id }: { id: string }) => setS((s) => ({ relationships: omit(s.relationships, id) })),
  GUILD_CREATE: (g: GuildFull) => setS((s) => mergeGuild(s, g)),
  GUILD_UPDATE: (g: Guild) => setS((s) => ({ guilds: { ...s.guilds, [g.id]: g } })),
  GUILD_DELETE: ({ id }: { id: string }) =>
    setS((s) => {
      const channels = { ...s.channels };
      for (const [cid, c] of Object.entries(channels)) if (c.guildId === id) delete channels[cid];
      return {
        guilds: omit(s.guilds, id),
        guildOrder: s.guildOrder.filter((g) => g !== id),
        channels,
        roles: omit(s.roles, id),
        myMembers: omit(s.myMembers, id),
        members: omit(s.members, id),
      };
    }),
  GUILD_MEMBER_ADD: ({ member, user }: { member: Member; user: PublicUser }) =>
    setS((s) => ({
      users: { ...s.users, [user.id]: user },
      guilds: s.guilds[member.guildId] ? { ...s.guilds, [member.guildId]: { ...s.guilds[member.guildId]!, memberCount: s.guilds[member.guildId]!.memberCount + 1 } } : s.guilds,
      members: s.members[member.guildId] ? { ...s.members, [member.guildId]: { ...s.members[member.guildId], [member.userId]: member } } : s.members,
    })),
  GUILD_MEMBER_UPDATE: ({ member }: { member: Member }) =>
    setS((s) => ({
      members: s.members[member.guildId] ? { ...s.members, [member.guildId]: { ...s.members[member.guildId], [member.userId]: member } } : s.members,
      myMembers: member.userId === s.me?.id ? { ...s.myMembers, [member.guildId]: member } : s.myMembers,
    })),
  GUILD_MEMBER_REMOVE: ({ guildId, userId }: { guildId: string; userId: string }) =>
    setS((s) => ({
      guilds: s.guilds[guildId] ? { ...s.guilds, [guildId]: { ...s.guilds[guildId]!, memberCount: Math.max(0, s.guilds[guildId]!.memberCount - 1) } } : s.guilds,
      members: s.members[guildId] ? { ...s.members, [guildId]: omit(s.members[guildId]!, userId) } : s.members,
    })),
  GUILD_ROLE_CREATE: (r: Role) => setS((s) => ({ roles: { ...s.roles, [r.guildId]: { ...s.roles[r.guildId], [r.id]: r } } })),
  GUILD_ROLE_UPDATE: (r: Role) => setS((s) => ({ roles: { ...s.roles, [r.guildId]: { ...s.roles[r.guildId], [r.id]: r } } })),
  GUILD_ROLE_DELETE: ({ guildId, roleId }: { guildId: string; roleId: string }) =>
    setS((s) => ({ roles: { ...s.roles, [guildId]: omit(s.roles[guildId] ?? {}, roleId) } })),
  GUILD_EMOJIS_UPDATE: ({ guildId, emojis }: { guildId: string; emojis: GuildEmoji[] }) => setS((s) => ({ emojis: { ...s.emojis, [guildId]: emojis } })),
  GUILD_STICKERS_UPDATE: ({ guildId, stickers }: { guildId: string; stickers: GuildSticker[] }) =>
    setS((s) => ({ stickers: { ...s.stickers, [guildId]: stickers } })),
  CHANNEL_CREATE: (c: Channel) =>
    setS((s) => ({
      channels: { ...s.channels, [c.id]: c },
      privateChannelIds: c.guildId || s.privateChannelIds.includes(c.id) ? s.privateChannelIds : [c.id, ...s.privateChannelIds],
    })),
  CHANNEL_UPDATE: (c: Channel) => setS((s) => ({ channels: { ...s.channels, [c.id]: { ...c, lastMessageId: maxId(c.lastMessageId, s.channels[c.id]?.lastMessageId) } } })),
  CHANNEL_DELETE: ({ id }: { id: string }) =>
    setS((s) => ({ channels: omit(s.channels, id), privateChannelIds: s.privateChannelIds.filter((x) => x !== id), messages: omit(s.messages, id) })),
  MESSAGE_CREATE: (m: Message) =>
    setS((s) => {
      const ch = s.channels[m.channelId];
      const out: Partial<State> = {
        users: s.users[m.author.id] === m.author ? s.users : { ...s.users, [m.author.id]: m.author },
        channels: ch ? { ...s.channels, [m.channelId]: { ...ch, lastMessageId: maxId(m.id, ch.lastMessageId) } } : s.channels,
        typing: s.typing[m.channelId]?.[m.author.id] ? { ...s.typing, [m.channelId]: omit(s.typing[m.channelId]!, m.author.id) } : s.typing,
      };
      if (ch && !ch.guildId) out.privateChannelIds = [m.channelId, ...s.privateChannelIds.filter((x) => x !== m.channelId)];
      if (m.author.id === s.me?.id) out.readStates = { ...s.readStates, [m.channelId]: { channelId: m.channelId, lastReadId: m.id, mentions: 0 } };
      const cm = s.messages[m.channelId];
      if (cm && !cm.hasMoreAfter) {
        const replacesPending = !!m.nonce && cm.items.some((x) => x.pending && x.nonce === m.nonce);
        if (!replacesPending && !cm.items.some((x) => x.id === m.id)) markFresh(m.id);
        const items = cm.items.filter((x) => x.id !== m.id && !(m.nonce && x.pending && x.nonce === m.nonce));
        items.push(m);
        // mantém a memória sob controle
        const trimmed = items.length > 400 ? items.slice(-300) : items;
        out.messages = { ...s.messages, [m.channelId]: { ...cm, items: trimmed, hasMoreBefore: cm.hasMoreBefore || trimmed.length < items.length } };
      }
      return out;
    }),
  MESSAGE_UPDATE: (m: Message) =>
    setS((s) => mapMessage(s, m.channelId, m.id, (old) => ({ ...m, reactions: old.reactions }))),
  MESSAGE_DELETE: ({ id, channelId }: { id: string; channelId: string }) =>
    setS((s) =>
      updateMessages(s, channelId, (cm) => ({
        ...cm,
        items: cm.items
          .filter((m) => m.id !== id)
          .map((m) => (m.reference?.id === id ? { ...m, reference: { ...m.reference, deleted: true, content: '' } } : m)),
      })),
    ),
  MESSAGE_DELETE_BULK: ({ ids, channelId }: { ids: string[]; channelId: string }) =>
    setS((s) => updateMessages(s, channelId, (cm) => ({ ...cm, items: cm.items.filter((m) => !ids.includes(m.id)) }))),
  MESSAGE_REACTION_ADD: (d: { channelId: string; messageId: string; userId: string; emoji: Message['reactions'][number]['emoji'] }) =>
    setS((s) =>
      mapMessage(s, d.channelId, d.messageId, (m) => {
        const key = emojiKey(d.emoji);
        const mine = d.userId === s.me?.id;
        const reactions = m.reactions.slice();
        const i = reactions.findIndex((r) => emojiKey(r.emoji) === key);
        if (i >= 0) {
          const r = reactions[i]!;
          if (mine && r.me) return m;
          reactions[i] = { ...r, count: r.count + 1, me: r.me || mine };
        } else reactions.push({ emoji: d.emoji, count: 1, me: mine });
        return { ...m, reactions };
      }),
    ),
  MESSAGE_REACTION_REMOVE: (d: { channelId: string; messageId: string; userId: string; emoji: Message['reactions'][number]['emoji'] }) =>
    setS((s) =>
      mapMessage(s, d.channelId, d.messageId, (m) => {
        const key = emojiKey(d.emoji);
        const mine = d.userId === s.me?.id;
        const reactions = m.reactions
          .map((r) => (emojiKey(r.emoji) === key ? { ...r, count: r.count - 1, me: mine ? false : r.me } : r))
          .filter((r) => r.count > 0);
        return { ...m, reactions };
      }),
    ),
  MESSAGE_ACK: ({ channelId, messageId }: { channelId: string; messageId: string }) =>
    setS((s) => ({ readStates: { ...s.readStates, [channelId]: { channelId, lastReadId: messageId, mentions: 0 } } })),
  TYPING_START: ({ channelId, userId, at }: { channelId: string; userId: string; at: number }) =>
    setS((s) => {
      if (userId === s.me?.id) return {};
      return { typing: { ...s.typing, [channelId]: { ...s.typing[channelId], [userId]: Math.max(at, Date.now()) + 10_000 } } };
    }),
  NOTIFICATION_SETTINGS_UPDATE: (n: NotificationSetting) => setS((s) => ({ notif: { ...s.notif, [n.scopeId]: n } })),
  EVENT_CREATE: (e: ScheduledEvent) => setS((s) => (s.events[e.guildId] ? { events: { ...s.events, [e.guildId]: [...s.events[e.guildId]!.filter((x) => x.id !== e.id), e] } } : {})),
  EVENT_UPDATE: (e: ScheduledEvent) =>
    setS((s) =>
      s.events[e.guildId]
        ? {
            events: {
              ...s.events,
              [e.guildId]: s.events[e.guildId]!.map((x) => (x.id === e.id ? { ...e, me: x.me } : x)).filter((x) => x.status !== 'completed' && x.status !== 'canceled'),
            },
          }
        : {},
    ),
  EVENT_DELETE: ({ id, guildId }: { id: string; guildId: string }) =>
    setS((s) => (s.events[guildId] ? { events: { ...s.events, [guildId]: s.events[guildId]!.filter((x) => x.id !== id) } } : {})),
  VOICE_STATE_UPDATE: (v: VoiceState | { userId: string; channelId: null }) =>
    setS((s) => (v.channelId ? { voiceStates: { ...s.voiceStates, [v.userId]: v as VoiceState } } : { voiceStates: omit(s.voiceStates, v.userId), speaking: omit(s.speaking, v.userId) })),
  VOICE_SPEAKING: ({ speaking }: { speaking: Record<string, number> }) => setS({ speaking }),
  VOICE_PEER_STATS: ({ userId, rtt, loss }: { userId: string; rtt: number; loss: number }) =>
    setS((s) => ({ peerStats: { ...s.peerStats, [userId]: { rtt, loss } } })),
  CALL_CREATE: (c: ActiveCall) => setS((s) => ({ calls: { ...s.calls, [c.channelId]: c } })),
  CALL_UPDATE: (c: ActiveCall) => setS((s) => ({ calls: { ...s.calls, [c.channelId]: c } })),
  CALL_DELETE: ({ channelId }: { channelId: string }) => setS((s) => ({ calls: omit(s.calls, channelId) })),
};

export function maxId(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? null;
  if (!b) return a;
  return compareSnowflakes(a, b) >= 0 ? a : b;
}

/* ─────────────────────────── seletores ─────────────────────────── */

export function displayName(userId: string, guildId?: string | null) {
  const s = S();
  const nick = guildId ? (s.members[guildId]?.[userId]?.nick ?? (s.myMembers[guildId]?.userId === userId ? s.myMembers[guildId]?.nick : null)) : null;
  const u = s.users[userId];
  return nick || u?.displayName || u?.username || 'Usuário';
}

export function isUnread(s: State, channelId: string) {
  const ch = s.channels[channelId];
  if (!ch?.lastMessageId) return false;
  const rs = s.readStates[channelId];
  if (!rs?.lastReadId) return true;
  return compareSnowflakes(ch.lastMessageId, rs.lastReadId) > 0;
}

export function mentionCount(s: State, channelId: string) {
  return s.readStates[channelId]?.mentions ?? 0;
}

export function isMuted(s: State, scopeId: string) {
  const n = s.notif[scopeId];
  if (!n?.muted) return false;
  return !n.mutedUntil || new Date(n.mutedUntil).getTime() > Date.now();
}

export function memberColor(s: State, guildId: string | null | undefined, userId: string): string | null {
  if (!guildId) return null;
  const m = s.members[guildId]?.[userId] ?? (s.myMembers[guildId]?.userId === userId ? s.myMembers[guildId] : undefined);
  if (!m) return null;
  const roles = s.roles[guildId] ?? {};
  let best: Role | null = null;
  for (const rid of m.roles) {
    const r = roles[rid];
    if (r?.color && (!best || r.position > best.position)) best = r;
  }
  return best?.color ?? null;
}

export function sortedGuildChannels(s: State, guildId: string) {
  const list = Object.values(s.channels).filter((c) => c.guildId === guildId);
  const cats = list.filter((c) => c.type === 'category').sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const byParent = (pid: string | null) =>
    list
      .filter((c) => c.type !== 'category' && c.parentId === pid)
      .sort((a, b) => {
        const va = a.type === 'text' ? 0 : 1;
        const vb = b.type === 'text' ? 0 : 1;
        return va - vb || a.position - b.position || a.id.localeCompare(b.id);
      });
  return { uncategorized: byParent(null), categories: cats.map((cat) => ({ cat, channels: byParent(cat.id) })) };
}
