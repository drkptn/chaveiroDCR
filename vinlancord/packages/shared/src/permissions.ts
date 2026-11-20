/**
 * Sistema de permissões do Além-Mar (bitflags em BigInt).
 *
 * O cálculo é compartilhado entre servidor e cliente, mas o servidor é a
 * única autoridade: o cliente usa apenas para esconder/mostrar controles.
 */

export const P = {
  VIEW_CHANNEL: 1n << 0n,
  SEND_MESSAGES: 1n << 1n,
  READ_MESSAGE_HISTORY: 1n << 2n,
  ATTACH_FILES: 1n << 3n,
  EMBED_LINKS: 1n << 4n,
  ADD_REACTIONS: 1n << 5n,
  USE_EXTERNAL_EMOJIS: 1n << 6n,
  MENTION_EVERYONE: 1n << 7n,
  MANAGE_MESSAGES: 1n << 8n,
  PIN_MESSAGES: 1n << 9n,
  CREATE_INVITE: 1n << 10n,
  CHANGE_NICKNAME: 1n << 11n,
  MANAGE_NICKNAMES: 1n << 12n,
  MANAGE_CHANNELS: 1n << 13n,
  MANAGE_ROLES: 1n << 14n,
  MANAGE_GUILD: 1n << 15n,
  MANAGE_EMOJIS: 1n << 16n,
  MANAGE_EVENTS: 1n << 17n,
  KICK_MEMBERS: 1n << 18n,
  BAN_MEMBERS: 1n << 19n,
  MODERATE_MEMBERS: 1n << 20n,
  VIEW_AUDIT_LOG: 1n << 21n,
  CONNECT: 1n << 22n,
  SPEAK: 1n << 23n,
  VIDEO: 1n << 24n,
  STREAM: 1n << 25n,
  USE_VAD: 1n << 26n,
  MUTE_MEMBERS: 1n << 27n,
  DEAFEN_MEMBERS: 1n << 28n,
  MOVE_MEMBERS: 1n << 29n,
  PRIORITY_SPEAKER: 1n << 30n,
  ADMINISTRATOR: 1n << 40n,
} as const;

export type PermissionName = keyof typeof P;

export const ALL_PERMISSIONS: bigint = Object.values(P).reduce((a, b) => a | b, 0n);

export const DEFAULT_EVERYONE_PERMISSIONS: bigint =
  P.VIEW_CHANNEL |
  P.SEND_MESSAGES |
  P.READ_MESSAGE_HISTORY |
  P.ATTACH_FILES |
  P.EMBED_LINKS |
  P.ADD_REACTIONS |
  P.USE_EXTERNAL_EMOJIS |
  P.CREATE_INVITE |
  P.CHANGE_NICKNAME |
  P.CONNECT |
  P.SPEAK |
  P.VIDEO |
  P.STREAM |
  P.USE_VAD;

/** Permissões fixas em DMs e grupos privados. */
export const DM_PERMISSIONS: bigint =
  P.VIEW_CHANNEL |
  P.SEND_MESSAGES |
  P.READ_MESSAGE_HISTORY |
  P.ATTACH_FILES |
  P.EMBED_LINKS |
  P.ADD_REACTIONS |
  P.USE_EXTERNAL_EMOJIS |
  P.PIN_MESSAGES |
  P.CONNECT |
  P.SPEAK |
  P.VIDEO |
  P.STREAM |
  P.USE_VAD;

/** Permissões que fazem sentido em sobrescritas de canal. */
export const CHANNEL_SCOPED_PERMISSIONS: bigint =
  P.VIEW_CHANNEL |
  P.SEND_MESSAGES |
  P.READ_MESSAGE_HISTORY |
  P.ATTACH_FILES |
  P.EMBED_LINKS |
  P.ADD_REACTIONS |
  P.USE_EXTERNAL_EMOJIS |
  P.MENTION_EVERYONE |
  P.MANAGE_MESSAGES |
  P.PIN_MESSAGES |
  P.CREATE_INVITE |
  P.MANAGE_CHANNELS |
  P.MANAGE_ROLES |
  P.CONNECT |
  P.SPEAK |
  P.VIDEO |
  P.STREAM |
  P.USE_VAD |
  P.MUTE_MEMBERS |
  P.DEAFEN_MEMBERS |
  P.MOVE_MEMBERS |
  P.PRIORITY_SPEAKER;

const TEXT_DEPENDENT = P.MENTION_EVERYONE | P.ATTACH_FILES | P.EMBED_LINKS;
const VOICE_DEPENDENT =
  P.SPEAK | P.VIDEO | P.STREAM | P.USE_VAD | P.MUTE_MEMBERS | P.DEAFEN_MEMBERS | P.MOVE_MEMBERS | P.PRIORITY_SPEAKER;
/** O que um membro silenciado (timeout) ainda pode fazer. */
const TIMEOUT_ALLOWED = P.VIEW_CHANNEL | P.READ_MESSAGE_HISTORY;

