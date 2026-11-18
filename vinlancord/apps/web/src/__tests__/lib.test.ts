import { describe, expect, it } from 'vitest';
import { formatAccelerator, matches, toElectron } from '../lib/keybinds';
import { THEMES, contrastText, validateCustomTheme, normalizeAppearance, paletteFrom, sanitizeCss, DISPLAY_FONTS, BODY_FONTS } from '../lib/themes';
import { searchEmojis, type EmojiData } from '../lib/emoji';
import { elapsed, initials, roman, staticImage } from '../lib/format';

const key = (k: Partial<KeyboardEvent>) => ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, key: '', code: '', ...k }) as KeyboardEvent;

describe('atalhos', () => {
  it('formata e reconhece combinações', () => {
    const e = key({ ctrlKey: true, shiftKey: true, key: 'm', code: 'KeyM' });
    expect(formatAccelerator(e)).toBe('Ctrl+Shift+M');
    expect(matches(e, 'Ctrl+Shift+M')).toBe(true);
    expect(matches(e, 'Ctrl+M')).toBe(false);
  });
  it('aperte-para-falar usa a tecla física', () => {
    expect(formatAccelerator(key({ key: 'v', code: 'KeyV' }), true)).toBe('KeyV');
    expect(matches(key({ key: 'v', code: 'KeyV' }), 'KeyV')).toBe(true);
  });
  it('converte para o formato do Electron', () => {
    expect(toElectron('Ctrl+Alt+ArrowUp')).toBe('CommandOrControl+Alt+Up');
  });
});

describe('temas', () => {
  it('biblioteca tem temas claros e escuros', () => {
    expect(THEMES.some((t) => t.mode === 'light')).toBe(true);
    expect(THEMES.some((t) => t.mode === 'dark')).toBe(true);
  });
  it('valida temas importados e descarta cores inválidas', () => {
    const t = validateCustomTheme({ name: 'Meu Tema', mode: 'dark', colors: { 'bg-0': '#000000', 'bg-1': '#111111', 'bg-2': '#222222', 'bg-3': '#333333', 'text-0': '#ffffff', 'text-1': '#eeeeee', 'bg-4': 'url(javascript:1)' } });
    expect(t.id).toBe('custom-meu-tema');
    expect(t.colors['bg-4']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(() => validateCustomTheme({ name: 'x', colors: {} })).toThrow();
  });
  it('escolhe texto legível sobre a cor de destaque', () => {
    expect(contrastText('#ffffff')).toBe('#111');
    expect(contrastText('#7c5cff')).toBe('#fff');
  });
  it('toda estética é completa e usa fontes do catálogo', () => {
    for (const t of THEMES) {
      expect(new Set(THEMES.map((x) => x.id)).size).toBe(THEMES.length);
      for (const k of ['bg-0', 'bg-1', 'bg-2', 'bg-3', 'bg-4', 'bg-5', 'border', 'border-strong', 'text-0', 'text-1', 'text-2', 'accent', 'accent-2']) {
        expect(t.colors[k], `${t.id}.${k}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(DISPLAY_FONTS.some((f) => f.id === t.appearance.displayFont)).toBe(true);
      expect(BODY_FONTS.some((f) => f.id === t.appearance.bodyFont)).toBe(true);
      expect(t.appearance.preset).toBe(t.id);
    }
  });
  it('completa aparências parciais com o preset', () => {
    const a = normalizeAppearance({ preset: 'muralha', colors: { accent: '#123456' } });
    expect(a.colors.accent).toBe('#123456');
    expect(a.colors['bg-0']).toBe(THEMES.find((t) => t.id === 'muralha')!.colors['bg-0']);
    expect(a.serverShape).toBe('shield');
    expect(normalizeAppearance({ preset: 'nao-existe' }).preset).toBe('nao-existe');
  });
  it('gera paletas válidas a partir de uma cor', () => {
    for (const mode of ['dark', 'light'] as const) {
      const p = paletteFrom('#c1121f', mode);
      for (const v of Object.values(p)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.accent).toBe('#c1121f');
    }
  });
  it('importa estética completa e ignora valores fora do permitido', () => {
    const t = validateCustomTheme({
      name: 'Corvo',
      appearance: { mode: 'dark', colors: THEMES[0]!.colors, effect: 'feathers', serverShape: 'hexagon', blur: 999, corners: 'zigzag', customCss: 'a{}' },
    });
    expect(t.appearance.effect).toBe('feathers');
    expect(t.appearance.serverShape).toBe('hexagon');
    expect(t.appearance.blur).toBeLessThanOrEqual(32);
    expect(['round', 'soft', 'sharp', 'cut']).toContain(t.appearance.corners);
    expect(t.appearance.customCss).toBe('a{}');
  });
  it('CSS personalizado não carrega nada externo', () => {
    const css = sanitizeCss(`@import url(https://x.y/a.css); body{background:url("https://evil/p.png")} .a{background:u\\72l(http://x)} .b{background:image-set("http://x" 1x)} .c{background:url(data:image/png;base64,AA)}`);
    expect(css).not.toMatch(/https?:/);
    expect(css).not.toContain('@import');
    expect(css).toContain('url(data:image/png;base64,AA)');
  });
});

describe('utilitários', () => {
  it('numerais romanos dos capítulos', () => {
    expect([1, 4, 9, 14, 40, 90, 400, 1994].map(roman)).toEqual(['I', 'IV', 'IX', 'XIV', 'XL', 'XC', 'CD', 'MCMXCIV']);
    expect(roman(0)).toBe('0');
  });
  it('emoji: busca por rótulo e tags, sem acento', () => {
    const list: EmojiData[] = [
      { unicode: '😂', label: 'rosto chorando de rir', tags: ['risada'], group: 0 },
      { unicode: '🍕', label: 'pizza', tags: ['comida'], group: 4 },
    ];
    expect(searchEmojis(list, 'risada').map((e) => e.unicode)).toEqual(['😂']);
    expect(searchEmojis(list, 'PIZ').map((e) => e.unicode)).toEqual(['🍕']);
  });
  it('formatação', () => {
    expect(initials('Ana Beatriz')).toBe('AB');
    expect(elapsed(Date.now() - 65_000)).toBe('1:05');
    expect(staticImage('https://x/files/public/avatars/1/a_abc.webp')).toBe('https://x/files/public/avatars/1/a_abc.static.webp');
    expect(staticImage('https://x/files/public/avatars/1/abc.webp')).toBe('https://x/files/public/avatars/1/abc.webp');
  });
});
