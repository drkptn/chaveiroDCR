/**
 * Cache de permissões por servidor + verificação de acesso.
 * Toda rota e todo evento em tempo real passam por aqui: o backend é a
 * autoridade de permissões, nunca o cliente.
 */
import {
  DM_PERMISSIONS,
  P,
  computeBasePermissions,
  computeChannelPermissions,
  has,
  highestRolePosition,
  type OverwriteLike,
  type RoleLike,
} from '@vinlancord/shared';
import { prisma } from '../lib/db';
import { forbidden, notFound } from '../lib/errors';
import { kv } from '../lib/kv';

export interface GuildSnapshot {
  id: string;
  ownerId: string;
  roles: RoleLike[];
  members: Map<string, { roleIds: string[]; timeoutUntil: Date | null }>;
  channels: Map<string, { id: string; type: string; parentId: string | null; overwrites: OverwriteLike[] }>;
}

export interface ChannelMeta {
  id: string;
  type: string;
  guildId: string | null;
  recipients: string[];
  ownerId: string | null;
}

const guilds = new Map<string, Promise<GuildSnapshot | null>>();
const channels = new Map<string, Promise<ChannelMeta | null>>();
const INVALIDATE = 'vl:cache-invalidate';

async function loadGuild(guildId: string): Promise<GuildSnapshot | null> {
  const g = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      ownerId: true,
      roles: { select: { id: true, permissions: true, position: true } },
      members: { select: { userId: true, timeoutUntil: true, roles: { select: { roleId: true } } } },
      channels: {
        select: {
          id: true,
          type: true,
          parentId: true,
          overwrites: { select: { targetId: true, type: true, allow: true, deny: true } },
        },
      },
    },
  });
  if (!g) return null;
  return {
    id: g.id,
    ownerId: g.ownerId,
    roles: g.roles.map((r) => ({ id: r.id, permissions: r.permissions, position: r.position })),
    members: new Map(g.members.map((m) => [m.userId, { roleIds: m.roles.map((r) => r.roleId), timeoutUntil: m.timeoutUntil }])),
    channels: new Map(
      g.channels.map((c) => [
        c.id,
        {
          id: c.id,
          type: c.type,
          parentId: c.parentId,
          overwrites: c.overwrites.map((o) => ({
            id: o.targetId,
            type: o.type === 'ROLE' ? ('role' as const) : ('member' as const),
            allow: o.allow,
            deny: o.deny,
          })),
        },
      ]),
    ),
  };
}

export function getGuild(guildId: string): Promise<GuildSnapshot | null> {
  let p = guilds.get(guildId);
  if (!p) {
    p = loadGuild(guildId).catch((e) => {
      guilds.delete(guildId);
      throw e;
    });
    guilds.set(guildId, p);
  }
  return p;
}

async function loadChannel(channelId: string): Promise<ChannelMeta | null> {
  const c = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, type: true, guildId: true, ownerId: true, recipients: { select: { userId: true } } },
  });
  if (!c) return null;
  return { id: c.id, type: c.type, guildId: c.guildId, ownerId: c.ownerId, recipients: c.recipients.map((r) => r.userId) };
}

export function getChannelMeta(channelId: string): Promise<ChannelMeta | null> {
  let p = channels.get(channelId);
  if (!p) {
    p = loadChannel(channelId).catch((e) => {
      channels.delete(channelId);
      throw e;
    });
    channels.set(channelId, p);
    if (channels.size > 20_000) channels.clear();
  }
  return p;
}

function localInvalidate(kind: 'guild' | 'channel', id: string) {
  if (kind === 'guild') guilds.delete(id);
  else channels.delete(id);
}

/** Invalida o cache local e das demais instâncias. */
export function invalidateGuild(guildId: string) {
  localInvalidate('guild', guildId);
  void kv.publish(INVALIDATE, JSON.stringify({ kind: 'guild', id: guildId }));
}
export function invalidateChannel(channelId: string) {
  localInvalidate('channel', channelId);
  void kv.publish(INVALIDATE, JSON.stringify({ kind: 'channel', id: channelId }));
}
export async function initCacheInvalidation() {
  await kv.subscribe(INVALIDATE, (msg) => {
    try {
      const { kind, id } = JSON.parse(msg);
      localInvalidate(kind, id);
    } catch {
      /* ignora */
    }
  });
}

