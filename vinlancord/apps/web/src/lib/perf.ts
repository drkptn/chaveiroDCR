/**
 * Governador de desempenho: mede o FPS real da interface e, se o PC estiver
 * sofrendo para desenhar os efeitos, ativa o "modo leve" (sem desfoque de vidro,
 * menos partículas, texturas paradas). Fica ativo até o fim da sessão.
 */
import { create } from 'zustand';

const FORCE_KEY = 'vl:perf-force-full';

export const usePerf = create<{ low: boolean; forced: boolean }>()(() => ({
  low: false,
  forced: (() => {
    try {
      return localStorage.getItem(FORCE_KEY) === '1';
    } catch {
      return false;
    }
  })(),
}));

function apply() {
  const { low, forced } = usePerf.getState();
  document.documentElement.dataset.perf = low && !forced ? 'low' : 'full';
}

export function setForceFull(force: boolean) {
  try {
    if (force) localStorage.setItem(FORCE_KEY, '1');
    else localStorage.removeItem(FORCE_KEY);
  } catch {
    /* ignore */
  }
  usePerf.setState({ forced: force });
  apply();
}

let started = false;

export function startPerfGovernor() {
  if (started) return;
  started = true;
  apply();
  const samples: number[] = [];
  let last = performance.now();
  let bad = 0;
  const tick = (t: number) => {
    const dt = t - last;
    last = t;
    if (!document.hidden && document.hasFocus() && dt < 1000) samples.push(dt);
    if (samples.length >= 90) {
      samples.sort((a, b) => a - b);
      const median = samples[45]!;
      samples.length = 0;
      bad = median > 36 ? bad + 1 : 0;
      if (bad >= 2) {
        usePerf.setState({ low: true });
        apply();
        return; // decisão tomada para esta sessão
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** true quando os efeitos devem ser economizados. */
export const isLowPower = () => {
  const { low, forced } = usePerf.getState();
  return low && !forced;
};
