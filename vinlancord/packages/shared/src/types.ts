/** Tipos de dados trafegados entre cliente e servidor (REST + gateway). */

export type UserStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';
export type VisibleStatus = Exclude<UserStatus, 'invisible'>;

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  accentColor: string | null;
  createdAt: string;
  system?: boolean;
  /** selos especiais concedidos pelo operador do servidor (ver BADGES) */
  badges?: string[];
}

/** Selos que o app sabe exibir. */
export const BADGES = {
  creator: { label: 'Lord of Freedom', description: 'Criador do Além-Mar' },
} as const;
export type BadgeId = keyof typeof BADGES;

export interface ProfileLink {
  label: string;
  url: string;
}

export interface CustomStatus {
  text: string | null;
  emoji: string | null;
  expiresAt: string | null;
}

export interface SelfUser extends PublicUser {
  email: string;
  emailVerified: boolean;
  bio: string;
  pronouns: string;
  banner: string | null;
  bannerColor: string | null;
  links: ProfileLink[];
  status: UserStatus;
  customStatus: CustomStatus | null;
}

export type ActivityType = 'playing' | 'listening' | 'watching' | 'streaming' | 'competing';

export interface Activity {
  type: ActivityType;
  name: string;
  details?: string | null;
  state?: string | null;
  startedAt?: number | null;
}

export interface Presence {
  userId: string;
  status: VisibleStatus;
  activities: Activity[];
  customStatus: CustomStatus | null;
}

export interface UserProfile {
  user: PublicUser;
  bio: string | null;
  pronouns: string | null;
  banner: string | null;
  bannerColor: string | null;
  links: ProfileLink[] | null;
  mutualGuildIds: string[];
  mutualFriendIds: string[];
  recentActivities: { name: string; type: ActivityType; lastSeenAt: string }[] | null;
  relationship: RelationshipType | null;
  /** Campos ocultos pela privacidade do usuário. */
  hidden: string[];
}

export type RelationshipType = 'friend' | 'incoming' | 'outgoing' | 'blocked';

export interface Relationship {
  id: string;
  type: RelationshipType;
  user: PublicUser;
  since: string;
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  description: string;
  ownerId: string;
  isPublic: boolean;
  memberCount: number;
  systemChannelId: string | null;
  createdAt: string;
}

export interface Role {
  id: string;
  guildId: string;
  name: string;
  color: string | null;
  position: number;
  permissions: string;
  hoist: boolean;
  mentionable: boolean;
}

export interface Member {
  guildId: string;
  userId: string;
  nick: string | null;
  roles: string[];
  joinedAt: string;
  timeoutUntil: string | null;
  mute: boolean;
  deaf: boolean;
}

export type ChannelType = 'text' | 'voice' | 'video' | 'category' | 'dm' | 'group_dm';

export interface PermissionOverwrite {
  id: string;
  type: 'role' | 'member';
  allow: string;
  deny: string;
}

export interface Channel {
  id: string;
  type: ChannelType;
  guildId: string | null;
  name: string;
  topic: string;
  position: number;
  parentId: string | null;
  slowmode: number;
  userLimit: number;
  bitrate: number;
  lastMessageId: string | null;
  overwrites: PermissionOverwrite[];
  /** Apenas DMs e grupos. */
  recipients?: string[];
  ownerId?: string | null;
  icon?: string | null;
}

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  kind: AttachmentKind;
  width: number | null;
  height: number | null;
  spoiler: boolean;
}

export interface EmojiRef {
  /** null = emoji unicode */
  id: string | null;
  name: string;
  animated?: boolean;
  url?: string | null;
}

export interface Reaction {
  emoji: EmojiRef;
  count: number;
  me: boolean;
}

export type MessageType =
  | 'default'
  | 'reply'
  | 'member_join'
  | 'call'
  | 'pin'
  | 'channel_pinned'
  | 'group_add'
  | 'group_remove'
  | 'group_name'
  | 'event';

export interface MessageReference {
  id: string;
  authorId: string | null;
  content: string;
  deleted: boolean;
  hasAttachments: boolean;
}

export interface CallInfo {
  participants: string[];
  endedAt: string | null;
}

export interface StickerRef {
  id: string;
  name: string;
  url: string;
  format: 'png' | 'gif' | 'webp' | 'apng';
}

export interface Message {
  id: string;
  channelId: string;
  guildId: string | null;
  author: PublicUser;
  content: string;
  type: MessageType;
  createdAt: string;
  editedAt: string | null;
  pinned: boolean;
  mentions: string[];
  mentionRoles: string[];
  mentionEveryone: boolean;
  attachments: Attachment[];
  reactions: Reaction[];
  reference: MessageReference | null;
  sticker: StickerRef | null;
  call: CallInfo | null;
  nonce?: string | null;
}

export interface GuildEmoji {
  id: string;
  guildId: string;
  name: string;
  url: string;
  animated: boolean;
}

export interface GuildSticker {
  id: string;
  guildId: string;
  name: string;
  description: string;
  url: string;
  format: StickerRef['format'];
}

