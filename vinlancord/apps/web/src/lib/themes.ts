/** Biblioteca de temas. Cada tema define os tokens de cor (CSS vars). Temas personalizados podem ser importados em JSON. */
export interface ThemeDef {
  id: string;
  name: string;
  description: string;
  mode: 'dark' | 'light';
  colors: Record<string, string>;
  preview: [string, string, string];
}

const dark = (o: Partial<Record<string, string>>): Record<string, string> => ({
  'bg-0': '#08080c',
  'bg-1': '#0e0e14',
  'bg-2': '#13131a',
  'bg-3': '#1a1a23',
  'bg-4': '#22222d',
  'bg-5': '#2b2b38',
  border: '#23232e',
  'border-strong': '#33333f',
  'text-0': '#f2f2f7',
  'text-1': '#b9b9c8',
  'text-2': '#7d7d90',
  'accent-2': '#22d3ee',
  ...o,
} as Record<string, string>);

export const THEMES: ThemeDef[] = [
  {
    id: 'nebula',
    name: 'Nebulosa',
    description: 'O clássico do Vinlancord: grafite profundo com brilho violeta.',
    mode: 'dark',
    colors: dark({}),
    preview: ['#0e0e14', '#13131a', '#7c5cff'],
  },
  {
    id: 'grafite',
    name: 'Grafite',
    description: 'Cinzas neutros e sóbrios, para quem gosta de foco.',
    mode: 'dark',
    colors: dark({
      'bg-0': '#111214', 'bg-1': '#17181b', 'bg-2': '#1d1e22', 'bg-3': '#25262b', 'bg-4': '#2d2f35', 'bg-5': '#373940',
      border: '#2a2c31', 'border-strong': '#3a3c43', 'text-1': '#c2c4cc', 'text-2': '#868892', 'accent-2': '#60a5fa',
    }),
    preview: ['#17181b', '#1d1e22', '#3b82f6'],
  },
  {
    id: 'meianoite',
    name: 'Meia-noite',
    description: 'Preto absoluto (AMOLED). Economiza energia em telas OLED.',
    mode: 'dark',
    colors: dark({
      'bg-0': '#000000', 'bg-1': '#050507', 'bg-2': '#0a0a0d', 'bg-3': '#111116', 'bg-4': '#18181f', 'bg-5': '#222229',
      border: '#16161c', 'border-strong': '#24242c',
    }),
    preview: ['#000000', '#0a0a0d', '#a78bfa'],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Azul-petróleo com acentos ciano, como uma noite polar.',
    mode: 'dark',
    colors: dark({
      'bg-0': '#06100f', 'bg-1': '#0a1716', 'bg-2': '#0e1d1c', 'bg-3': '#132625', 'bg-4': '#1a302f', 'bg-5': '#223b39',
      border: '#17292a', 'border-strong': '#24393a', 'text-1': '#b5cfcc', 'text-2': '#76918e', 'accent-2': '#a78bfa',
    }),
    preview: ['#0a1716', '#0e1d1c', '#14b8a6'],
  },
  {
    id: 'brasa',
    name: 'Brasa',
    description: 'Tons quentes de carvão com acento laranja.',
    mode: 'dark',
    colors: dark({
      'bg-0': '#0d0a09', 'bg-1': '#14100e', 'bg-2': '#1a1512', 'bg-3': '#221b18', 'bg-4': '#2b231f', 'bg-5': '#352b26',
      border: '#2a211d', 'border-strong': '#3a2e28', 'text-1': '#d2c4bd', 'text-2': '#937f75', 'accent-2': '#fbbf24',
    }),
    preview: ['#14100e', '#1a1512', '#f97316'],
  },
  {
    id: 'claro',
    name: 'Claro',
    description: 'Limpo e luminoso, para ambientes iluminados.',
    mode: 'light',
    colors: {
      'bg-0': '#e7e8ee', 'bg-1': '#f0f1f5', 'bg-2': '#ffffff', 'bg-3': '#f3f4f7', 'bg-4': '#e8e9ef', 'bg-5': '#d9dbe3',
      border: '#e1e3ea', 'border-strong': '#cfd2dc', 'text-0': '#15151c', 'text-1': '#4a4b5a', 'text-2': '#7b7d8c', 'accent-2': '#0891b2',
    },
    preview: ['#f0f1f5', '#ffffff', '#7c5cff'],
  },
  {
    id: 'areia',
    name: 'Areia',
    description: 'Claro e acolhedor, com papel levemente bege.',
    mode: 'light',
    colors: {
      'bg-0': '#e9e4da', 'bg-1': '#f2eee6', 'bg-2': '#fbf9f4', 'bg-3': '#f3efe7', 'bg-4': '#e9e3d8', 'bg-5': '#dcd4c6',
      border: '#e4ddd1', 'border-strong': '#d2c9ba', 'text-0': '#1f1b16', 'text-1': '#544b40', 'text-2': '#867a6c', 'accent-2': '#0d9488',
    },
    preview: ['#f2eee6', '#fbf9f4', '#c2410c'],
  },
];

