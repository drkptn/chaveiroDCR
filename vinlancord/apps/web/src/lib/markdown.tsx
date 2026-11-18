/**
 * Markdown do Vinlancord: negrito, itálico, sublinhado, tachado, spoiler, código,
 * blocos de código, citações, listas, títulos, links, menções e emojis.
 *
 * Seguro por construção: o texto vira nós React (nunca innerHTML), links só
 * http(s) e abertos externamente com confirmação.
 */
import { Fragment, createContext, useContext, useState, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'b' | 'i' | 'u' | 's' | 'spoiler'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; url: string; c: Inline[] }
  | { t: 'user'; id: string }
  | { t: 'role'; id: string }
  | { t: 'channel'; id: string }
  | { t: 'everyone'; v: string }
  | { t: 'emoji'; id: string; name: string; animated: boolean };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'pre'; lang: string; v: string }
  | { t: 'quote'; c: Block[] }
  | { t: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { t: 'h'; level: 1 | 2 | 3; c: Inline[] };

type Rule = { re: RegExp; parse: (m: RegExpExecArray) => Inline; link?: true };

const RULES: Rule[] = [
  { re: /^\\([*_~`|\\<>#[\]()@:-])/, parse: (m) => ({ t: 'text', v: m[1]! }) },
  { re: /^``([^`]+?)``/, parse: (m) => ({ t: 'code', v: m[1]! }) },
  { re: /^`([^`\n]+?)`/, parse: (m) => ({ t: 'code', v: m[1]! }) },
  { re: /^<@!?(\d{15,20})>/, parse: (m) => ({ t: 'user', id: m[1]! }) },
  { re: /^<@&(\d{15,20})>/, parse: (m) => ({ t: 'role', id: m[1]! }) },
  { re: /^<#(\d{15,20})>/, parse: (m) => ({ t: 'channel', id: m[1]! }) },
  { re: /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{15,20})>/, parse: (m) => ({ t: 'emoji', animated: m[1] === 'a', name: m[2]!, id: m[3]! }) },
  {
    re: /^\[([^\]\n]{1,256})\]\(<?(https?:\/\/[^\s)>]+)>?\)/,
    parse: (m) => ({ t: 'link', url: m[2]!, c: parseInline(m[1]!, true) }),
    link: true,
  },
  { re: /^<(https?:\/\/[^\s>]+)>/, parse: (m) => ({ t: 'link', url: m[1]!, c: [{ t: 'text', v: m[1]! }] }), link: true },
  { re: /^https?:\/\/[^\s<]+[^\s<.,:;"')\]!?*_~|]/, parse: (m) => ({ t: 'link', url: m[0], c: [{ t: 'text', v: m[0] }] }), link: true },
  { re: /^@(everyone|here)\b/, parse: (m) => ({ t: 'everyone', v: m[1]! }) },
  { re: /^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/, parse: (m) => ({ t: 'b', c: parseInline(m[1]!) }) },
  { re: /^__(?=\S)([\s\S]*?\S)__(?!_)/, parse: (m) => ({ t: 'u', c: parseInline(m[1]!) }) },
  { re: /^\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/, parse: (m) => ({ t: 'i', c: parseInline(m[1]!) }) },
  { re: /^\*(\S)\*/, parse: (m) => ({ t: 'i', c: [{ t: 'text', v: m[1]! }] }) },
  { re: /^_(?=\S)([\s\S]*?\S)_(?![_\p{L}\p{N}])/u, parse: (m) => ({ t: 'i', c: parseInline(m[1]!) }) },
  { re: /^~~(?=\S)([\s\S]*?\S)~~/, parse: (m) => ({ t: 's', c: parseInline(m[1]!) }) },
  { re: /^\|\|([\s\S]+?)\|\|/, parse: (m) => ({ t: 'spoiler', c: parseInline(m[1]!) }) },
  { re: /^\n/, parse: () => ({ t: 'br' }) },
];

const TEXT_RE = /^[\s\S]+?(?=[\\<`*_~|[@\n]|https?:\/\/|$)/;

