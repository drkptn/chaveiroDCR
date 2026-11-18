import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown, MarkdownContext, isJumbo, parseInline, parseMarkdown, type MarkdownResolvers } from '../lib/markdown';

const resolvers: MarkdownResolvers = {
  user: (id) => (id === '1175218050102722560' ? { name: 'Beto' } : null),
  role: () => ({ name: 'Moderador', color: '#7c5cff' }),
  channel: () => ({ name: 'geral' }),
  emojiUrl: (id) => `https://x/${id}.webp`,
};

function renderMd(content: string) {
  return render(
    <MarkdownContext.Provider value={resolvers}>
      <Markdown content={content} />
    </MarkdownContext.Provider>,
  );
}

describe('markdown', () => {
  it('formata negrito, itálico, sublinhado, tachado e código', () => {
    const { container } = renderMd('**n** *i* __s__ ~~t~~ `c`');
    expect(container.querySelector('strong')?.textContent).toBe('n');
    expect(container.querySelector('em')?.textContent).toBe('i');
    expect(container.querySelector('u')?.textContent).toBe('s');
    expect(container.querySelector('s')?.textContent).toBe('t');
    expect(container.querySelector('code.inline')?.textContent).toBe('c');
  });

  it('nunca injeta HTML (proteção contra XSS)', () => {
    const { container } = renderMd('<img src=x onerror=alert(1)> <script>alert(1)</script>');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('só aceita links http(s)', () => {
    const { container } = renderMd('[clique](javascript:alert(1)) e https://exemplo.com.br/a?b=1.');
    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('https://exemplo.com.br/a?b=1');
  });

  it('blocos de código, citações e listas', () => {
    const blocks = parseMarkdown('```ts\nconst a = 1;\n```\n> citação\n- um\n- dois\n1. primeiro');
    expect(blocks.map((b) => b.t)).toEqual(['pre', 'quote', 'list', 'list']);
    const pre = blocks[0] as { t: 'pre'; lang: string; v: string };
    expect(pre.lang).toBe('ts');
    expect(pre.v).toBe('const a = 1;');
  });

  it('não formata dentro de código', () => {
    const nodes = parseInline('`**não**`');
    expect(nodes).toEqual([{ t: 'code', v: '**não**' }]);
  });

  it('resolve menções, cargos, canais e emojis personalizados', () => {
    const { container } = renderMd('oi <@1175218050102722560> <@&1175218050102722561> <#1175218050102722562> <:kkk:1175218050102722563>');
    const mentions = [...container.querySelectorAll('.mention')].map((m) => m.textContent);
    expect(mentions).toEqual(['@Beto', '@Moderador', '#geral']);
    expect(container.querySelector('img.emoji')?.getAttribute('src')).toBe('https://x/1175218050102722563.webp');
  });

  it('spoiler e emojis grandes', () => {
    const { container } = renderMd('||segredo||');
    expect(container.querySelector('.spoiler')?.textContent).toBe('segredo');
    expect(isJumbo(parseMarkdown('🔥🔥 🎉'))).toBe(true);
    expect(isJumbo(parseMarkdown('oi 🔥'))).toBe(false);
  });
});
