/** Dados de emoji (emojibase, em português) carregados sob demanda. */
export interface EmojiData {
  unicode: string;
  label: string;
  tags: string[];
  group: number;
  skins?: string[];
}

export const EMOJI_GROUPS = [
  { id: 0, name: 'Carinhas e emoções', icon: '😀' },
  { id: 1, name: 'Pessoas', icon: '👋' },
  { id: 3, name: 'Animais e natureza', icon: '🐶' },
  { id: 4, name: 'Comidas e bebidas', icon: '🍔' },
  { id: 5, name: 'Viagens e lugares', icon: '✈️' },
  { id: 6, name: 'Atividades', icon: '⚽' },
  { id: 7, name: 'Objetos', icon: '💡' },
  { id: 8, name: 'Símbolos', icon: '💜' },
  { id: 9, name: 'Bandeiras', icon: '🏳️' },
];

let cache: Promise<EmojiData[]> | null = null;

export function loadEmojis(): Promise<EmojiData[]> {
  cache ??= import('emojibase-data/pt/compact.json').then((mod) => {
    const raw = (mod.default ?? mod) as unknown as {
      unicode: string;
      label: string;
      tags?: string[];
      group?: number;
      order?: number;
      skins?: { unicode: string }[];
    }[];
    return raw
      .filter((e) => typeof e.group === 'number' && e.group !== 2)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((e) => ({ unicode: e.unicode, label: e.label, tags: e.tags ?? [], group: e.group!, skins: e.skins?.map((s) => s.unicode) }));
  });
  return cache;
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function searchEmojis(list: EmojiData[], q: string, limit = 60): EmojiData[] {
  const n = norm(q.trim());
  if (!n) return [];
  const starts: EmojiData[] = [];
  const contains: EmojiData[] = [];
  for (const e of list) {
    const label = norm(e.label);
    if (label.startsWith(n) || e.tags.some((t) => norm(t).startsWith(n))) starts.push(e);
    else if (label.includes(n) || e.tags.some((t) => norm(t).includes(n))) contains.push(e);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