export const ACCENTS = ['#7c5cff', '#5865f2', '#3b82f6', '#06b6d4', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7'];

export function findTheme(id: string, custom: ThemeDef[] = []): ThemeDef {
  return [...THEMES, ...custom].find((t) => t.id === id) ?? THEMES[0]!;
}

function prefersDark() {
  return typeof matchMedia === 'undefined' || matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(opts: {
  theme: string;
  mode: 'dark' | 'light' | 'system';
  accent: string;
  fontScale: number;
  reduceMotion: boolean;
  custom?: ThemeDef[];
}) {
  let theme = findTheme(opts.theme, opts.custom);
  if (opts.mode !== 'system' && theme.mode !== opts.mode) {
    // modo forçado: usa o tema padrão daquele modo
    theme = THEMES.find((t) => t.mode === opts.mode) ?? theme;
  } else if (opts.mode === 'system') {
    const want = prefersDark() ? 'dark' : 'light';
    if (theme.mode !== want) theme = THEMES.find((t) => t.mode === want) ?? theme;
  }
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.colors)) root.style.setProperty(`--vl-${k}`, v);
  root.style.setProperty('--vl-accent', opts.accent);
  root.style.setProperty('--vl-accent-fg', contrastText(opts.accent));
  root.style.setProperty('--vl-font-scale', String(opts.fontScale));
  root.style.setProperty('--vl-shadow', theme.mode === 'dark' ? '0 12px 40px -8px rgb(0 0 0 / 0.55)' : '0 12px 32px -10px rgb(20 20 40 / 0.18)');
  root.classList.toggle('dark', theme.mode === 'dark');
  root.classList.toggle('light', theme.mode === 'light');
  root.classList.toggle('reduce-motion', opts.reduceMotion);
}

export function contrastText(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#fff';
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#111' : '#fff';
}

export function validateCustomTheme(raw: unknown): ThemeDef {
  const t = raw as Partial<ThemeDef>;
  if (!t || typeof t !== 'object' || typeof t.name !== 'string' || !t.colors || typeof t.colors !== 'object')
    throw new Error('Arquivo de tema inválido.');
  const colors: Record<string, string> = {};
  const allowed = ['bg-0', 'bg-1', 'bg-2', 'bg-3', 'bg-4', 'bg-5', 'border', 'border-strong', 'text-0', 'text-1', 'text-2', 'accent-2'];
  for (const k of allowed) {
    const v = (t.colors as Record<string, unknown>)[k];
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) colors[k] = v;
  }
  if (Object.keys(colors).length < 6) throw new Error('O tema precisa definir ao menos 6 cores válidas.');
  const mode = t.mode === 'light' ? 'light' : 'dark';
  const base = mode === 'dark' ? THEMES[0]!.colors : THEMES.find((x) => x.id === 'claro')!.colors;
  return {
    id: `custom-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
    name: t.name.slice(0, 32),
    description: 'Tema personalizado',
    mode,
    colors: { ...base, ...colors },
    preview: [colors['bg-1'] ?? base['bg-1']!, colors['bg-2'] ?? base['bg-2']!, '#7c5cff'],
  };
}
