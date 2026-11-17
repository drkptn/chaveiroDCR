/** Limites e regras de validação compartilhados (o servidor sempre revalida). */
export const LIMITS = {
  USERNAME_MIN: 2,
  USERNAME_MAX: 32,
  DISPLAY_NAME_MAX: 32,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  BIO_MAX: 300,
  PRONOUNS_MAX: 40,
  LINKS_MAX: 5,
  CUSTOM_STATUS_MAX: 128,
  GUILD_NAME_MIN: 2,
  GUILD_NAME_MAX: 100,
  GUILD_DESCRIPTION_MAX: 300,
  CHANNEL_NAME_MAX: 100,
  CHANNEL_TOPIC_MAX: 1024,
  ROLE_NAME_MAX: 100,
  MESSAGE_MAX: 4000,
  ATTACHMENTS_PER_MESSAGE: 10,
  /** bytes */
  ATTACHMENT_MAX_SIZE: 50 * 1024 * 1024,
  AVATAR_MAX_SIZE: 10 * 1024 * 1024,
  BANNER_MAX_SIZE: 15 * 1024 * 1024,
  EMOJI_MAX_SIZE: 512 * 1024,
  STICKER_MAX_SIZE: 1024 * 1024,
  EMOJI_NAME_MIN: 2,
  EMOJI_NAME_MAX: 32,
  EMOJIS_PER_GUILD: 100,
  STICKERS_PER_GUILD: 30,
  GUILDS_PER_USER: 100,
  ROLES_PER_GUILD: 100,
  CHANNELS_PER_GUILD: 300,
  GROUP_DM_MAX: 10,
  MESSAGES_PAGE: 50,
  REACTIONS_PER_MESSAGE: 20,
  EVENT_NAME_MAX: 100,
  EVENT_DESCRIPTION_MAX: 1000,
  VOICE_USER_LIMIT_MAX: 99,
  NICK_MAX: 32,
  REPORT_DETAILS_MAX: 1000,
} as const;

export const USERNAME_REGEX = /^[a-z0-9_.]{2,32}$/;
export const EMOJI_NAME_REGEX = /^[a-zA-Z0-9_]{2,32}$/;
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/** Normaliza nome de canal de texto: minúsculas, hífens. */
export function normalizeTextChannelName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .normalize('NFKC')
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 100) || 'canal'
  );
}

/** Tipos de arquivo que podem ser exibidos inline (o resto vira download). */
export const INLINE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];
export const INLINE_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const INLINE_AUDIO_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/flac', 'audio/aac', 'audio/mp4'];

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
