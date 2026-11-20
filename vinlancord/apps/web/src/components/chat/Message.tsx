/** Uma mensagem: cabeçalho, conteúdo em Markdown, anexos, reações, resposta e ações. */
import { memo, useState, type ReactNode } from 'react';
import {
  Reply,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  SmilePlus,
  Copy,
  Flag,
  MoreHorizontal,
  RotateCcw,
  X,
  Download,
  FileText,
  Phone,
  PhoneMissed,
  UserPlus,
  UserMinus,
  ArrowRight,
  CalendarDays,
  Link2,
  AlertCircle,
  Hash,
} from 'lucide-react';
import { P, formatBytes, has, type Attachment, type EmojiRef } from '@vinlancord/shared';
import { useStore, displayName, memberColor, S, type ClientMessage } from '../../store';
import { ui, useUI } from '../../store/ui';
import { deleteMessage, discardFailed, jumpToMessage, retryMessage, toggleReaction } from '../../store/actions';
import { api } from '../../lib/api';
import { formatMessageDate, formatTime, formatFull } from '../../lib/format';
import { Markdown } from '../../lib/markdown';
import { channelPerms } from '../../lib/perms';
import { Avatar, Tooltip, cx } from '../ui';
import { isFresh } from '../../lib/fresh';
import { UserBadges } from '../UserBadges';
import { EmojiPickerPopover } from './Pickers';
import { InviteEmbed } from './InviteEmbed';
import { MessageEditor } from './MessageEditor';

