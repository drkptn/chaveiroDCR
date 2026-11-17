/** Sintaxe de menções e emojis embutidos no conteúdo da mensagem. */
export const USER_MENTION = /<@(\d{15,20})>/g;
export const ROLE_MENTION = /<@&(\d{15,20})>/g;
export const CHANNEL_MENTION = /<#(\d{15,20})>/g;
export const CUSTOM_EMOJI = /<(a?):([a-zA-Z0-9_]{2,32}):(\d{15,20})>/g;
export const EVERYONE_MENTION = /(^|\s)@(everyone|here)(?=$|\s|[.,!?])/;

export function extractUserMentions(content: string): string[] {
  return [...new Set([...content.matchAll(USER_MENTION)].map((m) => m[1]!))];
}
export function extractRoleMentions(content: string): string[] {
  return [...new Set([...content.matchAll(ROLE_MENTION)].map((m) => m[1]!))];
}
export function hasEveryoneMention(content: string): boolean {
  // ignora dentro de blocos de código
  const stripped = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  return EVERYONE_MENTION.test(stripped);
}
/** Chave estável para uma reação: id do emoji custom ou o próprio unicode. */
export function emojiKey(e: { id: string | null; name: string }): string {
  return e.id ?? e.name;
}
