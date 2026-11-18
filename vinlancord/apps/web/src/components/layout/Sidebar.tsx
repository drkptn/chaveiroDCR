/** Barra lateral do meio: canais do servidor ou conversas diretas + painéis de voz/usuário. */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import {
  Hash,
  Volume2,
  Video,
  ChevronDown,
  ChevronRight,
  Plus,
  Settings,
  UserPlus,
  Users,
  Compass,
  X,
  Calendar,
  Bell,
  BellOff,
  Copy,
  Check,
  LogOut,
  Pencil,
  Trash2,
  MicOff,
  HeadphoneOff,
  Search,
  Lock,
  Smile,
} from 'lucide-react';
import { P, has, type Channel } from '@vinlancord/shared';
import { useShallow } from 'zustand/react/shallow';
import { useStore, isUnread, isMuted, sortedGuildChannels, S, displayName, type State } from '../../store';
import { ui } from '../../store/ui';
import { useLocal } from '../../store/local';
import { useVoice } from '../../lib/voice/engine';
import { joinVoice } from '../../store/actions';
import { api } from '../../lib/api';
import { useGuildPerms, useChannelPerms } from '../../lib/perms';
import { Avatar, Badge, GuildIcon, cx, usePresenceStatus } from '../ui';
import { UserPanel } from './UserPanel';
import { VoicePanel } from './VoicePanel';

function SidebarShell({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col bg-bg-1">
      {header}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">{children}</div>
      <VoicePanel />
      <UserPanel />
    </aside>
  );
}

/* ─────────────────────────── Servidor ─────────────────────────── */

