/** Barra lateral esquerda: Início/DMs, servidores, adicionar e explorar. */
import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Compass, Plus, Bell, BellOff, Check, Copy, LogOut, Settings, UserPlus, Calendar, Volume2 } from 'lucide-react';
import { P, has, computeBasePermissions } from '@vinlancord/shared';
import { useShallow } from 'zustand/react/shallow';
import { useStore, isUnread, isMuted, S, type State } from '../../store';
import { ui } from '../../store/ui';
import { api } from '../../lib/api';
import { updateSettings } from '../../store/actions';
import { Avatar, Badge, GuildIcon, LogoMark, Tooltip, cx } from '../ui';

function Pill({ state }: { state: 'none' | 'unread' | 'hover' | 'active' }) {
  const h = { none: 0, unread: 8, hover: 20, active: 40 }[state];
  return (
    <span
      className={cx(
        'absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full transition-all [transition-duration:calc(.3s*var(--vl-dur-mult))] [transition-timing-function:var(--vl-ease-back)]',
        state === 'active' ? 'bg-accent shadow-[0_0_12px_var(--vl-accent)]' : 'bg-fg',
      )}
      style={{ height: h, opacity: h ? 1 : 0 }}
    />
  );
}

function RailItem({ active, unread, mentions, label, onClick, onContextMenu, children, className }: {
  active: boolean;
  unread?: boolean;
  mentions?: number;
  label: React.ReactNode;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div className="relative flex w-full justify-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Pill state={active ? 'active' : hover ? 'hover' : unread ? 'unread' : 'none'} />
      <span className="vl-shape-wrap transition-[filter]" data-active={active}>
        <Tooltip label={label} side="right" delay={80}>
          <button
            aria-label={typeof label === 'string' ? label : undefined}
            onClick={onClick}
            onContextMenu={onContextMenu}
            data-active={active}
            className={cx('vl-shape focus-ring relative grid size-12 place-items-center overflow-hidden', className)}
          >
            {children}
          </button>
        </Tooltip>
      </span>
      {!!mentions && (
        <span className="pointer-events-none absolute -bottom-0.5 right-1.5">
          <Badge count={mentions} className="ring-4 ring-bg-0" />
        </span>
      )}
    </div>
  );
}

