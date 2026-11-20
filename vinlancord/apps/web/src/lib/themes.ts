/**
 * Motor de aparência do Vinlancord.
 *
 * Cada estética (preset) define TUDO: cores, tipografia, formas, atmosfera
 * (efeitos de fundo), transições e estilo das mensagens. O usuário parte de um
 * preset e personaliza qualquer detalhe no Estúdio de Aparência.
 */
import type { Appearance } from '@vinlancord/shared';

export type { Appearance };

export const COLOR_TOKENS = [
  { key: 'bg-0', label: 'Cenário (fundo do app)', group: 'Fundos' },
  { key: 'bg-1', label: 'Painéis laterais', group: 'Fundos' },
  { key: 'bg-2', label: 'Painel principal', group: 'Fundos' },
  { key: 'bg-3', label: 'Campos e cartões', group: 'Fundos' },
  { key: 'bg-4', label: 'Destaque ao passar o mouse', group: 'Fundos' },
  { key: 'bg-5', label: 'Elementos fortes', group: 'Fundos' },
  { key: 'border', label: 'Bordas', group: 'Linhas' },
  { key: 'border-strong', label: 'Bordas fortes', group: 'Linhas' },
  { key: 'text-0', label: 'Texto principal', group: 'Texto' },
  { key: 'text-1', label: 'Texto secundário', group: 'Texto' },
  { key: 'text-2', label: 'Texto apagado', group: 'Texto' },
  { key: 'accent', label: 'Destaque principal', group: 'Destaque' },
  { key: 'accent-2', label: 'Destaque secundário', group: 'Destaque' },
  { key: 'success', label: 'Sucesso / online', group: 'Estados' },
  { key: 'warning', label: 'Aviso / ausente', group: 'Estados' },
  { key: 'danger', label: 'Perigo / ocupado', group: 'Estados' },
] as const;

export interface FontDef {
  id: string;
  label: string;
  family: string;
  hint: string;
  /** Alternativa mais legível para títulos pequenos (cabeçalhos, nomes). */
  heading?: string;
}

export const DISPLAY_FONTS: FontDef[] = [
  { id: 'grotesk', label: 'Grotesca moderna', family: "'Space Grotesk Variable', 'Inter Variable', sans-serif", hint: 'Limpa e tecnológica' },
  { id: 'unifraktur', label: 'Gótica', family: "'UnifrakturMaguntia', 'Pirata One', serif", hint: 'Manuscrito sombrio', heading: "'Pirata One', 'UnifrakturMaguntia', serif" },
  { id: 'pirata', label: 'Gótica afiada', family: "'Pirata One', 'UnifrakturMaguntia', serif", hint: 'Gótica mais legível' },
  { id: 'cinzel', label: 'Imperial', family: "'Cinzel Variable', 'Cormorant Garamond Variable', serif", hint: 'Inscrições romanas' },
  { id: 'oswald', label: 'Militar', family: "'Oswald Variable', 'Inter Variable', sans-serif", hint: 'Condensada e firme' },
  { id: 'blackops', label: 'Estêncil', family: "'Black Ops One', 'Oswald Variable', sans-serif", hint: 'Pintada em caixotes' },
  { id: 'cormorant', label: 'Elegante', family: "'Cormorant Garamond Variable', serif", hint: 'Fina e dramática' },
  { id: 'imfell', label: 'Livro antigo', family: "'IM Fell English', 'EB Garamond Variable', serif", hint: 'Tipografia de prensa' },
  { id: 'typewriter', label: 'Dossiê', family: "'Special Elite', 'JetBrains Mono', monospace", hint: 'Máquina de escrever' },
  { id: 'inter', label: 'Neutra', family: "'Inter Variable', system-ui, sans-serif", hint: 'Discreta' },
];

