/** Protocolo do gateway WebSocket (eventos em tempo real + RPC + sinalização WebRTC). */
import type {
  Activity,
  ActiveCall,
  Channel,
  CustomStatus,
  Guild,
  GuildEmoji,
  GuildFull,
  GuildSticker,
  IceServerConfig,
  Member,
  Message,
  NotificationSetting,
  Presence,
  PublicUser,
  ReadyPayload,
  Relationship,
  Role,
  ScheduledEvent,
  SelfUser,
  UserSettings,
  UserStatus,
  VoiceState,
  EmojiRef,
} from './types';

export const GatewayOp = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
  REQUEST: 20,
  RESPONSE: 21,
} as const;

export const GatewayCloseCode = {
  UNKNOWN: 4000,
  NOT_AUTHENTICATED: 4003,
  AUTH_FAILED: 4004,
  ALREADY_AUTHENTICATED: 4005,
  RATE_LIMITED: 4008,
  SESSION_TIMEOUT: 4009,
  SESSION_REVOKED: 4010,
  SERVER_RESTART: 4011,
} as const;

export type SourceType = 'mic' | 'camera' | 'screen' | 'screen-audio';

export interface ProducerInfo {
  producerId: string;
  userId: string;
  kind: 'audio' | 'video';
  source: SourceType;
  paused: boolean;
}

export interface GatewayEvents {
  READY: ReadyPayload;
  USER_UPDATE: SelfUser;
  USER_SETTINGS_UPDATE: UserSettings;
  USER_PUBLIC_UPDATE: PublicUser;
  PRESENCE_UPDATE: Presence;
  RELATIONSHIP_ADD: Relationship;
  RELATIONSHIP_REMOVE: { id: string };
  GUILD_CREATE: GuildFull;
  GUILD_UPDATE: Guild;
  GUILD_DELETE: { id: string };
  GUILD_MEMBER_ADD: { member: Member; user: PublicUser };
  GUILD_MEMBER_UPDATE: { member: Member };
  GUILD_MEMBER_REMOVE: { guildId: string; userId: string };
  GUILD_ROLE_CREATE: Role;
  GUILD_ROLE_UPDATE: Role;
  GUILD_ROLE_DELETE: { guildId: string; roleId: string };
  GUILD_EMOJIS_UPDATE: { guildId: string; emojis: GuildEmoji[] };
  GUILD_STICKERS_UPDATE: { guildId: string; stickers: GuildSticker[] };
  GUILD_BAN_ADD: { guildId: string; userId: string };
  GUILD_BAN_REMOVE: { guildId: string; userId: string };
  CHANNEL_CREATE: Channel;
  CHANNEL_UPDATE: Channel;
  CHANNEL_DELETE: { id: string; guildId: string | null };
  CHANNEL_PINS_UPDATE: { channelId: string };
  MESSAGE_CREATE: Message;
  MESSAGE_UPDATE: Message;
  MESSAGE_DELETE: { id: string; channelId: string };
  MESSAGE_DELETE_BULK: { ids: string[]; channelId: string };
  MESSAGE_REACTION_ADD: { channelId: string; messageId: string; userId: string; emoji: EmojiRef };
  MESSAGE_REACTION_REMOVE: { channelId: string; messageId: string; userId: string; emoji: EmojiRef };
  MESSAGE_ACK: { channelId: string; messageId: string };
  TYPING_START: { channelId: string; userId: string; at: number };
  NOTIFICATION_SETTINGS_UPDATE: NotificationSetting;
  EVENT_CREATE: ScheduledEvent;
  EVENT_UPDATE: ScheduledEvent;
  EVENT_DELETE: { id: string; guildId: string };
  SESSION_REVOKED: { sessionId: string };
  /** Anúncio do criador do servidor para todos os conectados */
  ANNOUNCEMENT: { text: string; from: PublicUser; at: string };
  VOICE_STATE_UPDATE: VoiceState | { userId: string; channelId: null; guildId: string | null };
  VOICE_PRODUCER_NEW: ProducerInfo & { channelId: string };
  VOICE_PRODUCER_CLOSED: { channelId: string; producerId: string; userId: string; source: SourceType };
  VOICE_PRODUCER_PAUSED: { channelId: string; producerId: string; userId: string; paused: boolean };
  VOICE_CONSUMER_CLOSED: { consumerId: string };
  VOICE_SPEAKING: { channelId: string; speaking: Record<string, number> };
  VOICE_PEER_STATS: { channelId: string; userId: string; rtt: number; loss: number };
  VOICE_DISCONNECTED: { channelId: string; reason: 'kicked' | 'moved' | 'replaced' | 'channel_deleted' | 'lost' };
  VOICE_MOVED: { from: string; to: string; guildId: string | null };
  CALL_CREATE: ActiveCall;
  CALL_UPDATE: ActiveCall;
  CALL_DELETE: { channelId: string };
}

