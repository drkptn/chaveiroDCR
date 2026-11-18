/**
 * Estúdio de Aparência: escolha uma estética e personalize tudo — cores,
 * tipografia, formas, atmosfera (efeitos e fundo), animações e CSS próprio.
 * Cada mudança aplica na hora e é salva na conta (a imagem de fundo fica no dispositivo).
 */
import { useRef, useState, type ReactNode } from 'react';
import {
  Ban,
  Check,
  CloudRain,
  Download,
  Droplet,
  Feather,
  Flame,
  Flower2,
  Hexagon,
  ImagePlus,
  Play,
  RotateCcw,
  Save,
  Snowflake,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  Wind,
} from 'lucide-react';
import type { AmbientEffect, Appearance, CornerStyle, IconShape, MessageStyle, TransitionStyle } from '@vinlancord/shared';
import { useStore } from '../../store';
import { ui } from '../../store/ui';
import { useLocal, local } from '../../store/local';
import { updateSettings } from '../../store/actions';
import { useAppearance, editAppearance } from '../../store/appearance';
import { useBackground, prepareBackground, setBackgroundImage } from '../../lib/background';
import { usePerf, setForceFull } from '../../lib/perf';
import { ACCENTS, BODY_FONTS, COLOR_TOKENS, DISPLAY_FONTS, THEMES, paletteFrom, validateCustomTheme, type ThemeDef } from '../../lib/themes';
import { Avatar, Button, Input, Segmented, SettingRow, Slider, Switch, Textarea, cx } from '../ui';
import { SectionTitle, Card } from './SettingsLayout';

type Section = 'presets' | 'colors' | 'type' | 'shapes' | 'atmosphere' | 'motion' | 'css';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'presets', label: 'Estéticas' },
  { id: 'colors', label: 'Cores' },
  { id: 'type', label: 'Tipografia' },
  { id: 'shapes', label: 'Formas' },
  { id: 'atmosphere', label: 'Atmosfera' },
  { id: 'motion', label: 'Animações' },
  { id: 'css', label: 'CSS' },
];

function useEdit() {
  const a = useAppearance((s) => s.current);
  const set = (patch: Partial<Appearance>) => editAppearance({ ...a, ...patch });
  return [a, set] as const;
}