export interface Invite {
  code: string;
  guild: Pick<Guild, 'id' | 'name' | 'icon' | 'banner' | 'description'> & { memberCount: number; onlineCount: number };
  channelId: string | null;
  inviter: PublicUser | null;
  uses: number;
  maxUses: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface Ban {
  user: PublicUser;
  reason: string | null;
  createdAt: string;
}

export interface VoiceState {
  userId: string;
  channelId: string;
  guildId: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
  selfVideo: boolean;
  selfStream: boolean;
  joinedAt: string;
}

export interface ActiveCall {
  channelId: string;
  ringing: string[];
  startedBy: string;
  startedAt: string;
  messageId: string | null;
}

export interface ReadState {
  channelId: string;
  lastReadId: string | null;
  mentions: number;
}

export type NotificationLevel = 'all' | 'mentions' | 'nothing';

export interface NotificationSetting {
  scopeId: string;
  level: NotificationLevel | null;
  muted: boolean;
  mutedUntil: string | null;
  suppressEveryone: boolean;
}

export interface ScheduledEvent {
  id: string;
  guildId: string;
  channelId: string | null;
  creatorId: string;
  name: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string | null;
  status: 'scheduled' | 'active' | 'completed' | 'canceled';
  cover: string | null;
  interestedCount: number;
  me: boolean;
}

export interface AuditLogEntry {
  id: string;
  guildId: string;
  actorId: string | null;
  action: string;
  targetId: string | null;
  reason: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

export interface SessionInfo {
  id: string;
  deviceName: string;
  platform: string;
  ip: string | null;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

export type ThemeMode = 'dark' | 'light' | 'system';

export interface PrivacySettings {
  /** Quem pode mandar DM (além de amigos). */
  dmsFrom: 'everyone' | 'server_members' | 'friends';
  /** Quem pode enviar pedido de amizade. */
  friendRequestsFrom: 'everyone' | 'server_members' | 'nobody';
  /** Quem vê bio, banner e links. */
  profileDetails: 'everyone' | 'friends';
  /** Mostrar jogo/atividade atual. */
  showActivity: boolean;
  /** Mostrar histórico de atividades recentes no perfil. */
  showRecentActivity: boolean;
}

export interface NotificationPrefs {
  desktop: boolean;
  sounds: boolean;
  messageSound: boolean;
  mentionSound: boolean;
  callSound: boolean;
  voiceJoinSound: boolean;
  friendRequests: boolean;
  flashTaskbar: boolean;
  dmLevel: 'all' | 'nothing';
}

export type CornerStyle = 'round' | 'soft' | 'sharp' | 'cut';
export type IconShape = 'circle' | 'squircle' | 'diamond' | 'hexagon' | 'shield';
export type AmbientEffect = 'none' | 'feathers' | 'ink' | 'embers' | 'ash' | 'sigils' | 'snow' | 'rain' | 'petals' | 'stars' | 'tide';
export type TransitionStyle = 'none' | 'fade' | 'rise' | 'slash' | 'ink' | 'shutter';
export type MessageStyle = 'flat' | 'cards' | 'letter';
export type AnimationLevel = 'full' | 'reduced' | 'off';

/** Aparência completa (sincronizada com a conta). Imagem de fundo fica só no dispositivo. */
export interface Appearance {
  preset: string;
  mode: 'dark' | 'light';
  colors: Record<string, string>;
  displayFont: string;
  bodyFont: string;
  corners: CornerStyle;
  serverShape: IconShape;
  avatarShape: IconShape;
  layout: 'floating' | 'classic';
  panelOpacity: number;
  blur: number;
  glow: number;
  ornaments: boolean;
  effect: AmbientEffect;
  effectIntensity: number;
  fog: boolean;
  grain: number;
  vignette: number;
  scanlines: boolean;
  transition: TransitionStyle;
  animations: AnimationLevel;
  animSpeed: number;
  messageStyle: MessageStyle;
  chapterNumbers: boolean;
  cursorTrail: boolean;
  bgDim: number;
  bgBlur: number;
  customCss: string;
}

export interface UserSettings {
  appearance?: Appearance;
  theme: string;
  mode: ThemeMode;
  accent: string;
  fontScale: number;
  compact: boolean;
  reduceMotion: boolean;
  showSeconds: boolean;
  privacy: PrivacySettings;
  notifications: NotificationPrefs;
  guildFolders: string[];
  /** Jogos personalizados adicionados pelo usuário (nome do processo -> nome do jogo). */
  customGames: { process: string; name: string }[];
  favoriteGifs: { url: string; preview: string; width: number; height: number }[];
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'alem-mar',
  mode: 'dark',
  accent: '#7c5cff',
  fontScale: 1,
  compact: false,
  reduceMotion: false,
  showSeconds: false,
  privacy: {
    dmsFrom: 'server_members',
    friendRequestsFrom: 'everyone',
    profileDetails: 'everyone',
    showActivity: true,
    showRecentActivity: true,
  },
  notifications: {
    desktop: true,
    sounds: true,
    messageSound: true,
    mentionSound: true,
    callSound: true,
    voiceJoinSound: true,
    friendRequests: true,
    flashTaskbar: true,
    dmLevel: 'all',
  },
  guildFolders: [],
  customGames: [],
  favoriteGifs: [],
};

export interface GuildFull extends Guild {
  roles: Role[];
  channels: Channel[];
  me: Member;
  emojis: GuildEmoji[];
  stickers: GuildSticker[];
}

export interface ReadyPayload {
  sessionId: string;
  user: SelfUser;
  settings: UserSettings;
  guilds: GuildFull[];
  privateChannels: Channel[];
  relationships: Relationship[];
  users: PublicUser[];
  presences: Presence[];
  voiceStates: VoiceState[];
  readStates: ReadState[];
  notificationSettings: NotificationSetting[];
  calls: ActiveCall[];
}

export interface GifResult {
  id: string;
  title: string;
  url: string;
  preview: string;
  width: number;
  height: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}
