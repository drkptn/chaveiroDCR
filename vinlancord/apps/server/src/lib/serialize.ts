/** Conversão de linhas do banco para os DTOs públicos (nunca vaza campos privados). */
import type {
  Attachment as AttachmentDTO,
  Channel as ChannelDTO,
  ChannelType,
  Guild as GuildDTO,
  GuildEmoji,
  GuildSticker,
  Member as MemberDTO,
  MessageType,
  PublicUser,
  Role as RoleDTO,
  SelfUser,
  CustomStatus,
  ProfileLink,
  ScheduledEvent as EventDTO,
} from '@vinlancord/shared';
import type {
  Attachment,
  Channel,
  ChannelRecipient,
  Emoji,
  Guild,
  Member,
  MemberRole,
  PermissionOverwrite,
  Role,
  ScheduledEvent,
  Sticker,
  User,
} from '../generated/prisma/client';
import { publicUrl, signedUrl } from '../storage';
import { kindOf } from './media';

export const imageUrl = (key: string | null | undefined) => (key ? publicUrl(`${key}.webp`) : null);

export type UserRow = Pick<User, 'id' | 'username' | 'displayName' | 'avatarKey' | 'accentColor' | 'createdAt' | 'system' | 'badges'>;
export const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarKey: true,
  accentColor: true,
  createdAt: true,
  system: true,
  badges: true,
} as const;

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatar: imageUrl(u.avatarKey),
    accentColor: u.accentColor,
    createdAt: u.createdAt.toISOString(),
    ...(u.system ? { system: true } : {}),
    ...(u.badges?.length ? { badges: u.badges } : {}),
  };
}

export function parseCustomStatus(v: unknown): CustomStatus | null {
  if (!v || typeof v !== 'object') return null;
  const cs = v as CustomStatus;
  if (cs.expiresAt && new Date(cs.expiresAt).getTime() < Date.now()) return null;
  if (!cs.text && !cs.emoji) return null;
  return { text: cs.text ?? null, emoji: cs.emoji ?? null, expiresAt: cs.expiresAt ?? null };
}

export function toSelfUser(u: User): SelfUser {
  return {
    ...toPublicUser(u),
    email: u.email,
    emailVerified: u.emailVerified,
    bio: u.bio,
    pronouns: u.pronouns,
    banner: imageUrl(u.bannerKey),
    bannerColor: u.bannerColor,
    links: (Array.isArray(u.links) ? u.links : []) as unknown as ProfileLink[],
    status: u.status,
    customStatus: parseCustomStatus(u.customStatus),
  };
}

export function toGuild(g: Guild, memberCount: number): GuildDTO {
  return {
    id: g.id,
    name: g.name,
    icon: imageUrl(g.iconKey),
    banner: imageUrl(g.bannerKey),
    description: g.description,
    ownerId: g.ownerId,
    isPublic: g.isPublic,
    memberCount,
    systemChannelId: g.systemChannelId,
    createdAt: g.createdAt.toISOString(),
  };
}

export function toRole(r: Role): RoleDTO {
  return {
    id: r.id,
    guildId: r.guildId,
    name: r.name,
    color: r.color,
    position: r.position,
    permissions: r.permissions.toString(),
    hoist: r.hoist,
    mentionable: r.mentionable,
  };
}

export function toMember(m: Member & { roles: Pick<MemberRole, 'roleId'>[] }): MemberDTO {
  return {
    guildId: m.guildId,
    userId: m.userId,
    nick: m.nick,
    roles: m.roles.map((r) => r.roleId),
    joinedAt: m.joinedAt.toISOString(),
    timeoutUntil: m.timeoutUntil && m.timeoutUntil.getTime() > Date.now() ? m.timeoutUntil.toISOString() : null,
    mute: m.mute,
    deaf: m.deaf,
  };
}

const CHANNEL_TYPES: Record<Channel['type'], ChannelType> = {
  TEXT: 'text',
  VOICE: 'voice',
  VIDEO: 'video',
  CATEGORY: 'category',
  DM: 'dm',
  GROUP_DM: 'group_dm',
};
export const channelTypeToDb = Object.fromEntries(Object.entries(CHANNEL_TYPES).map(([k, v]) => [v, k])) as Record<
  ChannelType,
  Channel['type']
>;

export function toChannel(
  c: Channel & { overwrites?: PermissionOverwrite[]; recipients?: Pick<ChannelRecipient, 'userId'>[] },
): ChannelDTO {
  const dto: ChannelDTO = {
    id: c.id,
    type: CHANNEL_TYPES[c.type],
    guildId: c.guildId,
    name: c.name,
    topic: c.topic,
    position: c.position,
    parentId: c.parentId,
    slowmode: c.slowmode,
    userLimit: c.userLimit,
    bitrate: c.bitrate,
    lastMessageId: c.lastMessageId,
    overwrites: (c.overwrites ?? []).map((o) => ({
      id: o.targetId,
      type: o.type === 'ROLE' ? 'role' : 'member',
      allow: o.allow.toString(),
      deny: o.deny.toString(),
    })),
  };
  if (c.type === 'DM' || c.type === 'GROUP_DM') {
    dto.recipients = (c.recipients ?? []).map((r) => r.userId);
    dto.ownerId = c.ownerId;
    dto.icon = imageUrl(c.iconKey);
  }
  return dto;
}

export function toAttachment(a: Attachment): AttachmentDTO {
  return {
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    url: signedUrl(a.storageKey, a.filename),
    kind: kindOf(a.contentType),
    width: a.width,
    height: a.height,
    spoiler: a.spoiler,
  };
}

export function toEmoji(e: Emoji): GuildEmoji {
  return { id: e.id, guildId: e.guildId, name: e.name, animated: e.animated, url: imageUrl(e.imageKey)! };
}

export function toSticker(s: Sticker): GuildSticker {
  return {
    id: s.id,
    guildId: s.guildId,
    name: s.name,
    description: s.description,
    format: s.format as GuildSticker['format'],
    url: imageUrl(s.imageKey)!,
  };
}

const MESSAGE_TYPES: Record<string, MessageType> = {
  DEFAULT: 'default',
  REPLY: 'reply',
  MEMBER_JOIN: 'member_join',
  CALL: 'call',
  PIN: 'pin',
  GROUP_ADD: 'group_add',
  GROUP_REMOVE: 'group_remove',
  GROUP_NAME: 'group_name',
  EVENT: 'event',
};
export const messageType = (t: string): MessageType => MESSAGE_TYPES[t] ?? 'default';

export function toEvent(e: ScheduledEvent & { _count?: { rsvps: number } }, me: boolean): EventDTO {
  return {
    id: e.id,
    guildId: e.guildId,
    channelId: e.channelId,
    creatorId: e.creatorId,
    name: e.name,
    description: e.description,
    location: e.location,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt?.toISOString() ?? null,
    status: e.status.toLowerCase() as EventDTO['status'],
    cover: imageUrl(e.coverKey),
    interestedCount: e._count?.rsvps ?? 0,
    me,
  };
}