export const BODY_FONTS: FontDef[] = [
  { id: 'inter', label: 'Inter', family: "'Inter Variable', 'Segoe UI', system-ui, sans-serif", hint: 'Máxima legibilidade' },
  { id: 'garamond', label: 'Garamond', family: "'EB Garamond Variable', Georgia, serif", hint: 'Serifada clássica' },
  { id: 'cormorant', label: 'Cormorant', family: "'Cormorant Garamond Variable', Georgia, serif", hint: 'Serifada dramática' },
  { id: 'imfell', label: 'Livro antigo', family: "'IM Fell English', Georgia, serif", hint: 'Página envelhecida' },
  { id: 'oswald', label: 'Condensada', family: "'Oswald Variable', 'Inter Variable', sans-serif", hint: 'Compacta' },
  { id: 'typewriter', label: 'Máquina de escrever', family: "'Special Elite', monospace", hint: 'Relatório confidencial' },
  { id: 'mono', label: 'Monoespaçada', family: "'JetBrains Mono', Consolas, monospace", hint: 'Terminal' },
  { id: 'system', label: 'Do sistema', family: "system-ui, 'Segoe UI', sans-serif", hint: 'Fonte do seu SO' },
];

export const fontFamily = (list: FontDef[], id: string) => (list.find((f) => f.id === id) ?? list[0]!).family;

export interface ThemeDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  mode: 'dark' | 'light';
  colors: Record<string, string>;
  preview: [string, string, string];
  appearance: Appearance;
}

const BASE: Omit<Appearance, 'preset' | 'mode' | 'colors'> = {
  displayFont: 'grotesk',
  bodyFont: 'inter',
  corners: 'round',
  serverShape: 'squircle',
  avatarShape: 'circle',
  layout: 'floating',
  panelOpacity: 0.86,
  blur: 12,
  glow: 0.5,
  ornaments: false,
  effect: 'none',
  effectIntensity: 1,
  fog: false,
  grain: 0.15,
  vignette: 0.4,
  scanlines: false,
  transition: 'rise',
  animations: 'full',
  animSpeed: 1,
  messageStyle: 'flat',
  chapterNumbers: false,
  cursorTrail: false,
  bgDim: 0.55,
  bgBlur: 6,
  customCss: '',
};

function preset(
  id: string,
  name: string,
  tagline: string,
  description: string,
  mode: 'dark' | 'light',
  colors: Record<string, string>,
  over: Partial<Appearance>,
): ThemeDef {
  const appearance: Appearance = { ...BASE, ...over, preset: id, mode, colors };
  return { id, name, tagline, description, mode, colors, preview: [colors['bg-1']!, colors['bg-2']!, colors.accent!], appearance };
}

const STATES_DARK = { success: '#3fb37f', warning: '#e0a43b', danger: '#ff3b4e' };

