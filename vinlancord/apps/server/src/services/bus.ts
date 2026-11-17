/**
 * Barramento de eventos em tempo real. Toda emissão é resolvida para uma lista
 * de usuários (já filtrada por permissão) e publicada no pub/sub, para que
 * qualquer instância do gateway entregue aos sockets locais.
 */
import type { GatewayEventName, GatewayEvents } from '@vinlancord/shared';
import { kv } from '../lib/kv';
import { guildMemberIds, usersWhoCanView } from './perms';

const CHANNEL = 'vl:dispatch';

export interface DispatchEnvelope {
  u: string[];
  t: GatewayEventName;
  d: unknown;
  /** sessão que não deve receber (ex.: quem originou a ação, quando útil) */
  x?: string;
  /** apenas esta sessão */
  s?: string;
  /** apenas esta conexão do gateway */
  c?: string;
}

type LocalHandler = (env: DispatchEnvelope) => void;
const handlers = new Set<LocalHandler>();

export async function initBus() {
  await kv.subscribe(CHANNEL, (raw) => {
    let env: DispatchEnvelope;
    try {
      env = JSON.parse(raw);
    } catch {
      return;
    }
    handlers.forEach((h) => h(env));
  });
}

export function onDispatch(h: LocalHandler) {
  handlers.add(h);
  return () => handlers.delete(h);
}

const bigintSafe = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

async function publish(env: DispatchEnvelope) {
  if (!env.u.length) return;
  await kv.publish(CHANNEL, JSON.stringify(env, bigintSafe));
}

export const bus = {
  toUsers<E extends GatewayEventName>(userIds: Iterable<string>, t: E, d: GatewayEvents[E], opts: { except?: string } = {}) {
    return publish({ u: [...new Set(userIds)], t, d, x: opts.except });
  },
  toUser<E extends GatewayEventName>(userId: string, t: E, d: GatewayEvents[E]) {
    return publish({ u: [userId], t, d });
  },
  toSession<E extends GatewayEventName>(userId: string, sessionId: string, t: E, d: GatewayEvents[E]) {
    return publish({ u: [userId], t, d, s: sessionId });
  },
  toConn<E extends GatewayEventName>(userId: string, connId: string, t: E, d: GatewayEvents[E]) {
    return publish({ u: [userId], t, d, c: connId });
  },
  async toGuild<E extends GatewayEventName>(guildId: string, t: E, d: GatewayEvents[E], extraUsers: string[] = []) {
    const ids = await guildMemberIds(guildId);
    return publish({ u: [...new Set([...ids, ...extraUsers])], t, d });
  },
  /** Para canais de servidor, apenas quem tem VIEW_CHANNEL; para DMs, os participantes. */
  async toChannel<E extends GatewayEventName>(channelId: string, t: E, d: GatewayEvents[E]) {
    const ids = await usersWhoCanView(channelId);
    return publish({ u: ids, t, d });
  },
};
