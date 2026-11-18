/** Painéis laterais: mensagens fixadas e busca (com filtros) / caixa de menções. */
import { useEffect, useState } from 'react';
import { Pin, Search, X, AtSign } from 'lucide-react';
import type { Channel, Message } from '@vinlancord/shared';
import { api } from '../../lib/api';
import { useShallow } from 'zustand/react/shallow';
import { useStore, displayName } from '../../store';
import { useUI } from '../../store/ui';
import { jumpToMessage } from '../../store/actions';
import { nav } from '../../lib/nav';
import { formatMessageDate } from '../../lib/format';
import { Markdown } from '../../lib/markdown';
import { Avatar, EmptyState, Select, Spinner } from '../ui';

function PanelShell({ title, icon, children, onClose }: { title: string; icon: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return (
    <aside className="vl-subpanel flex w-[380px] shrink-0 flex-col border-l border-line animate-slide-in-right">
      <div className="vl-header flex h-12 shrink-0 items-center gap-2 px-4 font-heading text-[17px] text-fg">
        {icon}
        <span className="flex-1">{title}</span>
        <button onClick={onClose} className="text-fg-2 hover:text-fg" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </aside>
  );
}

function ResultCard({ m, showChannel }: { m: Message; showChannel?: boolean }) {
  const ch = useStore((s) => s.channels[m.channelId]);
  const guild = useStore((s) => (ch?.guildId ? s.guilds[ch.guildId] : undefined));
  const open = () => {
    if (ch?.guildId) nav(`/channels/${ch.guildId}/${ch.id}`);
    else nav(`/channels/@me/${m.channelId}`);
    setTimeout(() => void jumpToMessage(m.channelId, m.id), 50);
  };
  return (
    <button onClick={open} className="mb-2 block w-full rounded-xl border border-line bg-bg-2 p-3 text-left transition hover:border-line-strong hover:bg-bg-3">
      {showChannel && ch && (
        <div className="mb-1.5 truncate text-[11px] font-semibold uppercase tracking-wide text-fg-2">
          {ch.guildId ? `#${ch.name} • ${guild?.name ?? ''}` : 'Mensagem direta'}
        </div>
      )}
      <div className="flex gap-3">
        <Avatar userId={m.author.id} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-fg">{displayName(m.author.id, m.guildId)}</span>
            <span className="text-[11px] text-fg-2">{formatMessageDate(m.createdAt)}</span>
          </div>
          <div className="line-clamp-4 text-sm text-fg-1">
            {m.content ? <Markdown content={m.content} /> : m.attachments.length ? `📎 ${m.attachments.map((a) => a.filename).join(', ')}` : m.sticker ? `Figurinha: ${m.sticker.name}` : ''}
          </div>
        </div>
      </div>
    </button>
  );
}

export function PinsPanel({ channel }: { channel: Channel }) {
  const [pins, setPins] = useState<Message[] | null>(null);
  const version = useStore((s) => s.messages[channel.id]?.items.filter((m) => m.pinned).length ?? 0);
  useEffect(() => {
    setPins(null);
    void api.get<Message[]>(`/channels/${channel.id}/pins`).then(setPins).catch(() => setPins([]));
  }, [channel.id, version]);
  return (
    <PanelShell title="Mensagens fixadas" icon={<Pin size={18} />} onClose={() => useUI.setState({ rightPanel: 'members' })}>
      {!pins ? (
        <div className="grid h-40 place-items-center"><Spinner /></div>
      ) : !pins.length ? (
        <EmptyState icon={<Pin size={28} />} title="Nada fixado ainda" body="Fixe mensagens importantes para que todos encontrem fácil." />
      ) : (
        pins.map((m) => <ResultCard key={m.id} m={m} />)
      )}
    </PanelShell>
  );
}

export function SearchPanel({ channel }: { channel: Channel }) {
  const sq = useUI((s) => s.searchQuery);
  const [filters, setFilters] = useState<{ has: string; author: string; scope: string }>({ has: '', author: '', scope: channel.guildId ? 'guild' : 'channel' });
  const [res, setRes] = useState<{ total: number; messages: Message[] } | null>(null);
  const [offset, setOffset] = useState(0);
  const members = useStore(useShallow((s) => (channel.guildId ? Object.keys(s.members[channel.guildId] ?? {}) : channel.recipients ?? [])));
  const inbox = sq?.filters.inbox === '1';

  useEffect(() => {
    setRes(null);
    if (inbox) {
      void api.get<Message[]>('/users/@me/mentions?limit=50').then((list) => setRes({ total: list.length, messages: list })).catch(() => setRes({ total: 0, messages: [] }));
      return;
    }
    const p = new URLSearchParams();
    if (sq?.q) p.set('q', sq.q);
    if (filters.scope === 'channel') p.set('channelId', channel.id);
    else if (channel.guildId) p.set('guildId', channel.guildId);
    if (filters.has) p.set('has', filters.has);
    if (filters.author) p.set('authorId', filters.author);
    if (offset) p.set('offset', String(offset));
    void api
      .get<{ total: number; messages: Message[] }>(`/search/messages?${p}`)
      .then(setRes)
      .catch(() => setRes({ total: 0, messages: [] }));
  }, [sq, filters, offset, channel.id, channel.guildId, inbox]);

  return (
    <PanelShell
      title={inbox ? 'Menções recentes' : res ? `${res.total} resultado${res.total === 1 ? '' : 's'}` : 'Buscando…'}
      icon={inbox ? <AtSign size={18} /> : <Search size={18} />}
      onClose={() => useUI.setState({ rightPanel: 'members', searchQuery: null })}
    >
      {!inbox && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Select
            value={filters.scope}
            onChange={(v) => (setOffset(0), setFilters({ ...filters, scope: v }))}
            options={channel.guildId ? [{ value: 'guild', label: 'Servidor' }, { value: 'channel', label: 'Este canal' }] : [{ value: 'channel', label: 'Esta conversa' }]}
            className="h-8 text-xs"
          />
          <Select
            value={filters.has}
            onChange={(v) => (setOffset(0), setFilters({ ...filters, has: v }))}
            options={[
              { value: '', label: 'Tudo' },
              { value: 'image', label: 'Imagens' },
              { value: 'video', label: 'Vídeos' },
              { value: 'file', label: 'Arquivos' },
              { value: 'link', label: 'Links' },
              { value: 'sticker', label: 'Figurinhas' },
            ]}
            className="h-8 text-xs"
          />
          <Select
            value={filters.author}
            onChange={(v) => (setOffset(0), setFilters({ ...filters, author: v }))}
            options={[{ value: '', label: 'De qualquer um' }, ...members.slice(0, 200).map((id) => ({ value: id, label: displayName(id, channel.guildId) }))]}
            className="h-8 text-xs"
          />
        </div>
      )}
      {!res ? (
        <div className="grid h-40 place-items-center"><Spinner /></div>
      ) : !res.messages.length ? (
        <EmptyState icon={<Search size={28} />} title={inbox ? 'Nenhuma menção' : 'Nada encontrado'} body={inbox ? 'Quando alguém te mencionar, aparece aqui.' : 'Tente outras palavras ou filtros.'} />
      ) : (
        <>
          {res.messages.map((m) => <ResultCard key={m.id} m={m} showChannel />)}
          {!inbox && res.total > 25 && (
            <div className="flex items-center justify-between pt-2 text-sm">
              <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 25))} className="text-accent-2 disabled:opacity-30">← Anteriores</button>
              <span className="text-fg-2">{offset / 25 + 1} / {Math.ceil(res.total / 25)}</span>
              <button disabled={offset + 25 >= res.total} onClick={() => setOffset(offset + 25)} className="text-accent-2 disabled:opacity-30">Próximos →</button>
            </div>
          )}
        </>
      )}
    </PanelShell>
  );
}