export const THEMES: ThemeDef[] = [
  preset(
    'caderno',
    'Caderno Negro',
    'Gótico · tinta · penas',
    'Preto absoluto, papel envelhecido e vermelho-sangue. Penas caem enquanto você conversa.',
    'dark',
    {
      'bg-0': '#040405', 'bg-1': '#0a0a0c', 'bg-2': '#0e0e11', 'bg-3': '#151518', 'bg-4': '#1d1d22', 'bg-5': '#29292f',
      border: '#1b1b20', 'border-strong': '#33313a', 'text-0': '#ece5d6', 'text-1': '#b8afa0', 'text-2': '#7a7368',
      accent: '#c1121f', 'accent-2': '#e9dcc0', ...STATES_DARK,
    },
    {
      displayFont: 'unifraktur', bodyFont: 'garamond', corners: 'sharp', serverShape: 'diamond', avatarShape: 'circle',
      panelOpacity: 0.8, blur: 10, glow: 0.65, ornaments: true, effect: 'feathers', effectIntensity: 1, fog: true,
      grain: 0.35, vignette: 0.75, transition: 'ink', messageStyle: 'letter', chapterNumbers: true,
    },
  ),
  preset(
    'muralha',
    'Muralha',
    'Militar · brasas · aço',
    'Couro, aço e fumaça. Brasas sobem do chão como depois de uma batalha perdida.',
    'dark',
    {
      'bg-0': '#0b0907', 'bg-1': '#13100c', 'bg-2': '#191510', 'bg-3': '#221d16', 'bg-4': '#2c251c', 'bg-5': '#3a3024',
      border: '#2a2219', 'border-strong': '#433727', 'text-0': '#efe5d3', 'text-1': '#c4b69b', 'text-2': '#8c7e66',
      accent: '#e07a2e', 'accent-2': '#8fa36b', success: '#8fa36b', warning: '#e0a43b', danger: '#e2412b',
    },
    {
      displayFont: 'oswald', bodyFont: 'inter', corners: 'cut', serverShape: 'shield', avatarShape: 'squircle',
      panelOpacity: 0.84, blur: 8, glow: 0.55, ornaments: true, effect: 'embers', effectIntensity: 1.1, fog: true,
      grain: 0.3, vignette: 0.65, transition: 'shutter', messageStyle: 'cards',
    },
  ),
  preset(
    'rebeliao',
    'Rebelião',
    'Imperial · ouro · sigilos',
    'Púrpura real, ouro e carmesim. Sigilos geométricos giram no fundo como num xadrez de reis.',
    'dark',
    {
      'bg-0': '#06030b', 'bg-1': '#0d0715', 'bg-2': '#120a1c', 'bg-3': '#1a1027', 'bg-4': '#241634', 'bg-5': '#311f45',
      border: '#22152e', 'border-strong': '#3d2858', 'text-0': '#f3ecff', 'text-1': '#c6b7de', 'text-2': '#8b7ba7',
      accent: '#d9b44a', 'accent-2': '#c8143f', ...STATES_DARK,
    },
    {
      displayFont: 'cinzel', bodyFont: 'inter', corners: 'cut', serverShape: 'hexagon', avatarShape: 'hexagon',
      panelOpacity: 0.82, blur: 14, glow: 0.85, ornaments: true, effect: 'sigils', effectIntensity: 1, fog: false,
      grain: 0.15, vignette: 0.55, scanlines: true, transition: 'slash', messageStyle: 'flat',
    },
  ),
  preset(
    'lua',
    'Lua Carmesim',
    'Noite vermelha · pétalas',
    'Uma lua de sangue sobre o preto. Pétalas carmesim caem devagar.',
    'dark',
    {
      'bg-0': '#070203', 'bg-1': '#0e0506', 'bg-2': '#140809', 'bg-3': '#1d0c0e', 'bg-4': '#291114', 'bg-5': '#38171b',
      border: '#26100f', 'border-strong': '#47191d', 'text-0': '#ffe9ec', 'text-1': '#dcb2b8', 'text-2': '#9b7177',
      accent: '#ff2d55', 'accent-2': '#ffb3c1', ...STATES_DARK,
    },
    {
      displayFont: 'pirata', bodyFont: 'inter', corners: 'soft', serverShape: 'circle', avatarShape: 'circle',
      panelOpacity: 0.78, blur: 16, glow: 0.8, ornaments: true, effect: 'petals', effectIntensity: 1, fog: true,
      grain: 0.2, vignette: 0.8, transition: 'ink', messageStyle: 'flat',
    },
  ),
  preset(
    'aco',
    'Aço Frio',
    'HUD · chuva · neon',
    'Interface de cabine: ciano frio, chuva na janela e linhas de varredura.',
    'dark',
    {
      'bg-0': '#03060a', 'bg-1': '#070c12', 'bg-2': '#0a1119', 'bg-3': '#101a24', 'bg-4': '#162330', 'bg-5': '#1f3040',
      border: '#122030', 'border-strong': '#1f3a52', 'text-0': '#e4f6ff', 'text-1': '#a7c4d4', 'text-2': '#6b8798',
      accent: '#22d3ee', 'accent-2': '#ff3864', ...STATES_DARK,
    },
    {
      displayFont: 'oswald', bodyFont: 'inter', corners: 'cut', serverShape: 'hexagon', avatarShape: 'squircle',
      panelOpacity: 0.8, blur: 12, glow: 0.9, ornaments: true, effect: 'rain', effectIntensity: 1, fog: false,
      grain: 0.1, vignette: 0.5, scanlines: true, transition: 'slash', messageStyle: 'cards',
    },
  ),
  preset(
    'nebula',
    'Nebulosa',
    'Clássico Vinlancord',
    'O visual original: grafite profundo, violeta e ciano, com estrelas ao fundo.',
    'dark',
    {
      'bg-0': '#08080c', 'bg-1': '#0e0e14', 'bg-2': '#13131a', 'bg-3': '#1a1a23', 'bg-4': '#22222d', 'bg-5': '#2b2b38',
      border: '#23232e', 'border-strong': '#33333f', 'text-0': '#f2f2f7', 'text-1': '#b9b9c8', 'text-2': '#7d7d90',
      accent: '#7c5cff', 'accent-2': '#22d3ee', success: '#23c55e', warning: '#f5a524', danger: '#f04459',
    },
    { effect: 'stars', effectIntensity: 0.8, grain: 0.08, vignette: 0.35 },
  ),
  preset(
    'grafite',
    'Grafite',
    'Neutro · foco',
    'Cinzas sóbrios e nenhuma distração. Para quem quer só conversar.',
    'dark',
    {
      'bg-0': '#111214', 'bg-1': '#17181b', 'bg-2': '#1d1e22', 'bg-3': '#25262b', 'bg-4': '#2d2f35', 'bg-5': '#373940',
      border: '#2a2c31', 'border-strong': '#3a3c43', 'text-0': '#f2f3f5', 'text-1': '#c2c4cc', 'text-2': '#868892',
      accent: '#3b82f6', 'accent-2': '#60a5fa', success: '#23c55e', warning: '#f5a524', danger: '#f04459',
    },
    { layout: 'classic', panelOpacity: 1, blur: 0, glow: 0.2, grain: 0, vignette: 0, transition: 'fade' },
  ),
  preset(
    'pergaminho',
    'Pergaminho',
    'Claro · papel · cera',
    'Papel envelhecido, tinta preta e selo de cera vermelho. Elegante à luz do dia.',
    'light',
    {
      'bg-0': '#d6c8aa', 'bg-1': '#e5d9bf', 'bg-2': '#f1e8d3', 'bg-3': '#e9dec6', 'bg-4': '#dfd2b5', 'bg-5': '#cdbd9b',
      border: '#d0c1a1', 'border-strong': '#b5a37e', 'text-0': '#1d150e', 'text-1': '#4a3b2b', 'text-2': '#7a6a53',
      accent: '#8b1a1a', 'accent-2': '#2f4b3a', success: '#3d7a4f', warning: '#a86b16', danger: '#a3122a',
    },
    {
      displayFont: 'imfell', bodyFont: 'garamond', corners: 'soft', serverShape: 'shield', avatarShape: 'circle',
      panelOpacity: 0.9, blur: 6, glow: 0.3, ornaments: true, effect: 'ink', effectIntensity: 0.7, grain: 0.4, vignette: 0.45,
      transition: 'ink', messageStyle: 'letter', chapterNumbers: true,
    },
  ),
  preset(
    'claro',
    'Claro',
    'Limpo · luminoso',
    'Branco e luminoso, para ambientes bem iluminados.',
    'light',
    {
      'bg-0': '#dfe1e8', 'bg-1': '#eef0f4', 'bg-2': '#ffffff', 'bg-3': '#f3f4f7', 'bg-4': '#e8e9ef', 'bg-5': '#d9dbe3',
      border: '#e1e3ea', 'border-strong': '#cfd2dc', 'text-0': '#15151c', 'text-1': '#4a4b5a', 'text-2': '#7b7d8c',
      accent: '#7c5cff', 'accent-2': '#0891b2', success: '#16a34a', warning: '#d97706', danger: '#e11d48',
    },
    { glow: 0.25, grain: 0, vignette: 0.15, effect: 'none' },
  ),
];

