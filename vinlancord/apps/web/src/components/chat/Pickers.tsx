/** Seletores de emoji, GIF e figurinhas. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Star, Clock, Sticker as StickerIcon, ImagePlay, Smile } from 'lucide-react';
import type { EmojiRef, GifResult, GuildSticker } from '@vinlancord/shared';
import { useStore } from '../../store';
import { useLocal, local } from '../../store/local';
import { api, ApiError } from '../../lib/api';
import { EMOJI_GROUPS, loadEmojis, searchEmojis, type EmojiData } from '../../lib/emoji';
import { updateSettings } from '../../store/actions';
import { GuildIcon, Spinner, Tooltip, cx } from '../ui';

function pushRecent(key: string) {
  const r = [key, ...local().recentEmojis.filter((x) => x !== key)].slice(0, 24);
  local().set({ recentEmojis: r });
}

export function EmojiPicker({ guildId, onPick, autoFocus = true }: { guildId: string | null; onPick: (e: EmojiRef, keepOpen?: boolean) => void; autoFocus?: boolean }) {
  const [list, setList] = useState<EmojiData[] | null>(null);
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<{ name: string; preview: string; isImg: boolean } | null>(null);
  const recents = useLocal((s) => s.recentEmojis);
  const guilds = useStore((s) => s.guilds);
  const allEmojis = useStore((s) => s.emojis);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void loadEmojis().then(setList);
  }, []);

  const custom = useMemo(() => {
    const ordered = Object.entries(allEmojis).sort(([a], [b]) => (a === guildId ? -1 : b === guildId ? 1 : 0));
    return ordered.filter(([, e]) => e.length).map(([gid, emojis]) => ({ guild: guilds[gid], emojis }));
  }, [allEmojis, guilds, guildId]);

  const pick = (e: EmojiRef, shift: boolean) => {
    pushRecent(e.id ? `${e.name}:${e.id}:${e.animated ? 1 : 0}` : e.name);
    onPick(e, shift);
  };

  const results = useMemo(() => {
    if (!q.trim() || !list) return null;
    const uni = searchEmojis(list, q, 80);
    const n = q.toLowerCase();
    const cust = custom.flatMap((g) => g.emojis).filter((e) => e.name.toLowerCase().includes(n)).slice(0, 40);
    return { uni, cust };
  }, [q, list, custom]);

  const recentRefs: EmojiRef[] = recents.map((r) => {
    const parts = r.split(':');
    if (parts.length === 3) {
      const all = custom.flatMap((g) => g.emojis);
      const e = all.find((x) => x.id === parts[1]);
      return { id: parts[1]!, name: parts[0]!, animated: parts[2] === '1', url: e?.url ?? null };
    }
    return { id: null, name: r };
  });

  const Cell = ({ e, title }: { e: EmojiRef; title: string }) => (
    <button
      className="grid size-10 place-items-center rounded-md text-[26px] leading-none transition hover:bg-bg-4"
      onClick={(ev) => pick(e, ev.shiftKey)}
      onMouseEnter={() => setHover({ name: title, preview: e.id ? e.url ?? '' : e.name, isImg: !!e.id })}
      aria-label={title}
    >
      {e.id ? <img src={e.url ?? ''} alt={e.name} className="size-8 object-contain" loading="lazy" /> : e.name}
    </button>
  );

  return (
    <div className="flex h-[420px] w-[400px] flex-col">
      <div className="p-2">
        <div className="flex h-9 items-center gap-2 rounded-lg border border-line bg-bg-1 px-2.5">
          <Search size={15} className="text-fg-2" />
          <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar emoji (ex.: risada, coração)" className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-2" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {!q && (
          <div className="scroll-none flex w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line py-1">
            <button className="grid size-8 place-items-center rounded-md text-fg-2 hover:bg-bg-4" onClick={() => scroller.current?.querySelector('#emo-recent')?.scrollIntoView()} title="Recentes">
              <Clock size={16} />
            </button>
            {custom.map(({ guild }) =>
              guild ? (
                <button key={guild.id} className="overflow-hidden rounded-md hover:opacity-80" onClick={() => scroller.current?.querySelector(`#emo-g${guild.id}`)?.scrollIntoView()} title={guild.name}>
                  <GuildIcon guild={guild} size={26} />
                </button>
              ) : null,
            )}
            {EMOJI_GROUPS.map((g) => (
              <button key={g.id} className="grid size-8 place-items-center rounded-md text-lg hover:bg-bg-4" onClick={() => scroller.current?.querySelector(`#emo-${g.id}`)?.scrollIntoView()} title={g.name}>
                {g.icon}
              </button>
            ))}
          </div>
        )}
        <div ref={scroller} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {!list ? (
            <div className="grid h-full place-items-center"><Spinner /></div>
          ) : results ? (
            <div className="grid grid-cols-8">
              {results.cust.map((e) => <Cell key={e.id} e={{ id: e.id, name: e.name, animated: e.animated, url: e.url }} title={`:${e.name}:`} />)}
              {results.uni.map((e) => <Cell key={e.unicode} e={{ id: null, name: e.unicode }} title={e.label} />)}
              {!results.cust.length && !results.uni.length && <div className="col-span-8 py-10 text-center text-sm text-fg-2">Nenhum emoji encontrado 🤔</div>}
            </div>
          ) : (
            <>
              <Section id="emo-recent" title="Usados recentemente">
                {recentRefs.map((e) => <Cell key={e.id ?? e.name} e={e} title={e.id ? `:${e.name}:` : e.name} />)}
              </Section>
              {custom.map(({ guild, emojis }) => (
                <Section key={guild?.id} id={`emo-g${guild?.id}`} title={guild?.name ?? 'Servidor'}>
                  {emojis.map((e) => <Cell key={e.id} e={{ id: e.id, name: e.name, animated: e.animated, url: e.url }} title={`:${e.name}:`} />)}
                </Section>
              ))}
              {EMOJI_GROUPS.map((g) => (
                <Section key={g.id} id={`emo-${g.id}`} title={g.name}>
                  {list.filter((e) => e.group === g.id).map((e) => <Cell key={e.unicode} e={{ id: null, name: e.unicode }} title={e.label} />)}
                </Section>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="flex h-12 items-center gap-2 border-t border-line bg-bg-1 px-3">
        {hover ? (
          <>
            {hover.isImg ? <img src={hover.preview} alt="" className="size-7 object-contain" /> : <span className="text-2xl">{hover.preview}</span>}
            <span className="truncate text-sm font-medium text-fg-1">{hover.name}</span>
          </>
        ) : (
          <span className="text-xs text-fg-2">Dica: segure Shift para escolher vários.</span>
        )}
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 200px' }}>
      <div className="sticky top-0 z-[1] bg-bg-2/95 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-2 backdrop-blur">{title}</div>
      <div className="grid grid-cols-8">{children}</div>
    </section>
  );
}

export function EmojiPickerPopover({ anchor, guildId, onClose, onPick }: { anchor: HTMLElement; guildId: string | null; onClose: () => void; onPick: (e: EmojiRef) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const r = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - 410, r.right - 400));
  const top = r.top > 440 ? r.top - 428 : Math.min(window.innerHeight - 430, r.bottom + 6);
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('mousedown', down), 0);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="fixed z-[70] animate-pop-in overflow-hidden rounded-xl border border-line-strong bg-bg-2 shadow-[var(--vl-shadow)]" style={{ left, top }}>
      <EmojiPicker
        guildId={guildId}
        onPick={(e, keep) => {
          onPick(e);
          if (!keep) onClose();
        }}
      />
    </div>,
    document.body,
  );
}

/* ───────────── GIFs ───────────── */

