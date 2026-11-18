/** Fundo vivo: brilho da estética, imagem própria, neblina, partículas, granulação, vinheta e linhas de varredura. */
import { useEffect, useRef } from 'react';
import { useAppearance } from '../store/appearance';
import { useBackground } from '../lib/background';
import { CursorTrail, ParticleField, type Palette } from '../lib/particles';
import { usePerf, startPerfGovernor } from '../lib/perf';

function paletteOf(colors: Record<string, string>, mode: 'dark' | 'light'): Palette {
  return {
    accent: colors.accent ?? '#c1121f',
    accent2: colors['accent-2'] ?? '#e9dcc0',
    text: colors['text-0'] ?? '#ffffff',
    dim: colors['text-2'] ?? '#888888',
    dark: mode === 'dark',
  };
}

export function Ambience() {
  const a = useAppearance((s) => s.current);
  const image = useBackground((s) => s.image);
  const canvas = useRef<HTMLCanvasElement>(null);
  const field = useRef<ParticleField | null>(null);
  const low = usePerf((s) => s.low && !s.forced);
  const off = a.animations === 'off';
  useEffect(() => startPerfGovernor(), []);
  const effect = off ? 'none' : a.effect;
  const intensity = a.animations === 'reduced' ? a.effectIntensity * 0.5 : a.effectIntensity;

  useEffect(() => {
    const el = canvas.current;
    if (!el || effect === 'none' || intensity <= 0) return;
    const f = new ParticleField(el, effect, intensity, paletteOf(a.colors, a.mode));
    field.current = f;
    f.start();
    const onResize = () => f.resize();
    const onFocus = () => f.setFocused(true);
    const onBlur = () => f.setFocused(false);
    window.addEventListener('resize', onResize);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      f.stop();
      field.current = null;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
    // a paleta é atualizada no efeito abaixo sem reiniciar as partículas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect, intensity]);

  useEffect(() => {
    field.current?.setPalette(paletteOf(a.colors, a.mode));
  }, [a.colors, a.mode]);

  useEffect(() => {
    field.current?.setLowPower(low);
  }, [low, effect, intensity]);

  const vignette = a.vignette > 0 ? `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${(a.mode === 'dark' ? 0.85 : 0.35) * a.vignette}) 100%)` : undefined;

  return (
    <>
      <div className="vl-ambience" aria-hidden>
        <div className="vl-ambience-base" />
        {image && (
          <div
            className="vl-ambience-img"
            style={{ backgroundImage: `url("${image}")`, filter: a.bgBlur ? `blur(${a.bgBlur}px)` : undefined, opacity: 1 - a.bgDim * 0.85 }}
          />
        )}
        {a.fog && !off && (
          <>
            <div className="vl-fog a" />
            <div className="vl-fog b" />
          </>
        )}
        <canvas ref={canvas} style={{ display: effect === 'none' ? 'none' : undefined }} />
        {vignette && <div className="vl-vignette" style={{ background: vignette }} />}
      </div>
      {(a.grain > 0 || a.scanlines) && (
        <div className="vl-overlay" aria-hidden>
          {a.grain > 0 && <div className="vl-grain" style={{ opacity: a.grain * (a.mode === 'dark' ? 0.16 : 0.22) }} />}
          {a.scanlines && <div className="vl-scanlines" />}
        </div>
      )}
      {a.cursorTrail && !off && <Trail color={a.colors.accent ?? '#ffffff'} />}
    </>
  );
}

function Trail({ color }: { color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const trail = useRef<CursorTrail | null>(null);
  useEffect(() => {
    const t = new CursorTrail(ref.current!, color);
    trail.current = t;
    const move = (e: PointerEvent) => t.move(e.clientX, e.clientY);
    const resize = () => t.resize();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('resize', resize);
    return () => {
      t.destroy();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('resize', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => trail.current?.setColor(color), [color]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[9995] size-full" aria-hidden />;
}