export default function AppearanceStudio() {
  const [section, setSection] = useState<Section>('presets');
  return (
    <>
      <SectionTitle sub="Escolha uma estética e mude o que quiser. Tudo aplica na hora e acompanha sua conta em todos os dispositivos.">Estúdio de Aparência</SectionTitle>
      <Preview />
      <div className="sticky top-0 z-10 -mx-2 mb-5 flex flex-wrap gap-1 bg-gradient-to-b from-bg-0/90 to-transparent px-2 pb-3 pt-1 backdrop-blur-sm" role="tablist">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={cx(
              'vl-cut-sm rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all',
              section === s.id ? 'border-accent bg-accent text-accent-fg shadow-[0_0_18px_-6px_var(--vl-glow-color)]' : 'border-line-strong text-fg-1 hover:border-accent/50 hover:text-fg',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div key={section} className="animate-slide-up">
        {section === 'presets' && <Presets />}
        {section === 'colors' && <Colors />}
        {section === 'type' && <Typography />}
        {section === 'shapes' && <Shapes />}
        {section === 'atmosphere' && <Atmosphere />}
        {section === 'motion' && <Motion />}
        {section === 'css' && <CustomCss />}
      </div>
    </>
  );
}

/* ───────────── pré-visualização ───────────── */

function Preview() {
  const me = useStore((s) => s.me);
  if (!me) return null;
  return (
    <div className="vl-panel mb-6 overflow-hidden rounded-2xl border border-line-strong">
      <div className="vl-header flex h-10 items-center gap-2 px-4 font-heading text-[15px] text-fg">
        <span className="text-accent">#</span> pré-visualização
      </div>
      <div className="flex gap-3 px-4 py-4">
        <Avatar userId={me.id} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="vl-msg-author font-semibold text-fg">{me.displayName}</span>
            <span className="text-xs text-fg-2">agora</span>
          </div>
          <div className="vl-msg-body md text-fg">
            <p>
              Assim fica a sua conversa com esta aparência. <span className="mention">@{me.username}</span>
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm">Botão principal</Button>
            <Button size="sm" variant="secondary">Secundário</Button>
            <Input className="h-8 max-w-[200px]" placeholder="Campo de texto" readOnly />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── estéticas ───────────── */

function PresetCard({ t, active, onPick, onDelete }: { t: ThemeDef; active: boolean; onPick: () => void; onDelete?: () => void }) {
  const c = t.colors;
  const display = DISPLAY_FONTS.find((f) => f.id === t.appearance.displayFont) ?? DISPLAY_FONTS[0]!;
  const body = BODY_FONTS.find((f) => f.id === t.appearance.bodyFont) ?? BODY_FONTS[0]!;
  return (
    <div className="group relative">
      <button
        onClick={onPick}
        className={cx(
          'vl-hover-lift vl-cut relative w-full overflow-hidden rounded-xl border-2 text-left',
          active ? 'border-accent shadow-[0_0_30px_-10px_var(--vl-glow-color)]' : 'border-line hover:border-line-strong',
        )}
        style={{ background: c['bg-0'] }}
      >
        <div className="relative h-28 overflow-hidden" style={{ background: `radial-gradient(ellipse at 15% 0%, ${c.accent}55, transparent 65%), radial-gradient(ellipse at 100% 100%, ${c['accent-2']}33, transparent 60%), ${c['bg-0']}` }}>
          <div className="absolute inset-y-3 left-3 w-8 space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="size-6 rounded-md" style={{ background: i === 0 ? c.accent : c['bg-3'], borderRadius: t.appearance.serverShape === 'circle' ? 99 : 6 }} />
            ))}
          </div>
          <div className="absolute inset-y-3 left-14 right-3 rounded-md p-2.5" style={{ background: `${c['bg-2']}dd`, border: `1px solid ${c['border-strong']}` }}>
            <div className="truncate text-[22px] leading-none" style={{ fontFamily: display.family, color: c['text-0'] }}>
              {t.name}
            </div>
            <div className="mt-1.5 truncate text-[11px]" style={{ fontFamily: body.family, color: c['text-1'] }}>
              {t.tagline}
            </div>
            <div className="mt-2 flex gap-1">
              <span className="h-1.5 w-10 rounded-full" style={{ background: c.accent }} />
              <span className="h-1.5 w-6 rounded-full" style={{ background: c['accent-2'] }} />
              <span className="h-1.5 w-8 rounded-full" style={{ background: c['text-2'] }} />
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 px-3 py-2.5" style={{ background: c['bg-1'] }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: c['text-0'] }}>
              {active && <Check size={14} style={{ color: c.accent }} />}
              {t.name}
            </div>
            <div className="line-clamp-2 text-[11.5px]" style={{ color: c['text-2'] }}>
              {t.description}
            </div>
          </div>
        </div>
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-md bg-black/60 text-white opacity-0 transition group-hover:opacity-100 hover:bg-danger"
          aria-label={`Excluir tema ${t.name}`}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function Presets() {
  const [a] = useEdit();
  const custom = useLocal((s) => s.customThemes);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const pick = (t: ThemeDef) => editAppearance({ ...t.appearance, customCss: t.appearance.customCss });
  const exportCurrent = () => {
    const payload = { name: name.trim() || 'Minha estética', vinlancordTheme: 1, appearance: a };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `estetica-${(name.trim() || a.preset).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  };
  const saveCurrent = () => {
    const n = name.trim();
    if (!n) return ui.error('Dê um nome para a sua estética.');
    try {
      const t = validateCustomTheme({ name: n, appearance: a });
      local().set({ customThemes: [...custom.filter((c) => c.id !== t.id), t] });
      editAppearance(t.appearance);
      setName('');
      ui.success(`Estética "${t.name}" salva!`);
    } catch (e) {
      ui.error(e);
    }
  };
  return (
    <>
      <div className="vl-stagger grid grid-cols-2 gap-4">
        {THEMES.map((t) => (
          <PresetCard key={t.id} t={t} active={a.preset === t.id} onPick={() => pick(t)} />
        ))}
        {custom.map((t) => (
          <PresetCard
            key={t.id}
            t={t}
            active={a.preset === t.id}
            onPick={() => pick(t)}
            onDelete={() =>
              ui.confirm({
                title: `Excluir "${t.name}"?`,
                body: 'A estética será removida deste dispositivo.',
                confirmLabel: 'Excluir',
                danger: true,
                onConfirm: () => local().set({ customThemes: custom.filter((c) => c.id !== t.id) }),
              })
            }
          />
        ))}
      </div>
      <Card title="Suas estéticas" className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-[240px]" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Nome da sua estética" />
          <Button size="sm" icon={<Save size={14} />} onClick={saveCurrent}>Salvar atual</Button>
          <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={exportCurrent}>Exportar</Button>
          <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Importar</Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw size={14} />}
            onClick={() => {
              const base = [...THEMES, ...custom].find((t) => t.id === a.preset);
              editAppearance((base ?? THEMES[0]!).appearance);
            }}
          >
            Desfazer mudanças
          </Button>
        </div>
        <p className="mt-2 text-xs text-fg-2">Exporte para compartilhar com os amigos. CSS importado nunca carrega nada da internet.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              if (f.size > 200_000) throw new Error('Arquivo grande demais para um tema.');
              const t = validateCustomTheme(JSON.parse(await f.text()));
              local().set({ customThemes: [...custom.filter((c) => c.id !== t.id), t] });
              editAppearance(t.appearance);
              ui.success(`Estética "${t.name}" importada!`);
            } catch (er) {
              ui.error(er instanceof SyntaxError ? 'Arquivo de tema inválido.' : er);
            }
          }}
        />
      </Card>
    </>
  );
}

/* ───────────── cores ───────────── */

function Colors() {
  const [a, set] = useEdit();
  const setColor = (k: string, v: string) => set({ colors: { ...a.colors, [k]: v } });
  const groups = [...new Set(COLOR_TOKENS.map((t) => t.group))];
  return (
    <>
      <Card title="Modo">
        <Segmented
          value={a.mode}
          onChange={(m) => set({ mode: m, colors: { ...a.colors, ...paletteFrom(a.colors.accent ?? '#c1121f', m) } })}
          options={[
            { value: 'dark', label: 'Escuro' },
            { value: 'light', label: 'Claro' },
          ]}
        />
        <p className="mt-2 text-xs text-fg-2">Trocar o modo gera uma paleta nova a partir da sua cor de destaque.</p>
      </Card>
      <Card title="Cor de destaque">
        <div className="flex flex-wrap items-center gap-2">
          {ACCENTS.map((c) => (
            <button
              key={c}
              onClick={() => setColor('accent', c)}
              aria-label={`Destaque ${c}`}
              className={cx('grid size-9 place-items-center rounded-full transition hover:scale-110', a.colors.accent?.toLowerCase() === c && 'ring-2 ring-fg ring-offset-2 ring-offset-bg-1')}
              style={{ background: c, boxShadow: `0 0 16px -4px ${c}` }}
            >
              {a.colors.accent?.toLowerCase() === c && <Check size={16} className="mix-blend-difference text-white" />}
            </button>
          ))}
          <ColorInput value={a.colors.accent ?? '#c1121f'} onChange={(v) => setColor('accent', v)} label="Destaque personalizado" round />
        </div>
        <Button className="mt-4" size="sm" variant="secondary" icon={<Wand2 size={14} />} onClick={() => set({ colors: { ...a.colors, ...paletteFrom(a.colors.accent ?? '#c1121f', a.mode) } })}>
          Gerar paleta harmônica a partir do destaque
        </Button>
      </Card>
      {groups.map((g) => (
        <Card key={g} title={g}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {COLOR_TOKENS.filter((t) => t.group === g).map((t) => (
              <div key={t.key} className="flex items-center justify-between gap-3 py-1">
                <span className="text-sm text-fg-1">{t.label}</span>
                <ColorInput value={a.colors[t.key] ?? '#000000'} onChange={(v) => setColor(t.key, v)} label={t.label} />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

function ColorInput({ value, onChange, label, round }: { value: string; onChange: (v: string) => void; label: string; round?: boolean }) {
  return (
    <label className={cx('relative flex h-9 cursor-pointer items-center gap-2 overflow-hidden border border-line-strong bg-bg-1/80 pr-2 transition hover:border-accent/60', round ? 'w-9 rounded-full' : 'rounded-lg')} title={label}>
      <span className={cx('h-full shrink-0', round ? 'w-full' : 'w-9')} style={{ background: value }} />
      {!round && <span className="font-mono text-xs uppercase text-fg-1">{value}</span>}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}

/* ───────────── tipografia ───────────── */

function Typography() {
  const [a, set] = useEdit();
  const s = useStore((st) => st.settings);
  return (
    <>
      <Card title="Fonte dos títulos">
        <div className="grid grid-cols-2 gap-2">
          {DISPLAY_FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => set({ displayFont: f.id })}
              className={cx('vl-cut-sm rounded-lg border px-3 py-2.5 text-left transition-all hover:-translate-y-0.5', a.displayFont === f.id ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}
            >
              <div className="truncate text-2xl leading-tight text-fg" style={{ fontFamily: f.family }}>
                Vinlancord
              </div>
              <div className="mt-0.5 text-[11.5px] text-fg-2">
                {f.label} · {f.hint}
              </div>
            </button>
          ))}
        </div>
      </Card>
      <Card title="Fonte do texto">
        <div className="grid grid-cols-2 gap-2">
          {BODY_FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => set({ bodyFont: f.id })}
              className={cx('vl-cut-sm rounded-lg border px-3 py-2.5 text-left transition-all hover:-translate-y-0.5', a.bodyFont === f.id ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}
            >
              <div className="text-[15px] text-fg" style={{ fontFamily: f.family }}>
                A noite cai, a conversa continua.
              </div>
              <div className="mt-0.5 text-[11.5px] text-fg-2">
                {f.label} · {f.hint}
              </div>
            </button>
          ))}
        </div>
      </Card>
      <Card title="Texto e acessibilidade">
        <div className="mb-2 text-sm text-fg-1">Tamanho da fonte</div>
        <Slider value={s.fontScale} min={0.8} max={1.4} step={0.05} onChange={(v) => void updateSettings({ fontScale: v })} format={(v) => `${Math.round(v * 16)}px`} />
        <SettingRow title="Modo compacto" description="Mensagens mais juntinhas, cabem mais na tela.">
          <Switch checked={s.compact} onChange={(v) => void updateSettings({ compact: v })} />
        </SettingRow>
        <SettingRow title="Mostrar segundos no horário">
          <Switch checked={s.showSeconds} onChange={(v) => void updateSettings({ showSeconds: v })} />
        </SettingRow>
      </Card>
    </>
  );
}

/* ───────────── formas ───────────── */

const SHAPE_CLIP: Record<IconShape, string | undefined> = {
  circle: undefined,
  squircle: undefined,
  diamond: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
  hexagon: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
  shield: 'polygon(10% 0, 90% 0, 100% 10%, 100% 58%, 50% 100%, 0 58%, 0 10%)',
};
const SHAPE_LABEL: Record<IconShape, string> = { circle: 'Círculo', squircle: 'Arredondado', diamond: 'Losango', hexagon: 'Hexágono', shield: 'Escudo' };

function ShapePicker({ value, onChange }: { value: IconShape; onChange: (v: IconShape) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {(Object.keys(SHAPE_LABEL) as IconShape[]).map((k) => (
        <button key={k} onClick={() => onChange(k)} className={cx('flex w-[84px] flex-col items-center gap-1.5 rounded-lg border p-2 transition-all hover:-translate-y-0.5', value === k ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}>
          <span className="gradient-accent block size-10" style={{ clipPath: SHAPE_CLIP[k], borderRadius: k === 'circle' ? '50%' : k === 'squircle' ? '30%' : 0 }} />
          <span className="text-[11.5px] text-fg-1">{SHAPE_LABEL[k]}</span>
        </button>
      ))}
    </div>
  );
}

function OptionCards<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint: string; preview: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx('rounded-lg border p-2.5 text-left transition-all hover:-translate-y-0.5', value === o.value ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}>
          <div className="mb-2 grid h-12 place-items-center rounded-md bg-bg-0/60">{o.preview}</div>
          <div className="text-[13px] font-semibold text-fg">{o.label}</div>
          <div className="text-[11px] text-fg-2">{o.hint}</div>
        </button>
      ))}
    </div>
  );
}

function Shapes() {
  const [a, set] = useEdit();
  const cornerPreview = (c: CornerStyle) => (
    <span
      className="block h-7 w-14 border-2 border-accent bg-accent/20"
      style={{
        borderRadius: { round: 12, soft: 6, sharp: 0, cut: 0 }[c],
        clipPath: c === 'cut' ? 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' : undefined,
      }}
    />
  );
  const msgPreview = (m: MessageStyle) => (
    <span className={cx('flex w-16 flex-col gap-1', m === 'cards' && 'rounded border border-line-strong bg-bg-3 p-1')}>
      <span className={cx('h-1.5 w-8 rounded-full bg-accent', m === 'letter' && 'h-2 w-10 rounded-none')} />
      <span className="h-1 w-14 rounded-full bg-fg-2" />
      <span className="h-1 w-10 rounded-full bg-fg-2" />
    </span>
  );
  return (
    <>
      <Card title="Cantos">
        <OptionCards
          value={a.corners}
          onChange={(v) => set({ corners: v })}
          options={[
            { value: 'round', label: 'Redondos', hint: 'Suaves e modernos', preview: cornerPreview('round') },
            { value: 'soft', label: 'Discretos', hint: 'Levemente curvos', preview: cornerPreview('soft') },
            { value: 'sharp', label: 'Retos', hint: 'Austeros', preview: cornerPreview('sharp') },
            { value: 'cut', label: 'Chanfrados', hint: 'Táticos, de interface', preview: cornerPreview('cut') },
          ]}
        />
      </Card>
      <Card title="Ícones de servidor">
        <ShapePicker value={a.serverShape} onChange={(v) => set({ serverShape: v })} />
      </Card>
      <Card title="Avatares">
        <ShapePicker value={a.avatarShape} onChange={(v) => set({ avatarShape: v })} />
      </Card>
      <Card title="Mensagens">
        <OptionCards
          value={a.messageStyle}
          onChange={(v) => set({ messageStyle: v })}
          options={[
            { value: 'flat', label: 'Fluida', hint: 'Limpa, sem caixas', preview: msgPreview('flat') },
            { value: 'cards', label: 'Cartões', hint: 'Cada conversa num bloco', preview: msgPreview('cards') },
            { value: 'letter', label: 'Carta', hint: 'Capitular e filetes', preview: msgPreview('letter') },
          ]}
        />
      </Card>
      <Card title="Layout">
        <SettingRow title="Painéis flutuantes" description="Painéis separados, com espaço para o fundo animado aparecer entre eles.">
          <Switch checked={a.layout === 'floating'} onChange={(v) => set({ layout: v ? 'floating' : 'classic' })} />
        </SettingRow>
        <SettingRow title="Ornamentos" description="Cantoneiras, filetes e detalhes na cor de destaque.">
          <Switch checked={a.ornaments} onChange={(v) => set({ ornaments: v })} />
        </SettingRow>
        <SettingRow title="Categorias como capítulos" description="Numera as categorias de canais em algarismos romanos (I, II, III…).">
          <Switch checked={a.chapterNumbers} onChange={(v) => set({ chapterNumbers: v })} />
        </SettingRow>
      </Card>
    </>
  );
}

/* ───────────── atmosfera ───────────── */

const EFFECTS: { value: AmbientEffect; label: string; icon: ReactNode }[] = [
  { value: 'none', label: 'Nenhum', icon: <Ban size={18} /> },
  { value: 'feathers', label: 'Penas', icon: <Feather size={18} /> },
  { value: 'ink', label: 'Tinta', icon: <Droplet size={18} /> },
  { value: 'embers', label: 'Brasas', icon: <Flame size={18} /> },
  { value: 'ash', label: 'Cinzas', icon: <Wind size={18} /> },
  { value: 'sigils', label: 'Sigilos', icon: <Hexagon size={18} /> },
  { value: 'petals', label: 'Pétalas', icon: <Flower2 size={18} /> },
  { value: 'rain', label: 'Chuva', icon: <CloudRain size={18} /> },
  { value: 'snow', label: 'Neve', icon: <Snowflake size={18} /> },
  { value: 'stars', label: 'Estrelas', icon: <Sparkles size={18} /> },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Atmosphere() {
  const [a, set] = useEdit();
  const image = useBackground((s) => s.image);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const perf = usePerf();
  return (
    <>
      {(perf.low || perf.forced) && (
        <div className="vl-cut mb-6 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-fg-1">
          <Sparkles size={18} className="shrink-0 text-warning" />
          <span className="flex-1">
            {perf.forced
              ? 'Efeitos completos forçados. Se a interface ficar lenta, volte para o modo automático.'
              : 'Modo leve ativado automaticamente: este PC estava com dificuldade para desenhar os efeitos, então o desfoque de vidro foi desligado e há menos partículas.'}
          </span>
          <Button size="sm" variant="secondary" onClick={() => setForceFull(!perf.forced)}>
            {perf.forced ? 'Voltar ao automático' : 'Forçar efeitos completos'}
          </Button>
        </div>
      )}
      <Card title="Efeito de fundo">
        <div className="grid grid-cols-5 gap-2">
          {EFFECTS.map((e) => (
            <button
              key={e.value}
              onClick={() => set({ effect: e.value })}
              className={cx('flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[12px] transition-all hover:-translate-y-0.5', a.effect === e.value ? 'border-accent bg-accent/15 text-fg shadow-[0_0_18px_-8px_var(--vl-glow-color)]' : 'border-line text-fg-1 hover:border-line-strong')}
            >
              <span className={a.effect === e.value ? 'text-accent' : ''}>{e.icon}</span>
              {e.label}
            </button>
          ))}
        </div>
        <div className="mt-4 text-sm text-fg-1">Intensidade</div>
        <Slider value={a.effectIntensity} min={0} max={2} step={0.1} onChange={(v) => set({ effectIntensity: v })} format={pct} />
        <SettingRow title="Neblina" description="Névoa lenta passando atrás dos painéis.">
          <Switch checked={a.fog} onChange={(v) => set({ fog: v })} />
        </SettingRow>
        <SettingRow title="Linhas de varredura" description="Efeito de monitor/HUD por cima da interface.">
          <Switch checked={a.scanlines} onChange={(v) => set({ scanlines: v })} />
        </SettingRow>
        <SettingRow title="Rastro do cursor" description="Faíscas na cor de destaque seguindo o mouse.">
          <Switch checked={a.cursorTrail} onChange={(v) => set({ cursorTrail: v })} />
        </SettingRow>
      </Card>
      <Card title="Luz e textura">
        <Row label="Brilho do destaque"><Slider value={a.glow} min={0} max={1} step={0.05} onChange={(v) => set({ glow: v })} format={pct} /></Row>
        <Row label="Granulação de filme"><Slider value={a.grain} min={0} max={1} step={0.05} onChange={(v) => set({ grain: v })} format={pct} /></Row>
        <Row label="Vinheta"><Slider value={a.vignette} min={0} max={1} step={0.05} onChange={(v) => set({ vignette: v })} format={pct} /></Row>
        <Row label="Opacidade dos painéis"><Slider value={a.panelOpacity} min={0.3} max={1} step={0.02} onChange={(v) => set({ panelOpacity: v })} format={pct} /></Row>
        <Row label="Desfoque do vidro"><Slider value={a.blur} min={0} max={32} step={1} onChange={(v) => set({ blur: v })} format={(v) => `${v}px`} /></Row>
      </Card>
      <Card title="Imagem de fundo (só neste dispositivo)">
        <div className="flex items-center gap-4">
          <div className="grid h-24 w-40 shrink-0 place-items-center overflow-hidden rounded-lg border border-line-strong bg-bg-0" style={image ? { backgroundImage: `url("${image}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
            {!image && <ImagePlus size={22} className="text-fg-2" />}
          </div>
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="secondary" loading={busy} icon={<ImagePlus size={14} />} onClick={() => fileRef.current?.click()}>
              {image ? 'Trocar imagem' : 'Escolher imagem'}
            </Button>
            {image && (
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setBackgroundImage(null)}>
                Remover
              </Button>
            )}
            <span className="text-[11px] text-fg-2">PNG, JPG, WebP ou GIF animado (até 4 MB).</span>
          </div>
        </div>
        {image && (
          <div className="mt-4">
            <Row label="Escurecer"><Slider value={a.bgDim} min={0} max={1} step={0.05} onChange={(v) => set({ bgDim: v })} format={pct} /></Row>
            <Row label="Desfocar"><Slider value={a.bgBlur} min={0} max={40} step={1} onChange={(v) => set({ bgBlur: v })} format={(v) => `${v}px`} /></Row>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(true);
            try {
              setBackgroundImage(await prepareBackground(f));
              if (a.panelOpacity > 0.9) set({ panelOpacity: 0.82 });
            } catch (er) {
              ui.error(er);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[170px_1fr] items-center gap-4 py-1.5">
      <span className="text-sm text-fg-1">{label}</span>
      {children}
    </div>
  );
}

/* ───────────── animações ───────────── */

const TRANSITIONS: { value: TransitionStyle; label: string; hint: string }[] = [
  { value: 'ink', label: 'Tinta', hint: 'Surge como tinta no papel' },
  { value: 'slash', label: 'Corte', hint: 'Revela em diagonal' },
  { value: 'shutter', label: 'Persiana', hint: 'Abre do centro' },
  { value: 'rise', label: 'Ascensão', hint: 'Sobe suavemente' },
  { value: 'fade', label: 'Esmaecer', hint: 'Só opacidade' },
  { value: 'none', label: 'Nenhuma', hint: 'Troca instantânea' },
];

function Motion() {
  const [a, set] = useEdit();
  const reduceMotion = useStore((st) => st.settings.reduceMotion);
  const [demo, setDemo] = useState(0);
  return (
    <>
      <Card title="Nível de animação">
        <Segmented
          value={a.animations}
          onChange={(v) => set({ animations: v })}
          options={[
            { value: 'full', label: 'Completas' },
            { value: 'reduced', label: 'Reduzidas' },
            { value: 'off', label: 'Desligadas' },
          ]}
        />
        <div className="mt-4 text-sm text-fg-1">Velocidade</div>
        <Slider value={a.animSpeed} min={0.25} max={3} step={0.05} onChange={(v) => set({ animSpeed: v })} format={(v) => `${v.toFixed(2)}×`} />
        <SettingRow title="Reduzir movimento (acessibilidade)" description="Desliga transições e efeitos em todo o app, inclusive o fundo animado.">
          <Switch checked={reduceMotion} onChange={(v) => void updateSettings({ reduceMotion: v })} />
        </SettingRow>
      </Card>
      <Card title="Transição de telas e janelas">
        <div className="grid grid-cols-3 gap-2">
          {TRANSITIONS.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                set({ transition: t.value });
                setDemo((d) => d + 1);
              }}
              className={cx('rounded-lg border px-3 py-2.5 text-left transition-all hover:-translate-y-0.5', a.transition === t.value ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}
            >
              <div className="text-[13px] font-semibold text-fg">{t.label}</div>
              <div className="text-[11px] text-fg-2">{t.hint}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="grid h-24 flex-1 place-items-center overflow-hidden rounded-lg border border-line bg-bg-0/60">
            <div key={demo} className="vl-route vl-cut grid h-16 w-48 place-items-center rounded-lg border border-accent/60 bg-accent/15 font-heading text-lg text-fg">
              Nova tela
            </div>
          </div>
          <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => setDemo((d) => d + 1)}>
            Testar
          </Button>
        </div>
      </Card>
    </>
  );
}

/* ───────────── CSS ───────────── */

function CustomCss() {
  const [a, set] = useEdit();
  const [draft, setDraft] = useState(a.customCss);
  const dirty = draft !== a.customCss;
  return (
    <Card title="CSS personalizado">
      <p className="mb-3 text-sm text-fg-2">
        Para quem quer ir além: escreva CSS para ajustar qualquer detalhe. As variáveis <code className="font-mono text-fg-1">--vl-accent</code>, <code className="font-mono text-fg-1">--vl-bg-0…5</code> e <code className="font-mono text-fg-1">--vl-radius</code> estão disponíveis. Por segurança, <code className="font-mono">@import</code> e <code className="font-mono">url()</code> externos são ignorados.
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={14}
        maxLength={20_000}
        spellCheck={false}
        placeholder={'/* exemplo */\n.vl-msg-author { letter-spacing: .08em; }'}
        className="font-mono text-[12.5px]"
      />
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={!dirty} onClick={() => set({ customCss: draft })}>Aplicar</Button>
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setDraft(a.customCss)}>Descartar</Button>
        {a.customCss && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft('');
              set({ customCss: '' });
            }}
          >
            Limpar CSS
          </Button>
        )}
        <span className="ml-auto text-xs tabular-nums text-fg-2">{draft.length}/20000</span>
      </div>
    </Card>
  );
}
