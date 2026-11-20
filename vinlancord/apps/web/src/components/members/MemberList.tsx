/** Lista de membros agrupada por cargos destacados e status (online/offline). */
import { memo, useMemo } from 'react';
import { Crown, Gamepad2 } from 'lucide-react';
import type { Channel } from '@vinlancord/shared';
import { useShallow } from 'zustand/react/shallow';
import { useStore, displayName, memberColor, S } from '../../store';
import { ui } from '../../store/ui';
import { channelPermsFromState } from './permsHelper';
import { Avatar, usePresenceStatus, cx } from '../ui';
import { userMenu } from '../profile/userMenu';
import { UserBadges } from '../UserBadges';

export function MemberList({ channel }: { channel: Channel }) {
  const guildId = channel.guildId;
  const memberIds = useStore(useShallow((s) => (guildId ? Object.keys(s.members[guildId] ?? {}) : channel.recipients ?? [])));
  const presences = useStore((s) => s.presences);
  const meId = useStore((s) => s.me?.id);
  const meStatus = useStore((s) => s.me?.status);
  const roles = useStore((s) => (guildId ? s.roles[guildId] : undefined));
  const members = useStore((s) => (guildId ? s.members[guildId] : undefined));
  const ownerId = useStore((s) => (guildId ? s.guilds[guildId]?.ownerId : channel.ownerId));

  const groups = useMemo(() => {
    const visible = guildId ? memberIds.filter((id) => channelPermsFromState(S(), channel.id, id) !== 0n) : memberIds;
    const hoisted = Object.values(roles ?? {})
      .filter((r) => r.hoist && r.id !== guildId)
      .sort((a, b) => b.position - a.position);
    const buckets = new Map<string, { title: string; ids: string[] }>();
    for (const r of hoisted) buckets.set(r.id, { title: r.name, ids: [] });
    const online: string[] = [];
    const offline: string[] = [];
    const statusOf = (id: string) => (id === meId ? (meStatus === 'invisible' ? 'offline' : meStatus) : presences[id]?.status ?? 'offline');
    for (const id of visible) {
      if (statusOf(id) === 'offline') {
        offline.push(id);
        continue;
      }
      const m = members?.[id];
      const top = m ? hoisted.find((r) => m.roles.includes(r.id)) : undefined;
      if (top) buckets.get(top.id)!.ids.push(id);
      else online.push(id);
    }
    const byName = (a: string, b: string) => displayName(a, guildId).localeCompare(displayName(b, guildId), 'pt-BR');
    const out = [...buckets.values()].filter((b) => b.ids.length).map((b) => ({ ...b, ids: b.ids.sort(byName) }));
    if (online.length) out.push({ title: 'Disponível', ids: online.sort(byName) });
    if (offline.length) out.push({ title: 'Offline', ids: offline.sort(byName).slice(0, 200) });
    return out;
  }, [memberIds, presences, roles, members, guildId, channel.id, meId, meStatus]);

  return (
    <aside className="vl-subpanel scroll-thin w-60 shrink-0 overflow-y-auto border-l border-line px-2 pb-4 animate-slide-in-right">
      {groups.map((g) => (
        <div key={g.title}>
          <h3 className="px-2 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-2">
            {g.title} — {g.ids.length}
          </h3>
          {g.ids.map((id) => (
            <MemberRow key={id} userId={id} guildId={guildId} owner={id === ownerId} />
          ))}
        </div>
      ))}
    </aside>
  );
}

const MemberRow = memo(function MemberRow({ userId, guildId, owner }: { userId: string; guildId: string | null; owner: boolean }) {
  const status = usePresenceStatus(userId);
  const name = useStore(() => displayName(userId, guildId));
  const color = useStore((s) => memberColor(s, guildId, userId));
  const presence = useStore((s) => s.presences[userId]);
  const activity = presence?.activities[0];
  const custom = presence?.customStatus;
  const offline = status === 'offline';
  return (
    <div
      onClick={(e) => ui.profile(userId, guildId, e.currentTarget)}
      onContextMenu={(e) => userMenu(e, userId, guildId)}
      className={cx('flex h-[42px] cursor-pointer items-center gap-3 rounded-md px-2 transition hover:bg-bg-3', offline && 'opacity-40 hover:opacity-100')}
    >
      <Avatar userId={userId} size={32} status={status} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1">
          <span className="truncate text-[14.5px] font-medium" style={{ color: color ?? 'var(--vl-text-1)' }}>
            {name}
          </span>
          {owner && <Crown size={13} className="shrink-0 text-warning" />}
          <UserBadges userId={userId} />
        </div>
        {!offline && (activity || custom?.text || custom?.emoji) && (
          <div className="flex items-center gap-1 truncate text-[11.5px] text-fg-2">
            {activity ? (
              <>
                <Gamepad2 size={12} className="shrink-0" /> Jogando <b className="truncate font-semibold">{activity.name}</b>
              </>
            ) : (
              <span className="truncate">{custom?.emoji} {custom?.text}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