export interface RoleLike {
  id: string;
  permissions: bigint | string;
  position: number;
}

export interface OverwriteLike {
  id: string;
  type: 'role' | 'member';
  allow: bigint | string;
  deny: bigint | string;
}

export const toBig = (v: bigint | string | number | null | undefined): bigint => {
  if (v === null || v === undefined || v === '') return 0n;
  return typeof v === 'bigint' ? v : BigInt(v);
};

export const has = (perms: bigint, flag: bigint): boolean => (perms & flag) === flag;

export interface BaseContext {
  guildId: string;
  ownerId: string;
  userId: string;
  /** Todos os cargos do servidor (inclui @everyone, cujo id == guildId). */
  roles: RoleLike[];
  /** IDs dos cargos do membro (sem @everyone). */
  memberRoleIds: string[];
  timeoutUntil?: Date | string | null;
}

export function computeBasePermissions(ctx: BaseContext): bigint {
  if (ctx.userId === ctx.ownerId) return ALL_PERMISSIONS;
  const everyone = ctx.roles.find((r) => r.id === ctx.guildId);
  let perms = toBig(everyone?.permissions);
  const mine = new Set(ctx.memberRoleIds);
  for (const r of ctx.roles) if (mine.has(r.id)) perms |= toBig(r.permissions);
  if (has(perms, P.ADMINISTRATOR)) return ALL_PERMISSIONS;
  return perms;
}

export function isTimedOut(timeoutUntil?: Date | string | null, now = Date.now()): boolean {
  if (!timeoutUntil) return false;
  return new Date(timeoutUntil).getTime() > now;
}

export function computeChannelPermissions(
  ctx: BaseContext,
  overwrites: OverwriteLike[],
  opts: { voice?: boolean } = {},
): bigint {
  const base = computeBasePermissions(ctx);
  if (has(base, P.ADMINISTRATOR)) return ALL_PERMISSIONS;

  let perms = base;
  const everyoneOw = overwrites.find((o) => o.type === 'role' && o.id === ctx.guildId);
  if (everyoneOw) perms = (perms & ~toBig(everyoneOw.deny)) | toBig(everyoneOw.allow);

  const mine = new Set(ctx.memberRoleIds);
  let allow = 0n;
  let deny = 0n;
  for (const o of overwrites) {
    if (o.type === 'role' && o.id !== ctx.guildId && mine.has(o.id)) {
      allow |= toBig(o.allow);
      deny |= toBig(o.deny);
    }
  }
  perms = (perms & ~deny) | allow;

  const memberOw = overwrites.find((o) => o.type === 'member' && o.id === ctx.userId);
  if (memberOw) perms = (perms & ~toBig(memberOw.deny)) | toBig(memberOw.allow);

  return applyImplicit(perms, ctx, opts);
}

function applyImplicit(perms: bigint, ctx: BaseContext, opts: { voice?: boolean }): bigint {
  if (!has(perms, P.VIEW_CHANNEL)) return 0n;
  if (!has(perms, P.SEND_MESSAGES)) perms &= ~TEXT_DEPENDENT;
  if (opts.voice && !has(perms, P.CONNECT)) perms &= ~VOICE_DEPENDENT;
  if (ctx.userId !== ctx.ownerId && isTimedOut(ctx.timeoutUntil)) perms &= TIMEOUT_ALLOWED;
  return perms;
}

/** Maior posição de cargo do membro (o dono tem posição infinita). */
export function highestRolePosition(ctx: Pick<BaseContext, 'roles' | 'memberRoleIds' | 'ownerId' | 'userId'>): number {
  if (ctx.userId === ctx.ownerId) return Number.POSITIVE_INFINITY;
  const mine = new Set(ctx.memberRoleIds);
  let max = 0;
  for (const r of ctx.roles) if (mine.has(r.id) && r.position > max) max = r.position;
  return max;
}

export function serializePerms(v: bigint): string {
  return v.toString();
}

export interface PermissionInfo {
  key: PermissionName;
  label: string;
  description: string;
  group: 'Geral' | 'Membros' | 'Texto' | 'Voz e vídeo' | 'Avançado';
  channel: boolean;
}

