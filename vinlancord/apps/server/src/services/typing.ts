/**
 * Indicador de digitação com limitação (no máximo 1 evento/s por usuário e canal).
 * Em vez de descartar eventos dentro da janela, agenda um envio "atrasado" —
 * e cancela esse envio se a pessoa mandar a mensagem antes.
 */
import { kv } from '../lib/kv';
import { bus } from './bus';

const pending = new Map<string, NodeJS.Timeout>();

function send(channelId: string, userId: string) {
  return bus.toChannel(channelId, 'TYPING_START', { channelId, userId, at: Date.now() });
}

export async function startTyping(channelId: string, userId: string) {
  const key = `typing:${channelId}:${userId}`;
  if (await kv.setnx(key, '1', 1)) {
    await send(channelId, userId);
    return;
  }
  if (pending.has(key)) return;
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      void send(channelId, userId);
    }, 1000),
  );
}

export function cancelTyping(channelId: string, userId: string) {
  const key = `typing:${channelId}:${userId}`;
  const t = pending.get(key);
  if (t) clearTimeout(t);
  pending.delete(key);
}
