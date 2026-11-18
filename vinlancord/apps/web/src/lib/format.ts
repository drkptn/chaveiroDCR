import { snowflakeTimestamp } from '@vinlancord/shared';

const dtf = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const tf = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const tfs = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const longDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const full = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' });
const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

export const formatTime = (d: string | Date, seconds = false) => (seconds ? tfs : tf).format(new Date(d));
export const formatLongDate = (d: string | Date) => longDate.format(new Date(d));
export const formatFull = (d: string | Date) => full.format(new Date(d));
export const formatShortDate = (d: string | Date) => dtf.format(new Date(d));

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Hoje às 14:32", "Ontem às 09:10" ou "12/11/2026 14:32" */
export function formatMessageDate(d: string | Date, seconds = false) {
  const date = new Date(d);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, now)) return `Hoje às ${formatTime(date, seconds)}`;
  if (isSameDay(date, yesterday)) return `Ontem às ${formatTime(date, seconds)}`;
  return `${formatShortDate(date)} ${formatTime(date, seconds)}`;
}

export function relativeTime(d: string | Date | number) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'agora mesmo';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / 86400 / 30), 'month');
  return rtf.format(Math.round(diff / 86400 / 365), 'year');
}

export function elapsed(since: number) {
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export const idDate = (id: string) => new Date(snowflakeTimestamp(id));

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0]!.slice(0, 2) : parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** Cor estável a partir de um ID (para avatares sem imagem). */
export function colorFromId(id: string) {
  const palette = ['#7c5cff', '#5865f2', '#3b82f6', '#06b6d4', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length]!;
}

export const staticImage = (url: string | null | undefined) => (url && /\/a_[^/]+\.webp$/.test(url) ? url.replace(/\.webp$/, '.static.webp') : url ?? null);

/** Numeral romano (1–3999) — usado nos "capítulos" da barra lateral. */
export function roman(n: number) {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
  const map: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of map) while (n >= v) (out += s), (n -= v);
  return out;
}