function ctxFor(g: GuildSnapshot, userId: string) {
  const m = g.members.get(userId);
  if (!m) return null;
  return { guildId: g.id, ownerId: g.ownerId, userId, roles: g.roles, memberRoleIds: m.roleIds, timeoutUntil: m.timeoutUntil };
}

export async function guildPermissions(guildId: string, userId: string): Promise<bigint> {
  const g = await getGuild(guildId);
  if (!g) return 0n;
  const ctx = ctxFor(g, userId);
  return ctx ? computeBasePermissions(ctx) : 0n;
}

export async function isMember(guildId: string, userId: string) {
  const g = await getGuild(guildId);
  return !!g?.members.has(userId);
}

export async function requireMember(guildId: string, userId: string): Promise<GuildSnapshot> {
  const g = await getGuild(guildId);
  if (!g || !g.members.has(userId)) throw notFound('Servidor');
  return g;
}

export async function requireGuildPerm(guildId: string, userId: string, perm: bigint): Promise<GuildSnapshot> {
  const g = await requireMember(guildId, userId);
  const perms = computeBasePermissions(ctxFor(g, userId)!);
  if (!has(perms, perm)) throw forbidden();
  return g;
}

const isVoiceType = (t: string) => t === 'VOICE' || t === 'VIDEO';

export function channelPermsFromSnapshot(g: GuildSnapshot, channelId: string, userId: string): bigint {
  const ch = g.channels.get(channelId);
  const ctx = ctxFor(g, userId);
  if (!ch || !ctx) return 0n;
  return computeChannelPermissions(ctx, ch.overwrites, { voice: isVoiceType(ch.type) });
}

export async function channelPermissions(channelId: string, userId: string): Promise<{ meta: ChannelMeta; perms: bigint } | null> {
  const meta = await getChannelMeta(channelId);
  if (!meta) return null;
  if (!meta.guildId) {
    return { meta, perms: meta.recipients.includes(userId) ? DM_PERMISSIONS : 0n };
  }
  const g = await getGuild(meta.guildId);
  if (!g) return null;
  return { meta, perms: channelPermsFromSnapshot(g, channelId, userId) };
}

/** Garante acesso ao canal (VIEW_CHANNEL + `perm`). Canais invisíveis viram 404. */
export async function requireChannelPerm(channelId: string, userId: string, perm: bigint = P.VIEW_CHANNEL) {
  const r = await channelPermissions(channelId, userId);
  if (!r || !has(r.perms, P.VIEW_CHANNEL)) throw notFound('Canal');
  if (!has(r.perms, perm)) throw forbidden();
  return r;
}

export async function usersWhoCanView(channelId: string): Promise<string[]> {
  const meta = await getChannelMeta(channelId);
  if (!meta) return [];
  if (!meta.guildId) return meta.recipients;
  const g = await getGuild(meta.guildId);
  if (!g) return [];
  const out: string[] = [];
  for (const userId of g.members.keys()) if (has(channelPermsFromSnapshot(g, channelId, userId), P.VIEW_CHANNEL)) out.push(userId);
  return out;
}

export async function guildMemberIds(guildId: string): Promise<string[]> {
  const g = await getGuild(guildId);
  return g ? [...g.members.keys()] : [];
}

export function rolePosition(g: GuildSnapshot, userId: string): number {
  const m = g.members.get(userId);
  if (!m) return -1;
  return highestRolePosition({ roles: g.roles, memberRoleIds: m.roleIds, ownerId: g.ownerId, userId });
}

/** Ator só pode agir sobre alguém com cargo estritamente inferior (dono é intocável). */
export function requireHierarchy(g: GuildSnapshot, actorId: string, targetId: string) {
  if (targetId === g.ownerId) throw forbidden('Não é possível fazer isso com o dono do servidor.');
  if (actorId === g.ownerId) return;
  if (rolePosition(g, actorId) <= rolePosition(g, targetId))
    throw forbidden('Esse membro tem um cargo igual ou superior ao seu.');
}

export function requireRoleBelow(g: GuildSnapshot, actorId: string, rolePos: number) {
  if (actorId === g.ownerId) return;
  if (rolePosition(g, actorId) <= rolePos) throw forbidden('Esse cargo é igual ou superior ao seu maior cargo.');
}