/** Estética exclusiva da conta criadora (não aparece na galeria para os outros). */
export const CREATOR_THEME: ThemeDef = preset(
  'lord',
  'Lord of Freedom',
  'Exclusiva do criador',
  'Preto absoluto e ouro vivo, brasas douradas subindo. Só a conta criadora tem.',
  'dark',
  {
    'bg-0': '#050403', 'bg-1': '#0b0906', 'bg-2': '#100d08', 'bg-3': '#18130c', 'bg-4': '#221b10', 'bg-5': '#302616',
    border: '#211a0f', 'border-strong': '#4a3a1c', 'text-0': '#fff6dc', 'text-1': '#e2cfa0', 'text-2': '#a08c62',
    accent: '#e8b931', 'accent-2': '#fff1b8', success: '#3fb37f', warning: '#f0a020', danger: '#ff3b4e',
  },
  {
    displayFont: 'cinzel', bodyFont: 'garamond', corners: 'cut', serverShape: 'shield', avatarShape: 'hexagon',
    panelOpacity: 0.8, blur: 12, glow: 1, ornaments: true, effect: 'embers', effectIntensity: 1.2, fog: true,
    grain: 0.25, vignette: 0.7, transition: 'slash', messageStyle: 'letter', chapterNumbers: true,
  },
);