export function GifPicker({ onPick }: { onPick: (url: string) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<GifResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'search' | 'favorites'>('search');
  const favorites = useStore((s) => s.settings.favoriteGifs);
  useEffect(() => {
    if (tab !== 'search') return;
    const t = setTimeout(() => {
      setItems(null);
      api
        .get<GifResult[]>(`/gifs/search?q=${encodeURIComponent(q)}`)
        .then((r) => {
          setItems(r);
          setError(null);
        })
        .catch((e) => {
          setError(e instanceof ApiError && e.code === 'GIFS_DISABLED' ? 'disabled' : (e as Error).message);
          setItems([]);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q, tab]);
  const isFav = (url: string) => favorites.some((f) => f.url === url);
  const toggleFav = (g: { url: string; preview: string; width: number; height: number }) => {
    const next = isFav(g.url) ? favorites.filter((f) => f.url !== g.url) : [{ url: g.url, preview: g.preview, width: g.width, height: g.height }, ...favorites].slice(0, 100);
    void updateSettings({ favoriteGifs: next });
  };
  const list = tab === 'favorites' ? favorites.map((f, i) => ({ id: String(i), title: '', ...f })) : items;
  return (
    <div className="flex h-[420px] w-[420px] flex-col">
      <div className="flex gap-2 p-2">
        <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-line bg-bg-1 px-2.5">
          <Search size={15} className="text-fg-2" />
          <input autoFocus value={q} onChange={(e) => (setQ(e.target.value), setTab('search'))} placeholder="Buscar no GIPHY" className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-2" />
        </div>
        <Tooltip label="Favoritos">
          <button onClick={() => setTab(tab === 'favorites' ? 'search' : 'favorites')} className={cx('grid size-9 place-items-center rounded-lg border border-line', tab === 'favorites' ? 'bg-warning/20 text-warning' : 'text-fg-2 hover:text-fg')}>
            <Star size={16} />
          </button>
        </Tooltip>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {error === 'disabled' && tab === 'search' ? (
          <div className="px-6 py-10 text-center text-sm text-fg-2">
            A busca de GIFs não está configurada neste servidor.<br />
            Quem administra pode ativar definindo <code className="text-fg-1">GIPHY_API_KEY</code>. Seus GIFs favoritos continuam funcionando na estrela ⭐.
          </div>
        ) : !list ? (
          <div className="grid h-full place-items-center"><Spinner /></div>
        ) : !list.length ? (
          <div className="py-10 text-center text-sm text-fg-2">{tab === 'favorites' ? 'Clique na estrela de um GIF para favoritar.' : 'Nada por aqui…'}</div>
        ) : (
          <div className="columns-2 gap-1.5">
            {list.map((g) => (
              <div key={g.id + g.url} className="group relative mb-1.5 overflow-hidden rounded-lg bg-bg-3" style={{ aspectRatio: `${g.width} / ${g.height}` }}>
                <img src={g.preview} alt={g.title} loading="lazy" className="size-full cursor-pointer object-cover" onClick={() => onPick(g.url)} />
                <button
                  onClick={() => toggleFav(g)}
                  className={cx('absolute right-1 top-1 grid size-7 place-items-center rounded-md bg-black/60 transition', isFav(g.url) ? 'text-warning' : 'text-white opacity-0 group-hover:opacity-100')}
                  aria-label="Favoritar"
                >
                  <Star size={14} className={isFav(g.url) ? 'fill-warning' : ''} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-line px-3 py-1.5 text-right text-[10px] text-fg-2">Powered by GIPHY</div>
    </div>
  );
}

/* ───────────── Figurinhas ───────────── */

export function StickerPicker({ guildId, onPick }: { guildId: string | null; onPick: (s: GuildSticker) => void }) {
  const stickers = useStore((s) => s.stickers);
  const guilds = useStore((s) => s.guilds);
  const groups = Object.entries(stickers)
    .filter(([, l]) => l.length)
    .sort(([a], [b]) => (a === guildId ? -1 : b === guildId ? 1 : 0));
  return (
    <div className="scroll-thin h-[420px] w-[420px] overflow-y-auto p-2">
      {!groups.length && (
        <div className="px-6 py-16 text-center text-sm text-fg-2">
          Nenhuma figurinha ainda. Quem gerencia um servidor pode adicionar em <b>Configurações do servidor → Emojis e figurinhas</b>.
        </div>
      )}
      {groups.map(([gid, list]) => (
        <section key={gid} className="mb-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fg-2">
            {guilds[gid] && <GuildIcon guild={guilds[gid]!} size={16} className="rounded" />} {guilds[gid]?.name}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {list.map((st) => (
              <Tooltip key={st.id} label={st.name}>
                <button className="grid aspect-square place-items-center rounded-lg p-1 transition hover:bg-bg-4" onClick={() => onPick(st)}>
                  <img src={st.url} alt={st.name} loading="lazy" className="max-h-full max-w-full object-contain" />
                </button>
              </Tooltip>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ExpressionPicker({
  guildId,
  initial,
  onEmoji,
  onGif,
  onSticker,
  onClose,
}: {
  guildId: string | null;
  initial: 'emoji' | 'gif' | 'sticker';
  onEmoji: (e: EmojiRef) => void;
  onGif: (url: string) => void;
  onSticker: (s: GuildSticker) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('[data-picker-toggle]')) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('mousedown', down), 0);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  const tabs = [
    { id: 'gif' as const, label: 'GIFs', icon: <ImagePlay size={14} /> },
    { id: 'sticker' as const, label: 'Figurinhas', icon: <StickerIcon size={14} /> },
    { id: 'emoji' as const, label: 'Emojis', icon: <Smile size={14} /> },
  ];
  return (
    <div ref={ref} className="absolute bottom-full right-0 z-40 mb-2 animate-pop-in overflow-hidden rounded-xl border border-line-strong bg-bg-2 shadow-[var(--vl-shadow)]">
      <div className="flex gap-1 border-b border-line px-2 pt-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx('flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-[13px] font-medium transition', tab === t.id ? 'bg-bg-4 text-fg' : 'text-fg-2 hover:text-fg')}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'emoji' && <EmojiPicker guildId={guildId} onPick={(e, keep) => (onEmoji(e), !keep && onClose())} />}
      {tab === 'gif' && <GifPicker onPick={(u) => (onGif(u), onClose())} />}
      {tab === 'sticker' && <StickerPicker guildId={guildId} onPick={(s) => (onSticker(s), onClose())} />}
    </div>
  );
}