export type GatewayEventName = keyof GatewayEvents;

export interface TransportOptions {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: unknown;
  iceServers: IceServerConfig[];
}

export interface ConsumeResult {
  id: string;
  producerId: string;
  userId: string;
  kind: 'audio' | 'video';
  source: SourceType;
  rtpParameters: unknown;
  type: string;
  producerPaused: boolean;
}

export interface RpcMethods {
  'presence.update': {
    req: { status?: UserStatus; activities?: Activity[]; customStatus?: CustomStatus | null; afk?: boolean };
    res: { ok: true };
  };
  'typing.start': { req: { channelId: string }; res: { ok: true } };
  'voice.join': {
    req: { channelId: string; selfMute: boolean; selfDeaf: boolean; voiceSessionId: string };
    res: {
      channelId: string;
      routerRtpCapabilities: unknown;
      iceServers: IceServerConfig[];
      producers: ProducerInfo[];
      voiceStates: VoiceState[];
    };
  };
  'voice.leave': { req: Record<string, never>; res: { ok: true } };
  'voice.resume': { req: { voiceSessionId: string }; res: { ok: boolean } };
  'voice.createTransport': { req: { direction: 'send' | 'recv' }; res: TransportOptions };
  'voice.connectTransport': { req: { transportId: string; dtlsParameters: unknown }; res: { ok: true } };
  'voice.restartIce': { req: { transportId: string }; res: { iceParameters: unknown } };
  'voice.produce': {
    req: { transportId: string; kind: 'audio' | 'video'; rtpParameters: unknown; source: SourceType; paused?: boolean };
    res: { producerId: string };
  };
  'voice.closeProducer': { req: { producerId: string }; res: { ok: true } };
  'voice.setProducerPaused': { req: { producerId: string; paused: boolean }; res: { ok: true } };
  'voice.consume': { req: { producerId: string; rtpCapabilities: unknown }; res: ConsumeResult };
  'voice.resumeConsumer': { req: { consumerId: string }; res: { ok: true } };
  'voice.pauseConsumer': { req: { consumerId: string }; res: { ok: true } };
  'voice.closeConsumer': { req: { consumerId: string }; res: { ok: true } };
  'voice.setConsumerLayers': {
    req: { consumerId: string; spatialLayer: number; temporalLayer?: number };
    res: { ok: true };
  };
  'voice.updateState': {
    req: { selfMute?: boolean; selfDeaf?: boolean; selfVideo?: boolean; selfStream?: boolean };
    res: { ok: true };
  };
  'voice.stats': { req: { rtt: number; loss: number }; res: { ok: true } };
  'voice.moderate': {
    req: { userId: string; mute?: boolean; deaf?: boolean; disconnect?: boolean; moveTo?: string };
    res: { ok: true };
  };
  'call.ring': { req: { channelId: string; userIds?: string[] }; res: { ok: true } };
  'call.decline': { req: { channelId: string }; res: { ok: true } };
}

export type RpcMethod = keyof RpcMethods;

export type GatewayPayload =
  | { op: typeof GatewayOp.HELLO; d: { heartbeatInterval: number } }
  | { op: typeof GatewayOp.HEARTBEAT; d: number | null }
  | { op: typeof GatewayOp.HEARTBEAT_ACK; d: null }
  | {
      op: typeof GatewayOp.IDENTIFY;
      d: { token: string; client: { platform: string; version: string }; status?: UserStatus };
    }
  | { op: typeof GatewayOp.INVALID_SESSION; d: { reason: string } }
  | { op: typeof GatewayOp.DISPATCH; t: GatewayEventName; s: number; d: unknown }
  | { op: typeof GatewayOp.REQUEST; id: number; m: RpcMethod; d: unknown }
  | {
      op: typeof GatewayOp.RESPONSE;
      id: number;
      ok: boolean;
      d?: unknown;
      error?: { code: string; message: string };
    };
