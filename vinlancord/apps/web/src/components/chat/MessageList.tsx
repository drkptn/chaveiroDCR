/**
 * Lista de mensagens virtualizada (só renderiza o que está visível) com
 * paginação para cima, separadores de data e "novas mensagens".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { ArrowDown, Hash, Users } from 'lucide-react';
import { compareSnowflakes, type Channel } from '@vinlancord/shared';
import { useStore, displayName } from '../../store';
import { clearHighlight, loadMessages, scheduleAck } from '../../store/actions';
import { useUI } from '../../store/ui';
import { formatLongDate, isSameDay } from '../../lib/format';
import { Avatar, Spinner } from '../ui';
import { MessageItem } from './Message';

const START_INDEX = 1_000_000;
const GROUP_MS = 7 * 60_000;

type Row = { kind: 'msg'; id: string; grouped: boolean } | { kind: 'day'; id: string; label: string } | { kind: 'new'; id: string };

export function MessageList({ channel }: { channel: Channel }) {
  const cm = useStore((s) => s.messages[channel.id]);
  const lastRead = useStore((s) => s.readStates[channel.id]?.lastReadId ?? null);
  const meId = useStore((s) => s.me?.id);
  const ref = useRef<VirtuosoHandle>(null);
  const [firstIndex, setFirstIndex] = useState(START_INDEX);
  const [atBottom, setAtBottom] = useState(true);
  const prevFirstId = useRef<string | null>(null);
  const prevLen = useRef(0);
  // marcador de "novas mensagens" calculado ao abrir o canal
  const [unreadMarker, setUnreadMarker] = useState<string | null>(null);

  useEffect(() => {
    setUnreadMarker(lastRead);
    setFirstIndex(START_INDEX);
    prevFirstId.current = null;
    prevLen.current = 0;
    if (!useStoreLoaded(channel.id)) void loadMessages(channel.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  const items = cm?.items ?? [];

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let prev: (typeof items)[number] | null = null;
    let markerPlaced = false;
    for (const m of items) {
      const d = new Date(m.createdAt);
      if (!prev || !isSameDay(new Date(prev.createdAt), d)) out.push({ kind: 'day', id: `day-${m.id}`, label: formatLongDate(d) });
      if (!markerPlaced && unreadMarker && !m.pending && m.author.id !== meId && compareSnowflakes(m.id, unreadMarker) > 0 && prev) {
        out.push({ kind: 'new', id: `new-${m.id}` });
        markerPlaced = true;
      }
      const grouped =
        !!prev &&
        prev.author.id === m.author.id &&
        (prev.type === 'default' || prev.type === 'reply') &&
        (m.type === 'default' || m.type === 'reply') &&
        !m.reference &&
        d.getTime() - new Date(prev.createdAt).getTime() < GROUP_MS &&
        isSameDay(new Date(prev.createdAt), d);
      out.push({ kind: 'msg', id: m.id, grouped });
      prev = m;
    }
    return out;
  }, [items, unreadMarker, meId]);

  // ao carregar mensagens antigas, ajusta o índice (em linhas) para a rolagem não pular
  useEffect(() => {
    const firstMsg = rows.find((r) => r.kind === 'msg')?.id ?? null;
    if (prevFirstId.current && firstMsg && firstMsg !== prevFirstId.current) {
      const oldRow = rows.findIndex((r) => r.kind === 'msg' && r.id === prevFirstId.current);
      const prevRowIdx = prevLen.current;
      if (oldRow > prevRowIdx) setFirstIndex((f) => f - (oldRow - prevRowIdx));
    }
    prevFirstId.current = firstMsg;
    prevLen.current = rows.findIndex((r) => r.kind === 'msg');
  }, [rows]);

  const byId = useMemo(() => new Map(items.map((m) => [m.id, m])), [items]);
  const highlight = cm?.highlight ?? null;

  // pula para a mensagem destacada (busca/resposta)
  useEffect(() => {
    if (!highlight) return;
    const idx = rows.findIndex((r) => r.kind === 'msg' && r.id === highlight);
    if (idx >= 0) {
      setTimeout(() => ref.current?.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' }), 50);
      const t = setTimeout(() => clearHighlight(channel.id), 2500);
      return () => clearTimeout(t);
    }
  }, [highlight, rows, channel.id]);

  const loadOlder = useCallback(() => {
    if (!cm || cm.loading || !cm.hasMoreBefore || !items.length) return;
    const oldest = items.find((m) => !m.pending);
    if (oldest) void loadMessages(channel.id, { before: oldest.id });
  }, [cm, items, channel.id]);

  if (!cm || (!cm.loaded && cm.loading)) {
    return (
      <div className="flex flex-1 flex-col justify-end gap-6 overflow-hidden px-4 pb-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-4" style={{ opacity: 1 - i * 0.12 }}>
            <div className="size-10 rounded-full skeleton" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded skeleton" />
              <div className="h-3 rounded skeleton" style={{ width: `${40 + ((i * 37) % 50)}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Virtuoso
        ref={ref}
        className="scroll-thin flex-1"
        data={rows}
        firstItemIndex={firstIndex}
        initialTopMostItemIndex={Math.max(0, rows.length - 1)}
        alignToBottom
        followOutput={(bottom) => (bottom ? 'smooth' : false)}
        atBottomThreshold={80}
        atBottomStateChange={(b) => {
          setAtBottom(b);
          if (b) scheduleAck(channel.id);
        }}
        startReached={loadOlder}
        increaseViewportBy={{ top: 600, bottom: 300 }}
        computeItemKey={(_, r) => r.id}
        components={{
          Header: () => (cm.hasMoreBefore ? <div className="grid h-16 place-items-center">{cm.loading && <Spinner />}</div> : <ChannelIntro channel={channel} />),
          Footer: () => <div className="h-4" />,
        }}
        itemContent={(_, r) => {
          if (r.kind === 'day')
            return (
              <div className="mx-4 mb-1 mt-5 flex items-center gap-2 text-[11px] font-semibold text-fg-2">
                <span className="h-px flex-1 bg-line" />
                {r.label}
                <span className="h-px flex-1 bg-line" />
              </div>
            );
          if (r.kind === 'new')
            return (
              <div className="relative mx-4 mt-3 h-px bg-danger">
                <span className="absolute -top-2 right-0 rounded-sm bg-danger px-1 text-[10px] font-bold uppercase text-white">Novas</span>
              </div>
            );
          const m = byId.get(r.id);
          return m ? <MessageItem m={m} grouped={r.grouped} highlight={highlight === m.id} /> : null;
        }}
      />
      {(!atBottom || cm.hasMoreAfter) && (
        <button
          onClick={() => {
            if (cm.hasMoreAfter) void loadMessages(channel.id);
            else ref.current?.scrollToIndex({ index: rows.length - 1 + firstIndex - START_INDEX, behavior: 'smooth' });
            setTimeout(() => ref.current?.scrollTo({ top: 1e9, behavior: 'smooth' }), 60);
          }}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line-strong bg-bg-1/95 px-4 py-1.5 text-[13px] font-medium text-fg shadow-[var(--vl-shadow)] backdrop-blur animate-slide-up hover:bg-bg-3"
        >
          {cm.hasMoreAfter ? 'Você está vendo mensagens antigas — ir para as recentes' : 'Ir para o fim'}
          <ArrowDown size={14} />
        </button>
      )}
    </div>
  );
}

function useStoreLoaded(channelId: string) {
  return !!useStore.getState().messages[channelId]?.loaded;
}

function ChannelIntro({ channel }: { channel: Channel }) {
  const meId = useStore((s) => s.me?.id);
  const other = channel.type === 'dm' ? channel.recipients?.find((r) => r !== meId) : null;
  const user = useStore((s) => (other ? s.users[other] : undefined));
  if (other && user)
    return (
      <div className="px-4 pb-4 pt-16">
        <Avatar userId={other} size={80} animate />
        <h1 className="mt-3 font-display text-3xl font-bold text-fg">{user.displayName}</h1>
        <div className="text-lg text-fg-1">{user.username}</div>
        <p className="mt-3 text-fg-2">
          Este é o começo do seu histórico de mensagens diretas com <b className="text-fg-1">{user.displayName}</b>. Diga oi! 👋
        </p>
      </div>
    );
  if (channel.type === 'group_dm')
    return (
      <div className="px-4 pb-4 pt-16">
        <div className="grid size-20 place-items-center rounded-full gradient-accent text-white"><Users size={36} /></div>
        <h1 className="mt-3 font-display text-3xl font-bold text-fg">{channel.name || (channel.recipients ?? []).map((r) => displayName(r, null)).join(', ')}</h1>
        <p className="mt-2 text-fg-2">Bem-vindo ao começo do grupo.</p>
      </div>
    );
  return (
    <div className="px-4 pb-4 pt-16">
      <div className="grid size-[68px] place-items-center rounded-full bg-bg-4 text-fg"><Hash size={40} /></div>
      <h1 className="mt-3 font-display text-3xl font-bold text-fg">Bem-vindo(a) a #{channel.name}!</h1>
      <p className="mt-2 text-fg-2">Este é o começo do canal #{channel.name}. {channel.topic}</p>
    </div>
  );
}

export function useIsViewing(channelId: string) {
  return useUI((s) => s.currentChannelId === channelId && s.focused);
}