export function parseInline(src: string, inLink = false): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  let guard = 0;
  while (rest.length && guard++ < 10000) {
    let matched = false;
    for (const rule of RULES) {
      // links não podem conter links
      if (inLink && rule.link) continue;
      const m = rule.re.exec(rest);
      if (m) {
        out.push(rule.parse(m));
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const tm = TEXT_RE.exec(rest);
    const chunk = tm && tm[0].length ? tm[0] : rest[0]!;
    const last = out[out.length - 1];
    if (last?.t === 'text') last.v += chunk;
    else out.push({ t: 'text', v: chunk });
    rest = rest.slice(chunk.length);
  }
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  // 1) separa blocos de código cercados
  const parts: { code?: { lang: string; v: string }; text?: string }[] = [];
  const fence = /```(?:([a-zA-Z0-9+#_-]{1,20})\n)?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(src))) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index) });
    parts.push({ code: { lang: m[1] ?? '', v: m[2]!.replace(/^\n|\n$/g, '') } });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ text: src.slice(last) });

  for (const part of parts) {
    if (part.code) {
      blocks.push({ t: 'pre', lang: part.code.lang, v: part.code.v });
      continue;
    }
    const lines = part.text!.replace(/^\n+|\n+$/g, '').split('\n');
    let i = 0;
    let para: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n')) });
      para = [];
    };
    while (i < lines.length) {
      const line = lines[i]!;
      if (/^>>> /.test(line)) {
        flush();
        blocks.push({ t: 'quote', c: parseMarkdown([line.slice(4), ...lines.slice(i + 1)].join('\n')) });
        i = lines.length;
        continue;
      }
      if (/^> ?/.test(line) && line.length > 1) {
        flush();
        const q: string[] = [];
        while (i < lines.length && /^> ?/.test(lines[i]!)) q.push(lines[i++]!.replace(/^> ?/, ''));
        blocks.push({ t: 'quote', c: parseMarkdown(q.join('\n')) });
        continue;
      }
      const h = /^(#{1,3}) (.+)$/.exec(line);
      if (h) {
        flush();
        blocks.push({ t: 'h', level: h[1]!.length as 1 | 2 | 3, c: parseInline(h[2]!) });
        i++;
        continue;
      }
      const li = /^\s*([-*]|\d{1,3}\.) (.+)$/.exec(line);
      if (li) {
        flush();
        const ordered = /\d/.test(li[1]!);
        const start = ordered ? parseInt(li[1]!, 10) : 1;
        const items: Inline[][] = [];
        while (i < lines.length) {
          const mm = /^\s*([-*]|\d{1,3}\.) (.+)$/.exec(lines[i]!);
          if (!mm || /\d/.test(mm[1]!) !== ordered) break;
          items.push(parseInline(mm[2]!));
          i++;
        }
        blocks.push({ t: 'list', ordered, start, items });
        continue;
      }
      para.push(line);
      i++;
    }
    flush();
  }
  return blocks;
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Regional_Indicator}|‍|️|\s)+$/u;
const EMOJI_SPLIT = /(\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?(?:‍\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?)*|\p{Regional_Indicator}{2})/u;

/** Mensagem só com emojis (até 27) é exibida grande. */
export function isJumbo(blocks: Block[]) {
  if (blocks.length !== 1 || blocks[0]!.t !== 'p') return false;
  let count = 0;
  for (const n of blocks[0]!.c) {
    if (n.t === 'emoji') count++;
    else if (n.t === 'text' && EMOJI_ONLY.test(n.v)) count += [...n.v.matchAll(new RegExp(EMOJI_SPLIT, 'gu'))].length;
    else if (n.t === 'br') continue;
    else return false;
  }
  return count > 0 && count <= 27;
}

/* ─────────────────────────── Renderização ─────────────────────────── */

export interface MarkdownResolvers {
  user: (id: string) => { name: string; color?: string | null } | null;
  role: (id: string) => { name: string; color: string | null } | null;
  channel: (id: string) => { name: string } | null;
  emojiUrl: (id: string, animated: boolean) => string;
  onUserClick?: (id: string, el: HTMLElement) => void;
  onChannelClick?: (id: string) => void;
  onLinkClick?: (url: string) => void;
  meId?: string;
}

export const MarkdownContext = createContext<MarkdownResolvers | null>(null);

function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`spoiler ${open ? 'revealed' : ''}`} onClick={() => setOpen(true)} title={open ? undefined : 'Spoiler — clique para revelar'}>
      {children}
    </span>
  );
}

function CodeBlock({ lang, v }: { lang: string; v: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/code relative">
      <pre className="selectable">
        {lang && <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-2">{lang}</span>}
        <code>{v}</code>
      </pre>
      <button
        className="absolute right-2 top-2 rounded-md border border-line bg-bg-3 p-1 text-fg-2 opacity-0 transition group-hover/code:opacity-100 hover:text-fg"
        onClick={() => {
          void navigator.clipboard.writeText(v);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        title="Copiar código"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function renderText(v: string, key: string | number): ReactNode {
  // envolve emojis unicode para permitir ajuste de tamanho
  if (!EMOJI_SPLIT.test(v)) return <Fragment key={key}>{v}</Fragment>;
  const parts = v.split(new RegExp(EMOJI_SPLIT, 'u'));
  return (
    <Fragment key={key}>
      {parts.map((p, i) => (i % 2 === 1 ? <span key={i} className="uemoji">{p}</span> : p))}
    </Fragment>
  );
}

export function InlineNodes({ nodes }: { nodes: Inline[] }) {
  const r = useContext(MarkdownContext);
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text':
            return renderText(n.v, i);
          case 'br':
            return <br key={i} />;
          case 'b':
            return <strong key={i} className="font-semibold"><InlineNodes nodes={n.c} /></strong>;
          case 'i':
            return <em key={i}><InlineNodes nodes={n.c} /></em>;
          case 'u':
            return <u key={i}><InlineNodes nodes={n.c} /></u>;
          case 's':
            return <s key={i}><InlineNodes nodes={n.c} /></s>;
          case 'spoiler':
            return <Spoiler key={i}><InlineNodes nodes={n.c} /></Spoiler>;
          case 'code':
            return <code key={i} className="inline">{n.v}</code>;
          case 'link':
            return (
              <a
                key={i}
                href={n.url}
                onClick={(e) => {
                  e.preventDefault();
                  r?.onLinkClick?.(n.url);
                }}
                title={n.url}
                rel="noreferrer noopener"
              >
                <InlineNodes nodes={n.c} />
              </a>
            );
          case 'user': {
            const u = r?.user(n.id);
            return (
              <span key={i} className="mention" onClick={(e) => r?.onUserClick?.(n.id, e.currentTarget)}>
                @{u?.name ?? 'usuário-desconhecido'}
              </span>
            );
          }
          case 'role': {
            const role = r?.role(n.id);
            const color = role?.color;
            return (
              <span key={i} className="mention" style={color ? { color, background: `${color}26` } : undefined}>
                @{role?.name ?? 'cargo-removido'}
              </span>
            );
          }
          case 'channel': {
            const c = r?.channel(n.id);
            return (
              <span key={i} className="mention" onClick={() => r?.onChannelClick?.(n.id)}>
                #{c?.name ?? 'canal-desconhecido'}
              </span>
            );
          }
          case 'everyone':
            return <span key={i} className="mention">@{n.v}</span>;
          case 'emoji':
            return <img key={i} className="emoji" src={r?.emojiUrl(n.id, n.animated)} alt={`:${n.name}:`} title={`:${n.name}:`} draggable={false} loading="lazy" />;
        }
      })}
    </>
  );
}

function BlockNode({ b }: { b: Block }) {
  switch (b.t) {
    case 'p':
      return <p><InlineNodes nodes={b.c} /></p>;
    case 'pre':
      return <CodeBlock lang={b.lang} v={b.v} />;
    case 'quote':
      return <blockquote>{b.c.map((x, i) => <BlockNode key={i} b={x} />)}</blockquote>;
    case 'h': {
      const H = `h${b.level}` as 'h1';
      return <H><InlineNodes nodes={b.c} /></H>;
    }
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul';
      return (
        <L start={b.ordered ? b.start : undefined}>
          {b.items.map((it, i) => (
            <li key={i}><InlineNodes nodes={it} /></li>
          ))}
        </L>
      );
    }
  }
}

export function Markdown({ content, className = '' }: { content: string; className?: string }) {
  const blocks = parseMarkdown(content);
  const jumbo = isJumbo(blocks);
  return (
    <div className={`md selectable break-words ${jumbo ? 'jumbo' : ''} ${className}`}>
      {blocks.map((b, i) => <BlockNode key={i} b={b} />)}
    </div>
  );
}
