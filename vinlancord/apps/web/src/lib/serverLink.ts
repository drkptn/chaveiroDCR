/** Links de convite de servidor: vinlancord://servidor?url=https://IP:PORTA&pin=<sha256 do certificado>. */
import { api, tokenStore } from './api';
import { desktop } from './desktop';
import { ui } from '../store/ui';

const PIN_KEY = 'vl:server-pin';

export function parseServerLink(text: string): { url: string; pin: string } | null {
  const m = /vinlancord:\/\/servidor\?[^\s]+/.exec(text.trim());
  if (!m) return null;
  try {
    const q = new URL(m[0].replace('vinlancord://servidor', 'https://x/servidor')).searchParams;
    const url = (q.get('url') ?? '').replace(/\/+$/, '');
    const pin = (q.get('pin') ?? '').toLowerCase();
    if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url) || !/^[0-9a-f]{64}$/.test(pin)) return null;
    return { url, pin };
  } catch {
    return null;
  }
}

/** Troca o app para o servidor do convite (com confirmação). */
export async function connectToServer(link: { url: string; pin: string }, opts: { confirm?: boolean } = {}) {
  const go = async () => {
    if (!desktop) throw new Error('Convites de servidor funcionam no app desktop.');
    await desktop.servers.trust(link.url, link.pin);
    // mesmo servidor (só mudou o IP): mantém o login; outro servidor: precisa entrar de novo
    if (localStorage.getItem(PIN_KEY) !== link.pin) await tokenStore.clear();
    localStorage.setItem(PIN_KEY, link.pin);
    api.setServer(link.url);
    location.hash = '#/login';
    location.reload();
  };
  if (opts.confirm === false) return go();
  ui.confirm({
    title: 'Conectar a este servidor?',
    body: `O app vai passar a usar o servidor ${link.url}. Só aceite convites de quem você conhece.`,
    confirmLabel: 'Conectar',
    onConfirm: go,
  });
}
