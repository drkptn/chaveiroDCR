/** Atalhos de teclado: formato "Ctrl+Shift+M", correspondência e conversão para atalhos globais do Electron. */
import { useEffect } from 'react';
import { useLocal, type KeybindAction } from '../store/local';
import { desktop } from './desktop';

const KEY_NAMES: Record<string, string> = { ' ': 'Space' };

export function formatAccelerator(e: KeyboardEvent, single = false): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  if (single && !parts.length) key = e.code; // PTT usa o código físico (ex.: KeyV, Backquote)
  parts.push(key);
  return parts.join('+');
}

export function matches(e: KeyboardEvent, binding: string): boolean {
  if (!binding) return false;
  const parts = binding.split('+');
  const key = parts.pop()!;
  const need = { ctrl: parts.includes('Ctrl'), alt: parts.includes('Alt'), shift: parts.includes('Shift') };
  if ((e.ctrlKey || e.metaKey) !== need.ctrl || e.altKey !== need.alt || e.shiftKey !== need.shift) return false;
  if (key === e.code) return true;
  const k = KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return k === key;
}

/** Converte para o formato de acelerador do Electron (globalShortcut). */
export function toElectron(binding: string): string {
  return binding
    .split('+')
    .map((p) => (p === 'Ctrl' ? 'CommandOrControl' : p.startsWith('Arrow') ? p.slice(5) : p === ',' ? ',' : p))
    .join('+');
}

export type KeybindHandlers = Partial<Record<KeybindAction, (e: KeyboardEvent | null) => void>> & { pttUp?: () => void };

/** Escuta atalhos dentro da janela e registra os globais no desktop. */
export function useKeybinds(handlers: KeybindHandlers) {
  const binds = useLocal((s) => s.keybinds);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      for (const [action, binding] of Object.entries(binds) as [KeybindAction, string][]) {
        if (!binding || !matches(e, binding)) continue;
        if (action === 'pushToTalk') {
          if (e.repeat) return;
          // PTT sem modificadores não deve disparar enquanto digita
          if (typing && !binding.includes('+')) continue;
          handlers.pushToTalk?.(e);
          return;
        }
        if (action === 'markRead' && typing) continue;
        if (typing && !binding.includes('Ctrl') && !binding.includes('Alt')) continue;
        const h = handlers[action];
        if (h) {
          e.preventDefault();
          h(e);
          return;
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      const ptt = binds.pushToTalk;
      if (!ptt) return;
      const key = ptt.split('+').pop();
      if (e.code === key || (KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)) === key) handlers.pttUp?.();
    };
    const blur = () => handlers.pttUp?.();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [binds, handlers]);

  // atalhos globais (funcionam com o app em segundo plano)
  useEffect(() => {
    if (!desktop) return;
    const globals: Record<string, string> = {};
    for (const a of ['toggleMute', 'toggleDeafen', 'toggleCamera'] as const) if (binds[a]) globals[a] = toElectron(binds[a]);
    void desktop.shortcuts.register(globals);
    return desktop.shortcuts.onTrigger((action) => handlers[action as KeybindAction]?.(null));
  }, [binds, handlers]);
}
