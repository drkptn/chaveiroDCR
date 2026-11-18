/**
 * Aparência em uso. A fonte da verdade é `settings.appearance` (sincronizada com a
 * conta), mas as edições do Estúdio aplicam na hora e salvam com atraso curto.
 */
import { create } from 'zustand';
import type { Appearance, UserSettings } from '@vinlancord/shared';
import { cachedAppearance, cacheAppearance, findTheme, normalizeAppearance, type ThemeDef } from '../lib/themes';
import { updateSettings } from './actions';

const LEGACY: Record<string, string> = { meianoite: 'nebula', aurora: 'aco', brasa: 'muralha', areia: 'pergaminho' };

export function resolveAppearance(settings: Pick<UserSettings, 'appearance' | 'theme'>, custom: ThemeDef[] = []): Appearance {
  if (settings.appearance) return normalizeAppearance(settings.appearance, custom);
  return findTheme(LEGACY[settings.theme] ?? settings.theme, custom).appearance;
}

export const useAppearance = create<{ current: Appearance }>()(() => ({
  current: cachedAppearance() ?? normalizeAppearance(null),
}));

const PICKED_KEY = 'vl:appearance-picked';

/** Escolha feita antes do login (fica no dispositivo até entrar na conta). */
export function pickAppearanceLocally(a: Appearance) {
  editAppearance(a, { save: false });
  try {
    localStorage.setItem(PICKED_KEY, '1');
  } catch {
    /* ignore */
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lockUntil = 0;

/** Aplica imediatamente e agenda o salvamento na conta. */
export function editAppearance(next: Appearance, opts: { save?: boolean } = {}) {
  lockUntil = Date.now() + 2000;
  useAppearance.setState({ current: next });
  cacheAppearance(next);
  if (opts.save === false) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    lockUntil = Date.now() + 2000;
    void updateSettings({ appearance: next, theme: next.preset });
  }, 450);
}

/** Chamado quando as configurações da conta mudam (login, outro dispositivo…). */
export function syncAppearance(settings: UserSettings, custom: ThemeDef[]) {
  if (saveTimer || Date.now() < lockUntil) return;
  // estética escolhida na tela de login vale para a conta que ainda não tem uma
  if (!settings.appearance && localStorage.getItem(PICKED_KEY)) {
    localStorage.removeItem(PICKED_KEY);
    const cur = useAppearance.getState().current;
    void updateSettings({ appearance: cur, theme: cur.preset });
    return;
  }
  const next = resolveAppearance(settings, custom);
  if (JSON.stringify(next) === JSON.stringify(useAppearance.getState().current)) return;
  useAppearance.setState({ current: next });
  cacheAppearance(next);
}
