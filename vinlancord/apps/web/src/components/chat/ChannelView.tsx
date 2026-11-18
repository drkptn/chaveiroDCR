/** Área principal de um canal: cabeçalho, chat (ou chamada) e painel direito. */
import { useEffect, useState } from 'react';
import { Hash, Users, Pin, Search, Phone, Video, AtSign, Volume2, UserPlus, X, Bell, BellOff, HelpCircle } from 'lucide-react';
import { P, has, type Channel } from '@vinlancord/shared';
import { useStore, displayName, isMuted } from '../../store';
import { useUI, ui } from '../../store/ui';
import { useLocal } from '../../store/local';
import { ackChannel, loadMembers } from '../../store/actions';
import { voice, useVoice } from '../../lib/voice/engine';
import { useChannelPerms } from '../../lib/perms';
import { api } from '../../lib/api';
import { Avatar, IconButton, Tooltip, cx, usePresenceStatus } from '../ui';
import { Markdown } from '../../lib/markdown';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { MemberList } from '../members/MemberList';
import { PinsPanel, SearchPanel } from './Panels';
import { VoiceView, CallStrip } from '../voice/VoiceView';

export function ChannelView({ channel }: { channel: Channel }) {
  const rightPanel = useUI((s) => s.rightPanel);
  const memberListOpen = useLocal((s) => s.memberListOpen);
  const focused = useUI((s) => s.focused);
  const myVoice = useVoice((s) => s.channelId);
  const isVoice = channel.type === 'voice' || channel.type === 'video';

  useEffect(() => {
    useUI.setState({ currentChannelId: channel.id, currentGuildId: channel.guildId });
    if (channel.guildId) void loadMembers(channel.guildId);
    return () => useUI.setState({ currentChannelId: null });
  }, [channel.id, channel.guildId]);

  useEffect(() => {
    if (focused && !isVoice) void ackChannel(channel.id);
  }, [focused, channel.id, channel.lastMessageId, isVoice]);

  if (isVoice) {
    return (
      <main className="flex min-w-0 flex-1 flex-col bg-bg-2">
        <VoiceView channel={channel} joined={myVoice === channel.id} />
      </main>
    );
  }

  const panel = rightPanel === 'members' ? (channel.guildId && memberListOpen ? 'members' : channel.type === 'group_dm' && memberListOpen ? 'members' : null) : rightPanel;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-bg-2">
      <ChannelHeader channel={channel} />
      {!channel.guildId && <CallStrip channel={channel} />}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageList channel={channel} />
          <Composer channel={channel} />
        </div>
        {panel === 'members' && <MemberList channel={channel} />}
        {panel === 'pins' && <PinsPanel channel={channel} />}
        {panel === 'search' && <SearchPanel channel={channel} />}
      </div>
    </main>
  );
}