export function ServerRail() {
  const nav = useNavigate();
  const loc = useLocation();
  const guildOrder = useStore((s) => s.guildOrder);
  const guilds = useStore((s) => s.guilds);
  // seleção estreita: evita re-renderizar a barra a cada evento de digitação/presença
  const state = useStore(
    useShallow((s) => ({
      channels: s.channels,
      readStates: s.readStates,
      notif: s.notif,
      privateChannelIds: s.privateChannelIds,
      users: s.users,
      me: s.me,
    })),
  ) as unknown as State;
  const [drag, setDrag] = useState<string | null>(null);
  const activeGuild = /^\/channels\/(\d+)/.exec(loc.pathname)?.[1];
  const home = loc.pathname.startsWith('/channels/@me');

  // DMs não lidas aparecem como atalhos acima dos servidores
  const unreadDMs = useMemo(
    () => state.privateChannelIds.filter((id) => isUnread(state, id) && !isMuted(state, id)).slice(0, 5),
    [state],
  );

  const guildUnread = (gid: string) => {
    if (isMuted(state, gid)) return { unread: false, mentions: 0 };
    let unread = false;
    let mentions = 0;
    for (const c of Object.values(state.channels)) {
      if (c.guildId !== gid || c.type !== 'text') continue;
      mentions += state.readStates[c.id]?.mentions ?? 0;
      if (!unread && !isMuted(state, c.id) && isUnread(state, c.id)) unread = true;
    }
    return { unread, mentions };
  };

  const dmMentions = state.privateChannelIds.reduce((n, id) => n + (state.readStates[id]?.mentions ?? 0), 0);

  const guildMenu = (e: React.MouseEvent, gid: string) => {
    const s = S();
    const g = s.guilds[gid]!;
    const me = s.me!;
    const member = s.myMembers[gid];
    const perms = member ? computeBasePermissions({ guildId: gid, ownerId: g.ownerId, userId: me.id, roles: Object.values(s.roles[gid] ?? {}), memberRoleIds: member.roles }) : 0n;
    const muted = isMuted(s, gid);
    ui.menu(e, [
      { label: 'Marcar como lido', icon: <Check size={15} />, onClick: () => void api.post(`/guilds/${gid}/ack`) },
      { separator: true },
      ...(has(perms, P.CREATE_INVITE) ? [{ label: 'Convidar pessoas', icon: <UserPlus size={15} />, onClick: () => ui.open({ type: 'invite', guildId: gid }) }] : []),
      { label: 'Eventos', icon: <Calendar size={15} />, onClick: () => ui.open({ type: 'events', guildId: gid }) },
      {
        label: muted ? 'Reativar notificações' : 'Silenciar servidor',
        icon: muted ? <Bell size={15} /> : <BellOff size={15} />,
        onClick: () => void api.put(`/users/@me/notification-settings/${gid}`, { muted: !muted, mutedUntil: null }),
      },
      {
        label: 'Notificações',
        icon: <Volume2 size={15} />,
        submenu: (['all', 'mentions', 'nothing'] as const).map((lvl) => ({
          label: { all: 'Todas as mensagens', mentions: 'Somente @menções', nothing: 'Nada' }[lvl],
          checked: (s.notif[gid]?.level ?? 'all') === lvl,
          onClick: () => void api.put(`/users/@me/notification-settings/${gid}`, { level: lvl }),
        })),
      },
      ...(has(perms, P.MANAGE_GUILD) || has(perms, P.MANAGE_ROLES) || has(perms, P.MANAGE_EMOJIS) || has(perms, P.BAN_MEMBERS)
        ? [{ label: 'Configurações do servidor', icon: <Settings size={15} />, onClick: () => ui.open({ type: 'serverSettings', guildId: gid }) }]
        : []),
      { separator: true },
      { label: 'Copiar ID do servidor', icon: <Copy size={15} />, onClick: () => void navigator.clipboard.writeText(gid) },
      ...(g.ownerId !== me.id
        ? [
            {
              label: 'Sair do servidor',
              icon: <LogOut size={15} />,
              danger: true,
              onClick: () =>
                ui.confirm({
                  title: `Sair de ${g.name}?`,
                  body: 'Você só poderá voltar com um novo convite.',
                  confirmLabel: 'Sair do servidor',
                  danger: true,
                  onConfirm: async () => {
                    await api.del(`/guilds/${gid}/members/@me`);
                  },
                }),
            },
          ]
        : []),
    ]);
  };

  const onDrop = (targetId: string) => {
    if (!drag || drag === targetId) return;
    const order = guildOrder.filter((x) => x !== drag);
    order.splice(order.indexOf(targetId), 0, drag);
    useStore.setState({ guildOrder: order });
    void updateSettings({ guildFolders: order });
    setDrag(null);
  };

  return (
    <nav className="vl-rail scroll-none flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto py-3" aria-label="Servidores">
      <RailItem active={home} label="Mensagens diretas" mentions={dmMentions} onClick={() => nav('/channels/@me')} className={home ? 'bg-accent/15' : 'bg-bg-3/80 hover:bg-accent/20'}>
        <LogoMark size={home ? 44 : 34} className={cx('transition-all', home && 'vl-glow-pulse')} />
      </RailItem>

      {unreadDMs.map((id) => {
        const ch = state.channels[id];
        if (!ch) return null;
        const other = ch.recipients?.find((r) => r !== state.me?.id);
        return (
          <RailItem key={id} active={false} unread mentions={state.readStates[id]?.mentions} label={ch.type === 'group_dm' ? ch.name || 'Grupo' : state.users[other ?? '']?.displayName} onClick={() => nav(`/channels/@me/${id}`)}>
            {other ? <Avatar userId={other} size={48} /> : null}
          </RailItem>
        );
      })}

      <div className="relative mx-auto my-1 flex w-10 items-center justify-center">
        <span className="h-px w-full bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
        <span className="vl-ornament absolute size-1.5 rotate-45 bg-accent shadow-[0_0_8px_var(--vl-accent)]" />
      </div>

      {guildOrder.map((gid) => {
        const g = guilds[gid];
        if (!g) return null;
        const { unread, mentions } = guildUnread(gid);
        return (
          <div
            key={gid}
            draggable
            onDragStart={() => setDrag(gid)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(gid)}
            className={cx('w-full animate-pop-in', drag === gid && 'opacity-40')}
          >
            <RailItem
              active={activeGuild === gid}
              unread={unread}
              mentions={mentions}
              label={g.name}
              onClick={() => {
                const last = localStorage.getItem(`vl:last:${gid}`);
                nav(`/channels/${gid}${last && S().channels[last] ? '/' + last : ''}`);
              }}
              onContextMenu={(e) => guildMenu(e, gid)}
              className="bg-bg-3/80"
            >
              <GuildIcon guild={g} size={48} />
            </RailItem>
          </div>
        );
      })}

      <RailItem active={false} label="Criar ou entrar em um servidor" onClick={() => ui.open({ type: 'createServer' })} className="group bg-bg-3/80 text-accent hover:bg-accent hover:text-accent-fg">
        <Plus size={24} className="transition-transform duration-300 group-hover:rotate-90" />
      </RailItem>
      <RailItem active={loc.pathname === '/discover'} label="Explorar servidores públicos" onClick={() => nav('/discover')} className={loc.pathname === '/discover' ? 'bg-accent text-accent-fg' : 'bg-bg-3/80 text-accent hover:bg-accent hover:text-accent-fg'}>
        <Compass size={24} />
      </RailItem>
    </nav>
  );
}