export const PERMISSION_INFO: PermissionInfo[] = [
  { key: 'VIEW_CHANNEL', group: 'Geral', channel: true, label: 'Ver canais', description: 'Permite ver canais e ler o que está lá.' },
  { key: 'MANAGE_CHANNELS', group: 'Geral', channel: true, label: 'Gerenciar canais', description: 'Criar, editar, reordenar e excluir canais.' },
  { key: 'MANAGE_ROLES', group: 'Geral', channel: true, label: 'Gerenciar cargos', description: 'Criar e editar cargos abaixo do seu maior cargo e permissões de canais.' },
  { key: 'MANAGE_EMOJIS', group: 'Geral', channel: false, label: 'Gerenciar emojis e figurinhas', description: 'Adicionar e remover emojis e figurinhas personalizados.' },
  { key: 'VIEW_AUDIT_LOG', group: 'Geral', channel: false, label: 'Ver registro de auditoria', description: 'Ver o histórico de ações administrativas.' },
  { key: 'MANAGE_GUILD', group: 'Geral', channel: false, label: 'Gerenciar servidor', description: 'Alterar nome, ícone, banner, descrição e privacidade do servidor.' },
  { key: 'MANAGE_EVENTS', group: 'Geral', channel: false, label: 'Gerenciar eventos', description: 'Criar, editar e cancelar eventos.' },
  { key: 'CREATE_INVITE', group: 'Membros', channel: true, label: 'Criar convites', description: 'Convidar novas pessoas para o servidor.' },
  { key: 'CHANGE_NICKNAME', group: 'Membros', channel: false, label: 'Alterar apelido', description: 'Alterar o próprio apelido no servidor.' },
  { key: 'MANAGE_NICKNAMES', group: 'Membros', channel: false, label: 'Gerenciar apelidos', description: 'Alterar o apelido de outros membros.' },
  { key: 'KICK_MEMBERS', group: 'Membros', channel: false, label: 'Expulsar membros', description: 'Remover membros do servidor (podem voltar com convite).' },
  { key: 'BAN_MEMBERS', group: 'Membros', channel: false, label: 'Banir membros', description: 'Banir membros permanentemente.' },
  { key: 'MODERATE_MEMBERS', group: 'Membros', channel: false, label: 'Silenciar membros (castigo)', description: 'Impedir temporariamente um membro de falar ou enviar mensagens.' },
  { key: 'SEND_MESSAGES', group: 'Texto', channel: true, label: 'Enviar mensagens', description: 'Enviar mensagens em canais de texto.' },
  { key: 'READ_MESSAGE_HISTORY', group: 'Texto', channel: true, label: 'Ver histórico', description: 'Ler mensagens antigas do canal.' },
  { key: 'ATTACH_FILES', group: 'Texto', channel: true, label: 'Anexar arquivos', description: 'Enviar imagens, vídeos e arquivos.' },
  { key: 'EMBED_LINKS', group: 'Texto', channel: true, label: 'Incorporar links', description: 'Links enviados exibem prévias.' },
  { key: 'ADD_REACTIONS', group: 'Texto', channel: true, label: 'Adicionar reações', description: 'Reagir a mensagens com emojis.' },
  { key: 'USE_EXTERNAL_EMOJIS', group: 'Texto', channel: true, label: 'Usar emojis externos', description: 'Usar emojis de outros servidores.' },
  { key: 'MENTION_EVERYONE', group: 'Texto', channel: true, label: 'Mencionar @everyone', description: 'Notificar todos os membros de uma vez.' },
  { key: 'MANAGE_MESSAGES', group: 'Texto', channel: true, label: 'Gerenciar mensagens', description: 'Excluir mensagens de outros membros.' },
  { key: 'PIN_MESSAGES', group: 'Texto', channel: true, label: 'Fixar mensagens', description: 'Fixar e desafixar mensagens.' },
  { key: 'CONNECT', group: 'Voz e vídeo', channel: true, label: 'Conectar', description: 'Entrar em canais de voz e vídeo.' },
  { key: 'SPEAK', group: 'Voz e vídeo', channel: true, label: 'Falar', description: 'Transmitir áudio do microfone.' },
  { key: 'VIDEO', group: 'Voz e vídeo', channel: true, label: 'Câmera', description: 'Transmitir vídeo da câmera.' },
  { key: 'STREAM', group: 'Voz e vídeo', channel: true, label: 'Compartilhar tela', description: 'Transmitir tela, janelas e áudio do sistema.' },
  { key: 'USE_VAD', group: 'Voz e vídeo', channel: true, label: 'Usar detecção de voz', description: 'Sem isso, o membro precisa usar aperte-para-falar.' },
  { key: 'PRIORITY_SPEAKER', group: 'Voz e vídeo', channel: true, label: 'Voz prioritária', description: 'Destaque na grade de participantes.' },
  { key: 'MUTE_MEMBERS', group: 'Voz e vídeo', channel: true, label: 'Silenciar membros', description: 'Silenciar o microfone de outros na voz.' },
  { key: 'DEAFEN_MEMBERS', group: 'Voz e vídeo', channel: true, label: 'Ensurdecer membros', description: 'Desativar o áudio de outros na voz.' },
  { key: 'MOVE_MEMBERS', group: 'Voz e vídeo', channel: true, label: 'Mover/desconectar membros', description: 'Mover membros entre canais de voz ou desconectá-los.' },
  { key: 'ADMINISTRATOR', group: 'Avançado', channel: false, label: 'Administrador', description: 'Todas as permissões e ignora sobrescritas de canal. Cuidado!' },
];
