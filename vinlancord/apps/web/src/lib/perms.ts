/** Permissões no cliente (apenas para mostrar/esconder controles — o servidor sempre valida). */
import { ALL_PERMISSIONS, DM_PERMISSIONS, computeBasePermissions, computeChannelPermissions, type Role } from '@vinlancord/shared';
import { useStore, type State } from '../store';

export function guildPerms(s: State, guildId: string | null | undefined): bigint {
  if (!guildId) return 0n;
  const g = s.guilds[guildId];
  const me = s.me;
  const m = s.myMembers[guildId];
  if (!g || !me || !m) return 0n;
  if (g.ownerId === me.id) return ALL_PERMISSIONS;
  return computeBasePermissions({ guildId, ownerId: g.ownerId, userId: me.id, roles: Object.values(s.roles[guildId] ?? {}) as Role[], memberRoleIds: m.roles, timeoutUntil: m.timeoutUntil });
}

export function channelPerms(s: State, channelId: string | null | undefined): bigint {
  if (!channelId) return 0n;
  const c = s.channels[channelId];
  const me = s.me;
  if (!c || !me) return 0n;
  if (!c.guildId) return DM_PERMISSIONS;
  const g = s.guilds[c.guildId];
  const m = s.myMembers[c.guildId];
  if (!g || !m) return 0n;
  return computeChannelPermissions(
    { guildId: c.guildId, ownerId: g.ownerId, userId: me.id, roles: Object.values(s.roles[c.guildId] ?? {}) as Role[], memberRoleIds: m.roles, timeoutUntil: m.timeoutUntil },
    c.overwrites,
    { voice: c.type === 'voice' || c.type === 'video' },
  );
}

export const useGuildPerms = (guildId: string | null | undefined) => useStore((s) => guildPerms(s, guildId));
export const useChannelPerms = (channelId: string | null | undefined) => useStore((s) => channelPerms(s, channelId));