function ChannelHeader({ channel }: { channel: Channel }) {
  const meId = useStore((s) => s.me?.id);
  const other = channel.type === 'dm' ? channel.recipients?.find((r) => r !== meId) : undefined;
  const otherUser = useStore((s) => (other ? s.users[other] : undefined));
  const status = usePresenceStatus(other);
  const rightPanel = useUI((s) => s.rightPanel);
  const memberListOpen = useLocal((s) => s.memberListOpen);
  const setLocal = useLocal((s) => s.set);
  const perms = useChannelPerms(channel.id);
  const muted = useStore((s) => isMuted(s, channel.id));
  const myVoice = useVoice((s) => s.channelId);
  const [q, setQ] = useState('');
  const togglePanel = (p: 'pins' | 'search') => useUI.setState({ rightPanel: rightPanel === p ? 'members' : p });

  const startCall = async (video: boolean) => {
    try {
      if (myVoice !== channel.id) await voice.join(channel.id);
      if (video) await voice.setCamera(true);
    } catch (e) {
      ui.error(e, 'Não foi possível iniciar a chamada');
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4 shadow-[0_1px_0_rgba(0,0,0,0.15)]">
      {channel.type === 'dm' && other ? (
        <button className="flex min-w-0 items-center gap-2" onClick={(e) => ui.profile(other, null, e.currentTarget)}>
          <Avatar userId={other} size={26} status={status} ring="var(--vl-bg-2)" />
          <span className="truncate font-display font-semibold text-fg">{otherUser?.displayName}</span>
        </button>
      ) : channel.type === 'group_dm' ? (
        <span className="flex items-center gap-2 truncate font-display font-semibold text-fg">
          <Users size={20} className="text-fg-2" />
          {channel.name || (channel.recipients ?? []).filter((r) => r !== meId).map((r) => displayName(r, null)).join(', ')}
        </span>
      ) : (
        <>
          {channel.type === 'text' ? <Hash size={22} className="shrink-0 text-fg-2" /> : <Volume2 size={22} className="shrink-0 text-fg-2" />}
          <span className="shrink-0 font-display font-semibold text-fg">{channel.name}</span>
        </>
      )}
      {channel.topic && (
        <>
          <span className="mx-1 h-6 w-px bg-line-strong" />
          <Tooltip label={<div className="max-w-sm whitespace-pre-wrap">{channel.topic}</div>} side="bottom">
            <div className="min-w-0 flex-1 truncate text-[13px] text-fg-2">
              <Markdown content={channel.topic.split('\n')[0]!} className="truncate [&_p]:truncate" />
            </div>
          </Tooltip>
        </>
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        {!channel.guildId && (
          <>
            <IconButton label={myVoice === channel.id ? 'Você está na chamada' : 'Iniciar chamada de voz'} onClick={() => void startCall(false)} tooltipSide="bottom">
              <Phone size={19} />
            </IconButton>
            <IconButton label="Iniciar chamada de vídeo" onClick={() => void startCall(true)} tooltipSide="bottom">
              <Video size={20} />
            </IconButton>
          </>
        )}
        {channel.guildId && (
          <IconButton
            label={muted ? 'Reativar notificações do canal' : 'Silenciar canal'}
            onClick={() => void api.put(`/users/@me/notification-settings/${channel.id}`, { muted: !muted })}
            tooltipSide="bottom"
            className={muted ? 'text-danger' : ''}
          >
            {muted ? <BellOff size={19} /> : <Bell size={19} />}
          </IconButton>
        )}
        <IconButton label="Mensagens fixadas" active={rightPanel === 'pins'} onClick={() => togglePanel('pins')} tooltipSide="bottom">
          <Pin size={19} />
        </IconButton>
        {channel.type === 'group_dm' && (
          <IconButton label="Adicionar amigos ao grupo" onClick={() => ui.open({ type: 'newGroup' })} tooltipSide="bottom">
            <UserPlus size={19} />
          </IconButton>
        )}
        {(channel.guildId || channel.type === 'group_dm') && (
          <IconButton
            label={memberListOpen && rightPanel === 'members' ? 'Ocultar membros' : 'Mostrar membros'}
            active={memberListOpen && rightPanel === 'members'}
            onClick={() => {
              if (rightPanel !== 'members') useUI.setState({ rightPanel: 'members' });
              else setLocal({ memberListOpen: !memberListOpen });
            }}
            tooltipSide="bottom"
          >
            <Users size={19} />
          </IconButton>
        )}
        {channel.guildId && has(perms, P.CREATE_INVITE) && (
          <IconButton label="Convidar pessoas" onClick={() => ui.open({ type: 'invite', guildId: channel.guildId!, channelId: channel.id })} tooltipSide="bottom">
            <UserPlus size={19} />
          </IconButton>
        )}
        <form
          className="relative ml-1"
          onSubmit={(e) => {
            e.preventDefault();
            useUI.setState({ rightPanel: 'search', searchQuery: { guildId: channel.guildId, channelId: channel.guildId ? null : channel.id, q, filters: {} } });
          }}
        >
          <input
            id="vl-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar"
            className={cx('h-7 rounded-md bg-bg-0 pl-2 pr-7 text-[13px] text-fg outline-none transition-all placeholder:text-fg-2 focus:w-56', q ? 'w-56' : 'w-36')}
          />
          {q ? (
            <button type="button" className="absolute right-1.5 top-1.5 text-fg-2 hover:text-fg" onClick={() => (setQ(''), useUI.setState({ rightPanel: 'members' }))}>
              <X size={14} />
            </button>
          ) : (
            <Search size={14} className="pointer-events-none absolute right-2 top-[7px] text-fg-2" />
          )}
        </form>
        <IconButton label="Menções recentes" onClick={() => useUI.setState({ rightPanel: 'search', searchQuery: { guildId: null, channelId: null, q: '', filters: { inbox: '1' } } })} tooltipSide="bottom">
          <AtSign size={19} />
        </IconButton>
        <IconButton label="Ajuda: atalhos e Markdown" onClick={() => ui.open({ type: 'userSettings', tab: 'keybinds' })} tooltipSide="bottom">
          <HelpCircle size={19} />
        </IconButton>
      </div>
    </header>
  );
}
