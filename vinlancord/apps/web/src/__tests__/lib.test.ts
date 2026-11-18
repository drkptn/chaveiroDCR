import { describe, expect, it } from 'vitest';
import { formatAccelerator, matches, toElectron } from '../lib/keybinds';
import { THEMES, contrastText, validateCustomTheme } from '../lib/themes';
import { searchEmojis, type EmojiData } from '../lib/emoji';
import { elapsed, initials, staticImage } from '../lib/format';

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
});

describe('utilitários', () => {
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
