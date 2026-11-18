/** Caixa de mensagem: texto com Markdown, menções, emojis, GIFs, figurinhas, anexos e respostas. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PlusCircle, Smile, ImagePlay, Sticker, X, FileText, EyeOff, Eye, Lock, Ban } from 'lucide-react';
import { LIMITS, P, formatBytes, has, type Channel } from '@vinlancord/shared';
import { useStore, displayName, S } from '../../store';
import { useUI, ui } from '../../store/ui';
import { sendMessage, sendTyping, type OutgoingFile } from '../../store/actions';
import { useChannelPerms } from '../../lib/perms';
import { loadEmojis, searchEmojis, type EmojiData } from '../../lib/emoji';
import { Avatar, Tooltip, cx } from '../ui';
import { ExpressionPicker } from './Pickers';
import { toWire } from './mentions';

interface Suggestion {
  key: string;
  label: React.ReactNode;
  sub?: string;
  insert: string;
}

const drafts = new Map<string, string>();

export function Composer({ channel }: { channel: Channel }) {
  const [text, setText] = useState(() => drafts.get(channel.id) ?? '');
  const [files, setFiles] = useState<(OutgoingFile & { preview?: string })[]>([]);
  const [picker, setPicker] = useState<'emoji' | 'gif' | 'sticker' | null>(null);
  const [sugg, setSugg] = useState<{ items: Suggestion[]; index: number; start: number } | null>(null);
  const [emojiList, setEmojiList] = useState<EmojiData[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const replyId = useUI((s) => s.replyTo[channel.id] ?? null);
  const replyMsg = useStore((s) => (replyId ? s.messages[channel.id]?.items.find((m) => m.id === replyId) : undefined));
  const perms = useChannelPerms(channel.id);
  const me = useStore((s) => s.me);
  const blocked = useStore((s) => {
    if (channel.type !== 'dm') return false;
    const other = channel.recipients?.find((r) => r !== s.me?.id);
    return other ? s.relationships[other]?.type === 'blocked' : false;
  });
  const timedOut = useStore((s) => {
    const m = channel.guildId ? s.myMembers[channel.guildId] : null;
    return !!m?.timeoutUntil && new Date(m.timeoutUntil).getTime() > Date.now();
  });
  const canSend = has(perms, P.SEND_MESSAGES) && !blocked;
  const canAttach = has(perms, P.ATTACH_FILES);
  const placeholder =
    channel.type === 'dm'
      ? `Conversar com @${displayName(channel.recipients?.find((r) => r !== me?.id) ?? '', null)}`
      : channel.type === 'group_dm'
        ? `Conversar em ${channel.name || 'grupo'}`
        : `Conversar em #${channel.name}`;

  useEffect(() => {
    setText(drafts.get(channel.id) ?? '');
    setFiles([]);
    setSugg(null);
    ref.current?.focus();
  }, [channel.id]);

  useEffect(() => {
    drafts.set(channel.id, text);
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 320) + 'px';
    }
  }, [text, channel.id]);

  useEffect(() => {
    if (replyId) ref.current?.focus();
  }, [replyId]);

  // digitar em qualquer lugar foca a caixa de mensagem
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (useUI.getState().modals.length) return;
      if (e.key.length === 1) ref.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const addFiles = (list: FileList | File[]) => {
    if (!canAttach) return ui.error('Você não pode enviar arquivos neste canal.');
    const arr = [...list];
    for (const f of arr) {
      if (f.size > LIMITS.ATTACHMENT_MAX_SIZE) return ui.error(`"${f.name}" passa do limite de ${formatBytes(LIMITS.ATTACHMENT_MAX_SIZE)}.`);
    }
    setFiles((prev) =>
      [...prev, ...arr.map((f) => ({ file: f, spoiler: false, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined }))].slice(0, LIMITS.ATTACHMENTS_PER_MESSAGE),
    );
  };

  const computeSuggestions = async (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = /(^|\s)([@#:])([^\s@#:]{0,32})$/.exec(before);
    if (!m) return setSugg(null);
    const [, , trig, q] = m;
    const start = caret - q!.length - 1;
    const ql = q!.toLowerCase();
    const s = S();
    let items: Suggestion[] = [];
    if (trig === '@') {
      const ids = channel.guildId ? Object.keys(s.members[channel.guildId] ?? {}) : channel.recipients ?? [];
      items = ids
        .map((id) => ({ id, u: s.users[id], name: displayName(id, channel.guildId) }))
        .filter((x) => x.u && (x.u.username.includes(ql) || x.name.toLowerCase().includes(ql)))
        .slice(0, 8)
        .map((x) => ({
          key: x.id,
          label: (
            <span className="flex items-center gap-2">
              <Avatar userId={x.id} size={22} /> {x.name}
            </span>
          ),
          sub: x.u!.username,
          insert: '@' + x.u!.username + ' ',
        }));
      if (channel.guildId) {
        for (const r of Object.values(s.roles[channel.guildId] ?? {})) {
          if (r.id === channel.guildId || !r.name.toLowerCase().includes(ql)) continue;
          if (!r.mentionable && !has(perms, P.MENTION_EVERYONE)) continue;
          items.push({ key: r.id, label: <span style={{ color: r.color ?? undefined }}>@{r.name}</span>, sub: 'cargo', insert: '@' + r.name + ' ' });
        }
        if (has(perms, P.MENTION_EVERYONE))
          for (const e of ['everyone', 'here'])
            if (e.startsWith(ql)) items.push({ key: e, label: '@' + e, sub: e === 'everyone' ? 'notifica todo mundo' : 'notifica quem está online', insert: '@' + e + ' ' });
      }
    } else if (trig === '#' && channel.guildId) {
      items = Object.values(s.channels)
        .filter((c) => c.guildId === channel.guildId && c.type === 'text' && c.name.includes(ql))
        .slice(0, 8)
        .map((c) => ({ key: c.id, label: '#' + c.name, insert: '#' + c.name + ' ' }));
    } else if (trig === ':' && q!.length >= 2) {
      const list = emojiList ?? (await loadEmojis());
      if (!emojiList) setEmojiList(list);
      const custom = Object.values(s.emojis)
        .flat()
        .filter((e) => e.name.toLowerCase().includes(ql))
        .slice(0, 5)
        .map((e) => ({ key: e.id, label: <span className="flex items-center gap-2"><img src={e.url} className="size-5" alt="" />:{e.name}:</span>, insert: `:${e.name}: ` }));
      const uni = searchEmojis(list, q!, 8).map((e) => ({ key: e.unicode, label: <span className="flex items-center gap-2"><span className="text-lg">{e.unicode}</span>{e.label}</span>, insert: e.unicode + ' ' }));
      items = [...custom, ...uni].slice(0, 10);
    }
    setSugg(items.length ? { items, index: 0, start } : null);
  };

  const applySuggestion = (sg: Suggestion) => {
    const el = ref.current!;
    const caret = el.selectionStart;
    const next = text.slice(0, sugg!.start) + sg.insert + text.slice(caret);
    setText(next);
    setSugg(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = sugg!.start + sg.insert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const submit = () => {
    const raw = text.trim();
    if (!raw && !files.length) return;
    if (raw.length > LIMITS.MESSAGE_MAX) return ui.error(`A mensagem passou de ${LIMITS.MESSAGE_MAX} caracteres.`);
    const content = toWire(raw, channel.guildId, channel.id);
    void sendMessage(channel.id, content, { replyTo: replyId ?? undefined, files: files.map(({ file, spoiler }) => ({ file, spoiler })) });
    setText('');
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    drafts.delete(channel.id);
    useUI.setState((u) => ({ replyTo: { ...u.replyTo, [channel.id]: null } }));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (sugg) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setSugg({ ...sugg, index: (sugg.index + d + sugg.items.length) % sugg.items.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(sugg.items[sugg.index]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSugg(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowUp' && !text) {
      const mine = [...(S().messages[channel.id]?.items ?? [])].reverse().find((m) => m.author.id === me?.id && !m.pending && (m.type === 'default' || m.type === 'reply'));
      if (mine) {
        e.preventDefault();
        useUI.setState({ editing: mine.id });
      }
    } else if (e.key === 'Escape' && replyId) {
      useUI.setState((u) => ({ replyTo: { ...u.replyTo, [channel.id]: null } }));
    }
  };

  const insertAtCaret = (s: string) => {
    const el = ref.current;
    if (!el) return setText((t) => t + s);
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = text.slice(0, start) + s + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + s.length, start + s.length);
    });
  };

  const remaining = LIMITS.MESSAGE_MAX - text.length;
  const typingUsers = useTypingNames(channel.id, channel.guildId);

  if (!canSend) {
    return (
      <div className="px-4 pb-6">
        <div className="flex h-12 items-center gap-2 rounded-xl border border-line bg-bg-3 px-4 text-sm text-fg-2">
          {blocked ? <Ban size={16} /> : <Lock size={16} />}
          {blocked ? 'Você bloqueou este usuário. Desbloqueie para conversar.' : timedOut ? 'Você está de castigo e não pode enviar mensagens agora.' : 'Você não tem permissão para enviar mensagens neste canal.'}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 px-4 pb-1"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-x-4 bottom-2 top-[-120px] z-30 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent/10 backdrop-blur-sm animate-fade-in">
          <div className="text-center">
            <div className="font-display text-xl font-bold text-fg">Solte para enviar</div>
            <div className="text-sm text-fg-1">Até {LIMITS.ATTACHMENTS_PER_MESSAGE} arquivos de {formatBytes(LIMITS.ATTACHMENT_MAX_SIZE)}</div>
          </div>
        </div>
      )}
      {sugg && (
        <div className="absolute inset-x-4 bottom-full z-30 mb-1 overflow-hidden rounded-xl border border-line-strong bg-bg-1 p-1 shadow-[var(--vl-shadow)] animate-pop-in">
          {sugg.items.map((it, i) => (
            <button
              key={it.key}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(it);
              }}
              onMouseEnter={() => setSugg({ ...sugg, index: i })}
              className={cx('flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm', i === sugg.index ? 'bg-bg-4 text-fg' : 'text-fg-1')}
            >
              {it.label}
              {it.sub && <span className="text-xs text-fg-2">{it.sub}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-bg-3 transition focus-within:border-line-strong">
        {replyMsg && (
          <div className="flex items-center gap-2 border-b border-line bg-bg-1 px-4 py-2 text-[13px] text-fg-2 animate-fade-in">
            Respondendo a <b className="text-fg">{displayName(replyMsg.author.id, channel.guildId)}</b>
            <span className="flex-1" />
            <button onClick={() => useUI.setState((u) => ({ replyTo: { ...u.replyTo, [channel.id]: null } }))} className="hover:text-fg" aria-label="Cancelar resposta">
              <X size={16} />
            </button>
          </div>
        )}
        {files.length > 0 && (
          <div className="scroll-thin flex gap-3 overflow-x-auto border-b border-line p-3">
            {files.map((f, i) => (
              <div key={i} className="relative w-40 shrink-0 rounded-lg border border-line bg-bg-1 p-2">
                <div className="grid h-24 place-items-center overflow-hidden rounded-md bg-bg-4">
                  {f.preview ? <img src={f.preview} alt="" className={cx('size-full object-cover', f.spoiler && 'blur-lg')} /> : <FileText size={36} className="text-accent" />}
                </div>
                <div className="mt-1.5 truncate text-xs text-fg-1">{f.file.name}</div>
                <div className="text-[10px] text-fg-2">{formatBytes(f.file.size)}</div>
                <div className="absolute -right-2 -top-2 flex overflow-hidden rounded-lg border border-line-strong bg-bg-2 shadow">
                  <Tooltip label={f.spoiler ? 'Remover spoiler' : 'Marcar como spoiler'}>
                    <button className="grid size-7 place-items-center text-fg-2 hover:text-fg" onClick={() => setFiles(files.map((x, j) => (j === i ? { ...x, spoiler: !x.spoiler } : x)))}>
                      {f.spoiler ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </Tooltip>
                  <Tooltip label="Remover">
                    <button className="grid size-7 place-items-center text-danger hover:bg-danger/15" onClick={() => {
                        if (f.preview) URL.revokeObjectURL(f.preview);
                        setFiles(files.filter((_, j) => j !== i));
                      }}>
                      <X size={14} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1 px-2">
          {canAttach && (
            <Tooltip label="Enviar arquivo">
              <button className="mb-[9px] grid size-8 place-items-center rounded-full text-fg-2 transition hover:text-fg" onClick={() => fileInput.current?.click()} aria-label="Anexar">
                <PlusCircle size={22} />
              </button>
            </Tooltip>
          )}
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ''))} />
          <textarea
            ref={ref}
            value={text}
            rows={1}
            placeholder={placeholder}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) sendTyping(channel.id);
              void computeSuggestions(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                addFiles(e.clipboardData.files);
              }
            }}
            onBlur={() => setTimeout(() => setSugg(null), 150)}
            className="scroll-thin max-h-80 min-h-[46px] flex-1 resize-none bg-transparent py-[13px] text-[15px] leading-5 text-fg outline-none placeholder:text-fg-2"
          />
          {remaining < 300 && <span className={cx('mb-3 text-xs tabular-nums', remaining < 0 ? 'text-danger' : 'text-fg-2')}>{remaining}</span>}
          <div className="relative mb-[7px] flex items-center">
            {(['gif', 'sticker', 'emoji'] as const).map((k) => (
              <Tooltip key={k} label={{ gif: 'GIFs', sticker: 'Figurinhas', emoji: 'Emojis' }[k]}>
                <button
                  data-picker-toggle
                  onClick={() => setPicker(picker === k ? null : k)}
                  className={cx('grid size-9 place-items-center rounded-md transition hover:text-fg', picker === k ? 'text-fg' : 'text-fg-2')}
                >
                  {k === 'gif' ? <ImagePlay size={21} /> : k === 'sticker' ? <Sticker size={21} /> : <Smile size={21} />}
                </button>
              </Tooltip>
            ))}
            {picker && (
              <ExpressionPicker
                guildId={channel.guildId}
                initial={picker}
                onClose={() => setPicker(null)}
                onEmoji={(e) => insertAtCaret(e.id ? `:${e.name}:` : e.name)}
                onGif={(url) => void sendMessage(channel.id, url, { replyTo: replyId ?? undefined })}
                onSticker={(st) => void sendMessage(channel.id, '', { stickerId: st.id, replyTo: replyId ?? undefined })}
              />
            )}
          </div>
        </div>
      </div>
      <div className="flex h-6 items-center gap-1.5 px-1 text-[12px] text-fg-1">
        {typingUsers && (
          <>
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 rounded-full bg-fg-1" style={{ animation: `wave 1.2s ${i * 0.15}s infinite` }} />
              ))}
            </span>
            <span className="truncate">{typingUsers}</span>
          </>
        )}
        {channel.slowmode > 0 && !has(perms, P.MANAGE_MESSAGES) && <span className="ml-auto text-fg-2">Modo lento: {channel.slowmode}s</span>}
      </div>
    </div>
  );
}

function useTypingNames(channelId: string, guildId: string | null) {
  const typing = useStore((s) => s.typing[channelId]);
  const [, force] = useState(0);
  useEffect(() => {
    if (!typing) return;
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [typing]);
  return useMemo(() => {
    if (!typing) return null;
    const now = Date.now();
    const ids = Object.entries(typing)
      .filter(([, exp]) => exp > now)
      .map(([id]) => id);
    if (!ids.length) return null;
    const names = ids.map((id) => displayName(id, guildId));
    if (names.length === 1) return <><b>{names[0]}</b> está digitando…</>;
    if (names.length <= 3) return <><b>{names.slice(0, -1).join(', ')}</b> e <b>{names.at(-1)}</b> estão digitando…</>;
    return 'Várias pessoas estão digitando…';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing, guildId, Math.floor(Date.now() / 1000)]);
}