export const DEFAULT_PRESET = 'caderno';

export const ACCENTS = ['#c1121f', '#ff2d55', '#e07a2e', '#d9b44a', '#8fa36b', '#22d3ee', '#3b82f6', '#7c5cff', '#a855f7', '#ec4899', '#e9dcc0'];

export function findTheme(id: string, custom: ThemeDef[] = []): ThemeDef {
  return [...THEMES, CREATOR_THEME, ...custom].find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_PRESET)!;
}

/** Garante uma aparência completa (preenche campos que faltam com o preset). */
export function normalizeAppearance(a: Partial<Appearance> | null | undefined, custom: ThemeDef[] = []): Appearance {
  const base = findTheme(a?.preset ?? DEFAULT_PRESET, custom).appearance;
  return { ...base, ...(a ?? {}), colors: { ...base.colors, ...(a?.colors ?? {}) } } as Appearance;
}

export function contrastText(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#fff';
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#111' : '#fff';
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function hsl(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function hueOf(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

/** Gera uma paleta completa e harmônica a partir de uma cor (botão "Gerar paleta"). */
export function paletteFrom(accent: string, mode: 'dark' | 'light'): Record<string, string> {
  const h = hueOf(accent);
  if (mode === 'dark')
    return {
      'bg-0': hsl(h, 22, 3), 'bg-1': hsl(h, 20, 5.5), 'bg-2': hsl(h, 18, 7.5), 'bg-3': hsl(h, 16, 10.5), 'bg-4': hsl(h, 15, 14), 'bg-5': hsl(h, 14, 19),
      border: hsl(h, 16, 12), 'border-strong': hsl(h, 16, 22), 'text-0': hsl(h, 30, 94), 'text-1': hsl(h, 14, 74), 'text-2': hsl(h, 10, 50),
      accent, 'accent-2': hsl((h + 180) % 360, 70, 65),
    };
  return {
    'bg-0': hsl(h, 22, 82), 'bg-1': hsl(h, 25, 90), 'bg-2': hsl(h, 30, 96), 'bg-3': hsl(h, 25, 92), 'bg-4': hsl(h, 20, 87), 'bg-5': hsl(h, 18, 78),
    border: hsl(h, 18, 84), 'border-strong': hsl(h, 16, 72), 'text-0': hsl(h, 30, 8), 'text-1': hsl(h, 15, 28), 'text-2': hsl(h, 10, 45),
    accent, 'accent-2': hsl((h + 180) % 360, 60, 35),
  };
}

let customCssEl: HTMLStyleElement | null = null;

/** Aplica a aparência ao documento (variáveis CSS + atributos) — instantâneo. */
export function applyAppearance(a: Appearance, opts: { fontScale?: number; reduceMotion?: boolean } = {}) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(a.colors)) if (/^#[0-9a-f]{6}$/i.test(v)) root.style.setProperty(`--vl-${k}`, v);
  const accent = a.colors.accent ?? '#7c5cff';
  root.style.setProperty('--vl-accent-fg', contrastText(accent));
  const display = DISPLAY_FONTS.find((f) => f.id === a.displayFont) ?? DISPLAY_FONTS[0]!;
  root.style.setProperty('--vl-font-display', display.family);
  root.style.setProperty('--vl-font-heading', display.heading ?? display.family);
  root.style.setProperty('--vl-font-body', fontFamily(BODY_FONTS, a.bodyFont));
  root.style.setProperty('--vl-font-scale', String(opts.fontScale ?? 1));
  const radius = { round: 12, soft: 7, sharp: 0, cut: 0 }[a.corners];
  root.style.setProperty('--vl-radius', `${radius}px`);
  root.style.setProperty('--vl-cut', a.corners === 'cut' ? '12px' : '0px');
  root.style.setProperty('--vl-panel-alpha', `${Math.round(a.panelOpacity * 100)}%`);
  root.style.setProperty('--vl-blur', `${a.blur}px`);
  root.style.setProperty('--vl-glow', String(a.glow));
  root.style.setProperty('--vl-glow-color', rgba(accent, Math.min(0.85, a.glow * 0.7)));
  root.style.setProperty('--vl-amb-1', rgba(accent, a.glow * (a.mode === 'dark' ? 0.24 : 0.14)));
  root.style.setProperty('--vl-amb-2', rgba(a.colors['accent-2'] ?? accent, a.glow * (a.mode === 'dark' ? 0.12 : 0.1)));
  const off = a.animations === 'off' || opts.reduceMotion;
  root.style.setProperty('--vl-speed', String(off ? 1 : a.animSpeed));
  root.style.setProperty('--vl-dur-mult', String(off ? 0.001 : 1 / a.animSpeed));
  root.style.setProperty(
    '--vl-shadow',
    a.mode === 'dark' ? `0 18px 50px -12px rgb(0 0 0 / 0.7), 0 0 ${Math.round(40 * a.glow)}px -18px ${rgba(accent, 0.6)}` : '0 14px 34px -12px rgb(20 20 40 / 0.22)',
  );
  root.classList.toggle('dark', a.mode === 'dark');
  root.classList.toggle('light', a.mode === 'light');
  root.classList.toggle('reduce-motion', !!off);
  const d = root.dataset;
  d.layout = a.layout;
  d.corners = a.corners;
  d.serverShape = a.serverShape;
  d.avatarShape = a.avatarShape;
  d.ornaments = String(a.ornaments);
  d.transition = off ? 'none' : a.transition;
  d.anim = off ? 'off' : a.animations;
  d.msg = a.messageStyle;
  d.preset = a.preset;
  if (!customCssEl) {
    customCssEl = document.createElement('style');
    customCssEl.id = 'vl-custom-css';
    document.head.appendChild(customCssEl);
  }
  customCssEl.textContent = sanitizeCss(a.customCss ?? '');
}

/**
 * CSS personalizado é só visual: remove @import e qualquer url() que não seja
 * data: — um tema importado não pode carregar nada da internet (evita vazar IP).
 */
export function sanitizeCss(css: string) {
  return css
    .slice(0, 20_000)
    .replace(/\\/g, '') // sem escapes (impede "u\\72l(" disfarçado)
    .replace(/@import[^;]*;?/gi, '')
    .replace(/(-webkit-)?image-set\(/gi, 'none(')
    .replace(/url\(\s*(['"]?)(?!data:)[^)]*\)/gi, 'none')
    .replace(/[a-z][a-z0-9+.-]*:\/\//gi, '')
    .replace(/<\/?style/gi, '');
}

/** Compatibilidade: aplica um preset pelo id. */
export function applyTheme(opts: { theme: string; mode?: string; accent?: string; fontScale: number; reduceMotion: boolean; custom?: ThemeDef[] }) {
  const t = findTheme(opts.theme, opts.custom);
  applyAppearance(t.appearance, opts);
}

/** Importa um tema exportado (formato novo com `appearance` ou antigo com `colors`). */
export function validateCustomTheme(raw: unknown): ThemeDef {
  const t = raw as { name?: unknown; mode?: unknown; colors?: unknown; appearance?: Partial<Appearance> };
  if (!t || typeof t !== 'object' || typeof t.name !== 'string') throw new Error('Arquivo de tema inválido.');
  const srcColors = (t.appearance?.colors ?? t.colors) as Record<string, unknown> | undefined;
  if (!srcColors || typeof srcColors !== 'object') throw new Error('Arquivo de tema inválido.');
  const colors: Record<string, string> = {};
  for (const { key } of COLOR_TOKENS) {
    const v = srcColors[key];
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) colors[key] = v;
  }
  if (Object.keys(colors).length < 6) throw new Error('O tema precisa definir ao menos 6 cores válidas.');
  const mode = (t.appearance?.mode ?? t.mode) === 'light' ? 'light' : 'dark';
  const base = (mode === 'dark' ? findTheme('nebula') : findTheme('claro')).appearance;
  const id = `custom-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`;
  const a = t.appearance ?? {};
  const pick = <K extends keyof Appearance>(k: K, ok: (v: unknown) => boolean): Partial<Appearance> => (ok(a[k]) ? { [k]: a[k] } : {});
  const isOneOf = (list: readonly string[]) => (v: unknown) => typeof v === 'string' && list.includes(v);
  const isNum = (min: number, max: number) => (v: unknown) => typeof v === 'number' && v >= min && v <= max;
  const isBool = (v: unknown) => typeof v === 'boolean';
  const appearance: Appearance = {
    ...base,
    ...pick('displayFont', isOneOf(DISPLAY_FONTS.map((f) => f.id))),
    ...pick('bodyFont', isOneOf(BODY_FONTS.map((f) => f.id))),
    ...pick('corners', isOneOf(['round', 'soft', 'sharp', 'cut'])),
    ...pick('serverShape', isOneOf(['circle', 'squircle', 'diamond', 'hexagon', 'shield'])),
    ...pick('avatarShape', isOneOf(['circle', 'squircle', 'diamond', 'hexagon', 'shield'])),
    ...pick('layout', isOneOf(['floating', 'classic'])),
    ...pick('effect', isOneOf(['none', 'feathers', 'ink', 'embers', 'ash', 'sigils', 'snow', 'rain', 'petals', 'stars'])),
    ...pick('transition', isOneOf(['none', 'fade', 'rise', 'slash', 'ink', 'shutter'])),
    ...pick('messageStyle', isOneOf(['flat', 'cards', 'letter'])),
    ...pick('panelOpacity', isNum(0.3, 1)),
    ...pick('blur', isNum(0, 32)),
    ...pick('glow', isNum(0, 1)),
    ...pick('effectIntensity', isNum(0, 2)),
    ...pick('grain', isNum(0, 1)),
    ...pick('vignette', isNum(0, 1)),
    ...pick('ornaments', isBool),
    ...pick('fog', isBool),
    ...pick('scanlines', isBool),
    ...pick('chapterNumbers', isBool),
    ...(typeof a.customCss === 'string' ? { customCss: a.customCss.slice(0, 20_000) } : {}),
    preset: id,
    mode,
    colors: { ...base.colors, ...colors },
  };
  return {
    id,
    name: t.name.slice(0, 32),
    tagline: 'Tema personalizado',
    description: 'Criado no Estúdio de Aparência.',
    mode,
    colors: appearance.colors,
    preview: [appearance.colors['bg-1']!, appearance.colors['bg-2']!, appearance.colors.accent!],
    appearance,
  };
}

const CACHE_KEY = 'vl:appearance-cache';
export function cacheAppearance(a: Appearance) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(a));
  } catch {
    /* sem espaço */
  }
}
export function cachedAppearance(): Appearance | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalizeAppearance(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