export function GuildSidebar() {
  const { guildId, channelId } = useParams();
  const guild = useStore((s) => s.guilds[guildId!]);
  const channelsSlice = useStore((s) => s.channels);
  const tree = useMemo(() => sortedGuildChannels({ channels: channelsSlice } as State, guildId!), [channelsSlice, guildId]);
  const collapsed = useLocal((s) => s.collapsedCategories);
  const setLocal = useLocal((s) => s.set);
  const perms = useGuildPerms(guildId!);
  const [menuOpen, setMenuOpen] = useState(false);
  const muted = useStore((s) => isMuted(s, guildId!));
  if (!guild) return <aside className="w-60 shrink-0 bg-bg-1" />;

  const canManage = has(perms, P.MANAGE_GUILD) || has(perms, P.MANAGE_ROLES) || has(perms, P.BAN_MEMBERS) || has(perms, P.MANAGE_EMOJIS) || has(perms, P.KICK_MEMBERS);
  const header = (
    <div className="relative">
      {guild.banner && (
        <div className="h-[110px] w-full overflow-hidden">
          <img src={guild.banner} alt="" className="size-full object-cover" />
          <div className="absolute inset-x-0 top-0 h-[110px] bg-gradient-to-b from-black/30 to-transparent" />
        </div>
      )}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className={cx(
          'flex h-12 w-full items-center gap-2 px-4 text-left font-display font-semibold text-fg transition hover:bg-bg-3',
          guild.banner ? 'absolute inset-x-0 top-0 text-white [text-shadow:0_1px_4px_rgba(0,0,0,.7)] hover:bg-black/20' : 'border-b border-line',
        )}
      >
        <span className="flex-1 truncate">{guild.name}</span>
        {menuOpen ? <X size={18} /> : <ChevronDown size={18} />}
      </button>
      {menuOpen && (
        <div className="absolute inset-x-2 top-[52px] z-30 animate-pop-in rounded-xl border border-line-strong bg-bg-1 p-1.5 shadow-[var(--vl-shadow)]" onMouseLeave={() => setMenuOpen(false)}>
          {[
            has(perms, P.CREATE_INVITE) && { label: 'Convidar pessoas', icon: <UserPlus size={16} />, accent: true, onClick: () => ui.open({ type: 'invite', guildId: guild.id }) },
            canManage && { label: 'Configurações do servidor', icon: <Settings size={16} />, onClick: () => ui.open({ type: 'serverSettings', guildId: guild.id }) },
            has(perms, P.MANAGE_CHANNELS) && { label: 'Criar canal', icon: <Plus size={16} />, onClick: () => ui.open({ type: 'createChannel', guildId: guild.id }) },
            has(perms, P.MANAGE_CHANNELS) && { label: 'Criar categoria', icon: <Plus size={16} />, onClick: () => ui.open({ type: 'createChannel', guildId: guild.id, kind: 'category' }) },
            { label: 'Eventos', icon: <Calendar size={16} />, onClick: () => ui.open({ type: 'events', guildId: guild.id }) },
            has(perms, P.MANAGE_EMOJIS) && { label: 'Emojis e figurinhas', icon: <Smile size={16} />, onClick: () => ui.open({ type: 'serverSettings', guildId: guild.id, tab: 'emojis' }) },
            { label: muted ? 'Reativar notificações' : 'Silenciar servidor', icon: muted ? <Bell size={16} /> : <BellOff size={16} />, onClick: () => void api.put(`/users/@me/notification-settings/${guild.id}`, { muted: !muted }) },
            { label: 'Editar perfil no servidor', icon: <Pencil size={16} />, onClick: () => ui.open({ type: 'serverSettings', guildId: guild.id, tab: 'myprofile' }) },
            guild.ownerId !== S().me?.id && {
              label: 'Sair do servidor',
              icon: <LogOut size={16} />,
              danger: true,
              onClick: () =>
                ui.confirm({ title: `Sair de ${guild.name}?`, body: 'Você só poderá voltar com um novo convite.', confirmLabel: 'Sair', danger: true, onConfirm: async () => void (await api.del(`/guilds/${guild.id}/members/@me`)) }),
            },
          ]
            .filter(Boolean)
            .map((it) => {
              const item = it as { label: string; icon: ReactNode; onClick: () => void; danger?: boolean; accent?: boolean };
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    setMenuOpen(false);
                    item.onClick();
                  }}
                  className={cx(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-[13px] font-medium transition',
                    item.danger ? 'text-danger hover:bg-danger hover:text-white' : item.accent ? 'text-accent hover:bg-accent hover:text-accent-fg' : 'text-fg-1 hover:bg-accent hover:text-accent-fg',
                  )}
                >
                  {item.label}
                  {item.icon}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );

  const toggleCat = (id: string) => setLocal({ collapsedCategories: { ...collapsed, [id]: !collapsed[id] } });

  return (
    <SidebarShell header={header}>
      <div className="pt-2" />
      {tree.uncategorized.map((c) => (
        <ChannelRow key={c.id} channel={c} active={c.id === channelId} />
      ))}
      {tree.categories.map(({ cat, channels }) => (
        <div key={cat.id} className="mt-3">
          <div
            className="group flex cursor-pointer items-center gap-0.5 px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-2 hover:text-fg-1"
            onClick={() => toggleCat(cat.id)}
            onContextMenu={(e) => channelMenu(e, cat)}
          >
            {collapsed[cat.id] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <span className="flex-1 truncate">{cat.name}</span>
            {has(perms, P.MANAGE_CHANNELS) && (
              <button
                className="opacity-0 transition group-hover:opacity-100 hover:text-fg"
                onClick={(e) => {
                  e.stopPropagation();
                  ui.open({ type: 'createChannel', guildId: guild.id, parentId: cat.id });
                }}
                aria-label="Criar canal"
              >
                <Plus size={15} />
              </button>
            )}
          </div>
          {channels
            .filter((c) => !collapsed[cat.id] || c.id === channelId || isUnread(S(), c.id) || Object.values(S().voiceStates).some((v) => v.channelId === c.id))
            .map((c) => (
              <ChannelRow key={c.id} channel={c} active={c.id === channelId} />
            ))}
        </div>
      ))}
      {!tree.uncategorized.length && !tree.categories.length && <div className="p-4 text-center text-xs text-fg-2">Nenhum canal por aqui ainda.</div>}
    </SidebarShell>
  );
}

function channelMenu(e: React.MouseEvent, c: Channel) {
  const s = S();
  const g = c.guildId ? s.guilds[c.guildId] : null;
  const muted = isMuted(s, c.id);
  const items = [
    ...(c.type !== 'category' && c.type !== 'voice' && c.type !== 'video'
      ? [{ label: 'Marcar como lido', icon: <Check size={15} />, onClick: () => c.lastMessageId && void api.post(`/channels/${c.id}/ack`, { messageId: c.lastMessageId }) }]
      : []),
    { label: muted ? 'Reativar notificações' : 'Silenciar canal', icon: muted ? <Bell size={15} /> : <BellOff size={15} />, onClick: () => void api.put(`/users/@me/notification-settings/${c.id}`, { muted: !muted }) },
    ...(c.type === 'text'
      ? [
          {
            label: 'Notificações',
            icon: <Bell size={15} />,
            submenu: ([null, 'all', 'mentions', 'nothing'] as const).map((lvl) => ({
              label: lvl === null ? 'Padrão do servidor' : { all: 'Todas as mensagens', mentions: 'Somente @menções', nothing: 'Nada' }[lvl],
              checked: (s.notif[c.id]?.level ?? null) === lvl,
              onClick: () => void api.put(`/users/@me/notification-settings/${c.id}`, { level: lvl }),
            })),
          },
        ]
      : []),
    { separator: true },
    ...(g ? [{ label: 'Editar canal', icon: <Settings size={15} />, onClick: () => ui.open({ type: 'channelSettings', channelId: c.id }) }] : []),
    ...(g && c.type !== 'category' ? [{ label: 'Convidar para o canal', icon: <UserPlus size={15} />, onClick: () => ui.open({ type: 'invite', guildId: g.id, channelId: c.id }) }] : []),
    { label: 'Copiar ID do canal', icon: <Copy size={15} />, onClick: () => void navigator.clipboard.writeText(c.id) },
    ...(g
      ? [
          {
            label: c.type === 'category' ? 'Excluir categoria' : 'Excluir canal',
            icon: <Trash2 size={15} />,
            danger: true,
            onClick: () =>
              ui.confirm({
                title: `Excluir ${c.type === 'category' ? 'categoria' : 'canal'} "${c.name}"?`,
                body: 'Essa ação não pode ser desfeita. As mensagens serão apagadas.',
                confirmLabel: 'Excluir',
                danger: true,
                onConfirm: async () => void (await api.del(`/channels/${c.id}`)),
              }),
          },
        ]
      : []),
  ];
  ui.menu(e, items);
}

function ChannelRow({ channel: c, active }: { channel: Channel; active: boolean }) {
  const nav = useNavigate();
  const unread = useStore((s) => isUnread(s, c.id) && !isMuted(s, c.id));
  const mentions = useStore((s) => s.readStates[c.id]?.mentions ?? 0);
  const muted = useStore((s) => isMuted(s, c.id));
  const voiceUsers = useStore(useShallow((s) => Object.values(s.voiceStates).filter((v) => v.channelId === c.id)));
  const myVoice = useVoice((s) => s.channelId);
  const perms = useChannelPerms(c.id);
  const isVoice = c.type === 'voice' || c.type === 'video';
  const priv = c.overwrites.some((o) => o.id === c.guildId && (BigInt(o.deny) & P.VIEW_CHANNEL) !== 0n);
  const Icon = c.type === 'voice' ? Volume2 : c.type === 'video' ? Video : Hash;
  const open = () => {
    if (isVoice) {
      if (myVoice !== c.id) {
        if (!has(perms, P.CONNECT)) return ui.error('Você não tem permissão para entrar nesse canal.');
        joinVoice(c.id);
      }
    }
    localStorage.setItem(`vl:last:${c.guildId}`, c.id);
    nav(`/channels/${c.guildId}/${c.id}`);
  };
  return (
    <div className="mt-px">
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        onContextMenu={(e) => channelMenu(e, c)}
        className={cx(
          'group relative flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 transition-colors',
          active ? 'bg-bg-4 text-fg' : unread ? 'text-fg hover:bg-bg-3' : 'text-fg-2 hover:bg-bg-3 hover:text-fg-1',
          muted && !active && 'opacity-50',
        )}
      >
        {unread && !active && <span className="absolute -left-2 h-2 w-1 rounded-r-full bg-fg" />}
        <span className="relative">
          <Icon size={18} className="shrink-0 opacity-70" />
          {priv && <Lock size={9} className="absolute -right-1 -top-0.5 rounded-sm bg-bg-1" />}
        </span>
        <span className={cx('flex-1 truncate text-[14.5px]', unread && 'font-semibold')}>{c.name}</span>
        {c.userLimit > 0 && isVoice && (
          <span className="rounded bg-bg-4 px-1 text-[10px] tabular-nums text-fg-2">
            {voiceUsers.length}/{c.userLimit}
          </span>
        )}
        <Badge count={mentions} />
        {!isVoice && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              ui.open({ type: 'invite', guildId: c.guildId!, channelId: c.id });
            }}
            className="hidden text-fg-2 hover:text-fg group-hover:block"
            aria-label="Convidar"
          >
            <UserPlus size={14} />
          </button>
        )}
        {has(perms, P.MANAGE_CHANNELS) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              ui.open({ type: 'channelSettings', channelId: c.id });
            }}
            className="hidden text-fg-2 hover:text-fg group-hover:block"
            aria-label="Configurações do canal"
          >
            <Settings size={14} />
          </button>
        )}
      </div>
      {isVoice && voiceUsers.length > 0 && (
        <div className="mb-1 ml-6 mt-0.5 space-y-px">
          {voiceUsers.map((v) => (
            <VoiceUserRow key={v.userId} userId={v.userId} guildId={c.guildId} />
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceUserRow({ userId, guildId }: { userId: string; guildId: string | null }) {
  const v = useStore((s) => s.voiceStates[userId]);
  const speaking = useStore((s) => userId in s.speaking);
  const meId = useStore((s) => s.me?.id);
  const localSpeaking = useVoice((s) => s.localSpeaking);
  const name = useStore(() => displayName(userId, guildId));
  if (!v) return null;
  const isSpeaking = userId === meId ? localSpeaking && !v.selfMute : speaking;
  return (
    <div
      className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-1.5 text-[13px] text-fg-2 hover:bg-bg-3 hover:text-fg-1"
      onClick={(e) => ui.profile(userId, guildId, e.currentTarget)}
      onContextMenu={(e) => window.dispatchEvent(new CustomEvent('vl:voice-user-menu', { detail: { e, userId } }))}
    >
      <Avatar userId={userId} size={22} speaking={isSpeaking && !v.selfMute && !v.serverMute} />
      <span className={cx('flex-1 truncate', isSpeaking && 'text-fg')}>{name}</span>
      {v.selfStream && <span className="rounded bg-danger px-1 text-[9px] font-bold text-white">AO VIVO</span>}
      {v.selfVideo && <Video size={13} />}
      {(v.serverMute || v.selfMute) && <MicOff size={13} className={v.serverMute ? 'text-danger' : ''} />}
      {(v.serverDeaf || v.selfDeaf) && <HeadphoneOff size={13} className={v.serverDeaf ? 'text-danger' : ''} />}
    </div>
  );
}

/* ─────────────────────────── Início (DMs) ─────────────────────────── */

export function HomeSidebar() {
  const nav = useNavigate();
  const loc = useLocation();
  const { channelId } = useParams();
  const dmIds = useStore((s) => s.privateChannelIds);
  const pending = useStore((s) => Object.values(s.relationships).filter((r) => r.type === 'incoming').length);
  const header = (
    <div className="flex h-12 shrink-0 items-center border-b border-line px-2.5">
      <button onClick={() => ui.open({ type: 'quickSwitcher' })} className="flex h-8 w-full items-center gap-2 rounded-md bg-bg-0 px-2.5 text-left text-[13px] text-fg-2 transition hover:text-fg-1">
        <Search size={14} className="shrink-0" /> <span className="truncate">Encontre ou comece uma conversa</span>
      </button>
    </div>
  );
  return (
    <SidebarShell header={header}>
      <div className="space-y-0.5 pt-2">
        {[
          { to: '/channels/@me', label: 'Amigos', icon: <Users size={20} />, badge: pending },
          { to: '/discover', label: 'Explorar servidores', icon: <Compass size={20} /> },
        ].map((l) => (
          <button
            key={l.to}
            onClick={() => nav(l.to)}
            className={cx(
              'flex h-10 w-full items-center gap-3 rounded-md px-2.5 text-[14.5px] font-medium transition',
              loc.pathname === l.to ? 'bg-bg-4 text-fg' : 'text-fg-2 hover:bg-bg-3 hover:text-fg-1',
            )}
          >
            {l.icon}
            <span className="flex-1 text-left">{l.label}</span>
            {!!l.badge && <Badge count={l.badge} />}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-2">
        Mensagens diretas
        <button onClick={() => ui.open({ type: 'newGroup' })} className="hover:text-fg" aria-label="Criar grupo">
          <Plus size={15} />
        </button>
      </div>
      {dmIds.map((id) => (
        <DMRow key={id} id={id} active={id === channelId} />
      ))}
      {!dmIds.length && <p className="px-3 py-4 text-center text-xs text-fg-2">Suas conversas aparecem aqui. Que tal chamar alguém? 👋</p>}
    </SidebarShell>
  );
}

function DMRow({ id, active }: { id: string; active: boolean }) {
  const nav = useNavigate();
  const ch = useStore((s) => s.channels[id]);
  const meId = useStore((s) => s.me?.id);
  const other = ch?.type === 'dm' ? ch.recipients?.find((r) => r !== meId) : undefined;
  const user = useStore((s) => (other ? s.users[other] : undefined));
  const unread = useStore((s) => isUnread(s, id));
  const mentions = useStore((s) => s.readStates[id]?.mentions ?? 0);
  const status = usePresenceStatus(other);
  const activity = useStore((s) => (other ? s.presences[other]?.activities[0] : undefined));
  const custom = useStore((s) => (other ? s.presences[other]?.customStatus : undefined));
  const inCall = useStore((s) => !!s.calls[id]);
  if (!ch) return null;
  const names = ch.type === 'group_dm' ? ch.name || (ch.recipients ?? []).filter((r) => r !== meId).map((r) => S().users[r]?.displayName ?? '…').join(', ') : user?.displayName ?? '…';
  return (
    <div
      onClick={() => nav(`/channels/@me/${id}`)}
      onContextMenu={(e) =>
        ui.menu(e, [
          ...(other ? [{ label: 'Perfil', icon: <Users size={15} />, onClick: () => ui.open({ type: 'profile', userId: other }) }] : []),
          { label: 'Marcar como lido', icon: <Check size={15} />, onClick: () => ch.lastMessageId && void api.post(`/channels/${id}/ack`, { messageId: ch.lastMessageId }) },
          { label: 'Copiar ID', icon: <Copy size={15} />, onClick: () => void navigator.clipboard.writeText(id) },
          { separator: true },
          { label: ch.type === 'group_dm' ? 'Sair do grupo' : 'Fechar conversa', icon: <X size={15} />, danger: ch.type === 'group_dm', onClick: () => void api.del(`/channels/${id}`) },
        ])
      }
      className={cx(
        'group mt-px flex h-11 cursor-pointer items-center gap-3 rounded-md px-2 transition-colors',
        active ? 'bg-bg-4 text-fg' : unread ? 'text-fg hover:bg-bg-3' : 'text-fg-2 hover:bg-bg-3 hover:text-fg-1',
      )}
    >
      {other ? (
        <Avatar userId={other} size={32} status={status} ring={active ? 'var(--vl-bg-4)' : 'var(--vl-bg-1)'} />
      ) : (
        <span className="grid size-8 place-items-center rounded-full gradient-accent text-white">
          {ch.icon ? <img src={ch.icon} className="size-8 rounded-full object-cover" alt="" /> : <Users size={16} />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className={cx('truncate text-[14.5px]', unread && 'font-semibold')}>{names}</div>
        {ch.type === 'group_dm' ? (
          <div className="truncate text-xs text-fg-2">{ch.recipients?.length} membros</div>
        ) : activity ? (
          <div className="truncate text-xs text-fg-2">Jogando <b>{activity.name}</b></div>
        ) : custom?.text || custom?.emoji ? (
          <div className="truncate text-xs text-fg-2">{custom.emoji} {custom.text}</div>
        ) : null}
      </div>
      {inCall && <Volume2 size={15} className="text-success" />}
      <Badge count={mentions} />
      <button
        onClick={(e) => {
          e.stopPropagation();
          void api.del(`/channels/${id}`);
        }}
        className="hidden text-fg-2 hover:text-fg group-hover:block"
        aria-label="Fechar conversa"
      >
        <X size={15} />
      </button>
    </div>
  );
}

