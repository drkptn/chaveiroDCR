import { computeChannelPermissions, type Role } from '@vinlancord/shared';
import type { State } from '../../store';

/** Permissões de QUALQUER membro em um canal (para filtrar a lista de membros). */
export function channelPermsFromState(s: State, channelId: string, userId: string): bigint {
  const c = s.channels[channelId];
  if (!c?.guildId) return 1n;
  const g = s.guilds[c.guildId];
  const m = s.members[c.guildId]?.[userId];
  if (!g || !m) return 0n;
  return computeChannelPermissions(
    { guildId: c.guildId, ownerId: g.ownerId, userId, roles: Object.values(s.roles[c.guildId] ?? {}) as Role[], memberRoleIds: m.roles },
    c.overwrites,
  );
}