const QUICK = ['👍', '😂', '❤️', '🔥', '😮'];
const INVITE_RE = /(?:vinlancord:\/\/invite\/|https?:\/\/[^\s/]+\/(?:#\/)?invite\/)([a-zA-Z0-9]{4,16})/;
const GIF_RE = /^https:\/\/(?:media\d*\.giphy\.com\/media\/[\w-]+\/[\w.-]+\.(?:gif|webp)|i\.giphy\.com\/[\w.-]+\.(?:gif|webp))(?:\?[\w=&.-]*)?$/;

function Header({ m, guildId }: { m: ClientMessage; guildId: string | null }) {
  const name = useStore(() => displayName(m.author.id, guildId));
  const color = useStore((s) => memberColor(s, guildId, m.author.id));
  const showSeconds = useStore((s) => s.settings.showSeconds);
  return (
    <div className="flex items-baseline gap-2">
      <button
        className="vl-msg-author truncate text-[15px] font-semibold hover:underline"
        style={{ color: color ?? 'var(--vl-text-0)' }}
        onClick={(e) => ui.profile(m.author.id, guildId, e.currentTarget)}
      >
        {name}
      </button>
      {m.author.system && <span className="rounded bg-accent px-1 text-[10px] font-bold text-accent-fg">SISTEMA</span>}
      <UserBadges userId={m.author.id} className="self-center" />
      <Tooltip label={formatFull(m.createdAt)}>
        <span className="text-xs text-fg-2">{formatMessageDate(m.createdAt, showSeconds)}</span>
      </Tooltip>
    </div>
  );
}

function ReplyPreview({ m, guildId }: { m: ClientMessage; guildId: string | null }) {
  const ref = m.reference!;
  const name = useStore(() => (ref.authorId ? displayName(ref.authorId, guildId) : ''));
  const color = useStore((s) => (ref.authorId ? memberColor(s, guildId, ref.authorId) : null));
  return (
    <div className="relative mb-0.5 ml-[52px] flex items-center gap-1.5 text-[13px] text-fg-2 before:absolute before:-left-9 before:top-2.5 before:h-3 before:w-8 before:rounded-tl-md before:border-l-2 before:border-t-2 before:border-line-strong">
      {ref.deleted ? (
        <span className="italic">Mensagem original apagada</span>
      ) : (
        <>
          {ref.authorId && <Avatar userId={ref.authorId} size={16} />}
          <span className="font-medium" style={{ color: color ?? 'var(--vl-text-1)' }}>
            @{name}
          </span>
          <button className="truncate hover:text-fg" onClick={() => void jumpToMessage(m.channelId, ref.id)}>
            {ref.content || (ref.hasAttachments ? '📎 Clique para ver o anexo' : '…')}
          </button>
        </>
      )}
    </div>
  );
}

function AttachmentView({ a }: { a: Attachment }) {
  const [revealed, setRevealed] = useState(!a.spoiler);
  const maxW = 420;
  const maxH = 340;
  const scale = a.width && a.height ? Math.min(1, maxW / a.width, maxH / a.height) : 1;
  const w = a.width ? Math.round(a.width * scale) : undefined;
  const h = a.height ? Math.round(a.height * scale) : undefined;
  if (!a.url) return <div className="mt-1 h-20 w-64 rounded-lg skeleton" />;
  const spoilerCover = !revealed && (
    <button onClick={() => setRevealed(true)} className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-black/70 backdrop-blur-xl">
      <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">Spoiler</span>
    </button>
  );
  if (a.kind === 'image')
    return (
      <div className="relative mt-1 w-fit overflow-hidden rounded-lg border border-line bg-bg-3" style={{ width: w, height: h }}>
        {spoilerCover}
        <img
          src={a.url}
          alt={a.filename}
          loading="lazy"
          width={w}
          height={h}
          className={cx('max-h-[340px] max-w-full cursor-zoom-in object-contain', !revealed && 'blur-2xl')}
          onClick={() => revealed && ui.open({ type: 'image', src: a.url, filename: a.filename, original: a.url })}
        />
      </div>
    );
  if (a.kind === 'video')
    return (
      <div className="relative mt-1 max-w-[480px] overflow-hidden rounded-lg border border-line bg-black">
        {spoilerCover}
        <video src={a.url} controls preload="metadata" className="max-h-[360px] w-full" />
      </div>
    );
  if (a.kind === 'audio')
    return (
      <div className="mt-1 w-[400px] max-w-full rounded-lg border border-line bg-bg-3 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm">
          <FileText size={18} className="text-accent" />
          <span className="truncate font-medium text-fg">{a.filename}</span>
          <span className="text-xs text-fg-2">{formatBytes(a.size)}</span>
        </div>
        <audio src={a.url} controls preload="none" className="w-full" />
      </div>
    );
  return (
    <div className="mt-1 flex w-[400px] max-w-full items-center gap-3 rounded-lg border border-line bg-bg-3 p-3">
      <FileText size={32} className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <a href={a.url + '&download=1'} className="block truncate text-sm font-medium text-accent-2 hover:underline" download={a.filename}>
          {a.filename}
        </a>
        <div className="text-xs text-fg-2">{formatBytes(a.size)}</div>
      </div>
      <a href={a.url + '&download=1'} download={a.filename} className="text-fg-2 hover:text-fg" aria-label="Baixar">
        <Download size={20} />
      </a>
    </div>
  );
}

function Reactions({ m }: { m: ClientMessage }) {
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  if (!m.reactions.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {m.reactions.map((r) => (
        <ReactionChip key={r.emoji.id ?? r.emoji.name} m={m} emoji={r.emoji} count={r.count} me={r.me} />
      ))}
      <button
        onClick={(e) => setPicker(e.currentTarget)}
        className="grid h-6 w-8 place-items-center rounded-md border border-transparent bg-bg-3 text-fg-2 opacity-0 transition group-hover:opacity-100 hover:border-line-strong hover:text-fg"
        aria-label="Adicionar reação"
      >
        <SmilePlus size={14} />
      </button>
      {picker && <EmojiPickerPopover anchor={picker} guildId={m.guildId} onClose={() => setPicker(null)} onPick={(e) => void toggleReaction(m.channelId, m.id, e)} />}
    </div>
  );
}

function ReactionChip({ m, emoji, count, me }: { m: ClientMessage; emoji: EmojiRef; count: number; me: boolean }) {
  const [who, setWho] = useState<string | null>(null);
  const loadWho = async () => {
    if (who) return;
    try {
      const users = await api.get<{ displayName: string }[]>(`/channels/${m.channelId}/messages/${m.id}/reactions/${encodeURIComponent(emoji.id ? `${emoji.name}:${emoji.id}` : emoji.name)}`);
      setWho(users.slice(0, 12).map((u) => u.displayName).join(', ') + (users.length > 12 ? ` e mais ${users.length - 12}` : ''));
    } catch {
      setWho('');
    }
  };
  return (
    <Tooltip label={who ? `${who} reagiu com ${emoji.id ? `:${emoji.name}:` : emoji.name}` : `:${emoji.name}:`}>
      <button
        onMouseEnter={() => void loadWho()}
        onClick={() => void toggleReaction(m.channelId, m.id, emoji)}
        className={cx(
          'flex h-6 items-center gap-1 rounded-md border px-1.5 text-[13px] font-medium tabular-nums transition',
          me ? 'border-accent/70 bg-accent/15 text-accent' : 'border-line bg-bg-3 text-fg-1 hover:border-line-strong',
        )}
      >
        {emoji.id ? <img src={emoji.url ?? ''} alt={emoji.name} className="size-4 object-contain" /> : <span className="text-[15px] leading-none">{emoji.name}</span>}
        {count}
      </button>
    </Tooltip>
  );
}

function SystemMessage({ m, guildId }: { m: ClientMessage; guildId: string | null }) {
  const name = useStore(() => displayName(m.author.id, guildId));
  const target = useStore(() => (m.mentions[0] ? displayName(m.mentions[0], guildId) : ''));
  const meId = useStore((s) => s.me?.id);
  let icon: ReactNode = <ArrowRight size={16} className="text-success" />;
  let text: ReactNode;
  switch (m.type) {
    case 'member_join': {
      const greetings = [`Eba! ${name} chegou. 🎉`, `${name} entrou na festa.`, `Deem as boas-vindas a ${name}!`, `${name} acabou de aparecer. Segura o chat!`, `Um(a) ${name} selvagem apareceu!`];
      text = greetings[Number(BigInt(m.id) % BigInt(greetings.length))];
      break;
    }
    case 'call': {
      const ended = m.call?.endedAt;
      const missed = ended && meId && !m.call?.participants.includes(meId);
      icon = missed ? <PhoneMissed size={16} className="text-danger" /> : <Phone size={16} className="text-success" />;
      text = missed ? `Você perdeu uma chamada de ${name}.` : ended ? `${name} iniciou uma chamada que durou ${durationText(m.createdAt, ended)}.` : `${name} iniciou uma chamada.`;
      break;
    }
    case 'pin':
      icon = <Pin size={16} className="text-fg-1" />;
      text = (
        <>
          {name} fixou{' '}
          <button className="font-semibold text-fg hover:underline" onClick={() => m.reference && void jumpToMessage(m.channelId, m.reference.id)}>
            uma mensagem
          </button>{' '}
          neste canal.
        </>
      );
      break;
    case 'group_add':
      icon = <UserPlus size={16} className="text-success" />;
      text = `${name} adicionou ${target} ao grupo.`;
      break;
    case 'group_remove':
      icon = <UserMinus size={16} className="text-danger" />;
      text = m.mentions[0] === m.author.id ? `${name} saiu do grupo.` : `${name} removeu ${target} do grupo.`;
      break;
    case 'group_name':
      icon = <Pencil size={16} className="text-fg-1" />;
      text = `${name} mudou o nome do grupo para "${m.content}".`;
      break;
    case 'event':
      icon = <CalendarDays size={16} className="text-accent" />;
      return (
        <div className="flex gap-4 py-1 pl-[22px] pr-12">
          <span className="mt-1">{icon}</span>
          <div className="min-w-0 text-[15px] text-fg-1"><Markdown content={m.content} /></div>
        </div>
      );
    default:
      text = m.content;
  }
  return (
    <div className="flex items-center gap-4 py-1 pl-[22px] pr-12 text-[14.5px] text-fg-2">
      <span className="w-[18px]">{icon}</span>
      <span className="min-w-0">
        {text} <span className="text-xs">{formatMessageDate(m.createdAt)}</span>
      </span>
    </div>
  );
}

function durationText(start: string, end: string) {
  const s = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  if (s < 60) return `${s} segundos`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} minuto${min > 1 ? 's' : ''}`;
  const h = Math.floor(min / 60);
  return `${h}h${String(min % 60).padStart(2, '0')}`;
}

function messageMenu(e: { clientX: number; clientY: number; preventDefault?: () => void }, m: ClientMessage) {
  const s = S();
  const perms = channelPerms(s, m.channelId);
  const mine = m.author.id === s.me?.id;
  const canManage = has(perms, P.MANAGE_MESSAGES);
  const canPin = has(perms, P.PIN_MESSAGES) || canManage;
  const editable = mine && (m.type === 'default' || m.type === 'reply');
  ui.menu(e, [
    {
      render: (
        <div className="flex gap-1">
          {QUICK.map((q) => (
            <button key={q} className="grid size-8 place-items-center rounded-md bg-bg-3 text-lg hover:bg-bg-5" onClick={() => (ui.closeMenu(), void toggleReaction(m.channelId, m.id, { id: null, name: q }))}>
              {q}
            </button>
          ))}
        </div>
      ),
    },
    { label: 'Responder', icon: <Reply size={15} />, onClick: () => useUI.setState((u) => ({ replyTo: { ...u.replyTo, [m.channelId]: m.id } })) },
    ...(editable ? [{ label: 'Editar', icon: <Pencil size={15} />, onClick: () => useUI.setState({ editing: m.id }) }] : []),
    ...(canPin ? [{ label: m.pinned ? 'Desafixar' : 'Fixar mensagem', icon: m.pinned ? <PinOff size={15} /> : <Pin size={15} />, onClick: () => void (m.pinned ? api.del(`/channels/${m.channelId}/pins/${m.id}`) : api.put(`/channels/${m.channelId}/pins/${m.id}`)).catch((er) => ui.error(er)) }] : []),
    { label: 'Copiar texto', icon: <Copy size={15} />, onClick: () => void navigator.clipboard.writeText(m.content) },
    { label: 'Copiar ID da mensagem', icon: <Hash size={15} />, onClick: () => void navigator.clipboard.writeText(m.id) },
    ...(m.attachments[0] ? [{ label: 'Copiar link do anexo', icon: <Link2 size={15} />, onClick: () => void navigator.clipboard.writeText(m.attachments[0]!.url) }] : []),
    { separator: true },
    ...(!mine ? [{ label: 'Denunciar mensagem', icon: <Flag size={15} />, danger: true, onClick: () => ui.open({ type: 'report', targetType: 'message', targetId: m.id, channelId: m.channelId, label: 'esta mensagem' }) }] : []),
    ...(mine || canManage
      ? [
          {
            label: 'Apagar mensagem',
            icon: <Trash2 size={15} />,
            danger: true,
            onClick: () => confirmDelete(m),
          },
        ]
      : []),
  ]);
}

function confirmDelete(m: ClientMessage, skip = false) {
  if (skip) return void deleteMessage(m.channelId, m.id).catch((e) => ui.error(e));
  ui.confirm({
    title: 'Apagar mensagem',
    body: 'Tem certeza? Dica: segure Shift ao clicar na lixeira para apagar sem confirmação.',
    confirmLabel: 'Apagar',
    danger: true,
    onConfirm: () => deleteMessage(m.channelId, m.id),
  });
}

function Toolbar({ m }: { m: ClientMessage }) {
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  const s = S();
  const mine = m.author.id === s.me?.id;
  const canDelete = mine || has(channelPerms(s, m.channelId), P.MANAGE_MESSAGES);
  const btn = 'grid size-8 place-items-center text-fg-2 transition hover:bg-bg-4 hover:text-fg';
  return (
    <div className={cx('vl-cut-sm absolute -top-4 right-4 z-10 flex overflow-hidden rounded-lg border border-line-strong bg-bg-1/95 shadow-[var(--vl-shadow)] backdrop-blur-md animate-pop-in', picker ? 'flex' : 'hidden group-hover:flex')}>
      {QUICK.slice(0, 3).map((q) => (
        <button key={q} className={btn} onClick={() => void toggleReaction(m.channelId, m.id, { id: null, name: q })} aria-label={`Reagir com ${q}`}>
          <span className="text-[17px]">{q}</span>
        </button>
      ))}
      <Tooltip label="Adicionar reação"><button className={btn} onClick={(e) => setPicker(e.currentTarget)}><SmilePlus size={17} /></button></Tooltip>
      <Tooltip label="Responder"><button className={btn} onClick={() => useUI.setState((u) => ({ replyTo: { ...u.replyTo, [m.channelId]: m.id } }))}><Reply size={17} /></button></Tooltip>
      {mine && (m.type === 'default' || m.type === 'reply') && <Tooltip label="Editar"><button className={btn} onClick={() => useUI.setState({ editing: m.id })}><Pencil size={16} /></button></Tooltip>}
      {canDelete && <Tooltip label="Apagar"><button className={cx(btn, 'hover:text-danger')} onClick={(e) => confirmDelete(m, e.shiftKey)}><Trash2 size={16} /></button></Tooltip>}
      <Tooltip label="Mais"><button className={btn} onClick={(e) => messageMenu(e, m)}><MoreHorizontal size={17} /></button></Tooltip>
      {picker && <EmojiPickerPopover anchor={picker} guildId={m.guildId} onClose={() => setPicker(null)} onPick={(e) => void toggleReaction(m.channelId, m.id, e)} />}
    </div>
  );
}

export const MessageItem = memo(function MessageItem({ m, grouped, highlight }: { m: ClientMessage; grouped: boolean; highlight: boolean }) {
  const meId = useStore((s) => s.me?.id);
  const myRoles = useStore((s) => (m.guildId ? s.myMembers[m.guildId]?.roles : undefined));
  const editing = useUI((s) => s.editing === m.id);
  const compact = useStore((s) => s.settings.compact);
  const [enter] = useState(() => isFresh(m.id));
  const guildId = m.guildId;

  if (m.type !== 'default' && m.type !== 'reply') return <SystemMessage m={m} guildId={guildId} />;

  const mentioned =
    !!meId && (m.mentions.includes(meId) || m.mentionEveryone || (!!myRoles && m.mentionRoles.some((r) => myRoles.includes(r)))) && m.author.id !== meId;
  const isGif = GIF_RE.test(m.content.trim());
  const invite = INVITE_RE.exec(m.content)?.[1];
  const showHeader = !grouped || !!m.reference;

  return (
    <div
      data-mid={m.id}
      onContextMenu={(e) => !m.pending && messageMenu(e, m)}
      className={cx(
        'group relative pr-12 transition-colors',
        showHeader ? cx('vl-msg-head', compact ? 'mt-1 pt-0.5' : 'mt-[17px] pt-0.5') : 'vl-msg-cont py-[1px]',
        enter && 'vl-msg-enter',
        mentioned ? 'bg-[var(--vl-mention)] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-warning' : 'hover:bg-bg-3/50',
        highlight && 'bg-accent/10 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent',
      )}
    >
      {m.reference && <ReplyPreview m={m} guildId={guildId} />}
      <div className="flex gap-4 pl-4">
        <div className="w-10 shrink-0">
          {showHeader ? (
            <button onClick={(e) => ui.profile(m.author.id, guildId, e.currentTarget)} className="mt-0.5 transition active:translate-y-px">
              <Avatar userId={m.author.id} size={40} />
            </button>
          ) : (
            <span className="invisible block pt-1 text-right text-[10px] text-fg-2 group-hover:visible">{formatTime(m.createdAt)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {showHeader && <Header m={m} guildId={guildId} />}
          {editing ? (
            <MessageEditor m={m} />
          ) : (
            <div className={cx('vl-msg-body text-[15px] leading-[1.375] text-fg', m.pending && 'opacity-50', m.failed && 'text-danger')}>
              {m.content && !isGif && <Markdown content={m.content} />}
              {isGif && <img src={m.content.trim()} alt="GIF" loading="lazy" className="mt-1 max-h-[280px] max-w-[400px] rounded-lg" />}
              {m.editedAt && (
                <Tooltip label={formatFull(m.editedAt)}>
                  <span className="ml-1 select-none text-[10px] text-fg-2">(editado)</span>
                </Tooltip>
              )}
            </div>
          )}
          {m.sticker && (
            <Tooltip label={m.sticker.name}>
              <img src={m.sticker.url} alt={m.sticker.name} className="mt-1 size-40 object-contain" loading="lazy" />
            </Tooltip>
          )}
          {m.attachments.map((a) => (
            <AttachmentView key={a.id} a={a} />
          ))}
          {invite && <InviteEmbed code={invite} />}
          <Reactions m={m} />
          {m.pending && m.attachments.length > 0 && <div className="mt-1 text-xs text-fg-2">Enviando anexos…</div>}
          {m.failed && (
            <div className="mt-1 flex items-center gap-2 text-xs text-danger">
              <AlertCircle size={14} /> Não foi enviada.
              <button className="flex items-center gap-1 font-semibold hover:underline" onClick={() => void retryMessage(m.channelId, m)}>
                <RotateCcw size={12} /> Tentar de novo
              </button>
              <button className="flex items-center gap-1 text-fg-2 hover:underline" onClick={() => discardFailed(m.channelId, m.id)}>
                <X size={12} /> Descartar
              </button>
            </div>
          )}
        </div>
      </div>
      {!m.pending && !m.failed && !editing && <Toolbar m={m} />}
    </div>
  );
});
