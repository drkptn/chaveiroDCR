/**
 * Presença (online/ausente/ocupado/invisível + atividades).
 * Estado agregado das conexões locais é espelhado no KV (Redis) com TTL,
 * permitindo leitura por qualquer instância.
 */
import type { Activity, CustomStatus, Presence, UserStatus, VisibleStatus } from '@vinlancord/shared';
import { prisma } from '../lib/db';
import { kv } from '../lib/kv';
import { parseCustomStatus } from '../lib/serialize';
import { bus } from './bus';
import { guildMemberIds } from './perms';

interface ConnPresence {
  afk: boolean;
  activities: Activity[];
  updatedAt: number;
}

interface UserPresenceState {
  pref: UserStatus;
  customStatus: CustomStatus | null;
  conns: Map<string, ConnPresence>;
  last: string;
  showActivity: boolean;
}

const local = new Map<string, UserPresenceState>();
const TTL = 150;
const key = (userId: string) => `presence:${userId}`;
const activityLogThrottle = new Map<string, number>();

const OFFLINE = (userId: string): Presence => ({ userId, status: 'offline', activities: [], customStatus: null });

function compute(userId: string, st: UserPresenceState): Presence {
  if (st.conns.size === 0 || st.pref === 'invisible') return OFFLINE(userId);
  let status: VisibleStatus = st.pref as VisibleStatus;
  const allAfk = [...st.conns.values()].every((c) => c.afk);
  if (status === 'online' && allAfk) status = 'idle';
  let activities: Activity[] = [];
  if (st.showActivity) {
    const latest = [...st.conns.values()].filter((c) => c.activities.length).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    activities = latest?.activities ?? [];
  }
  return { userId, status, activities, customStatus: parseCustomStatus(st.customStatus) };
}

export async function presenceAudience(userId: string): Promise<string[]> {
  const [friends, memberships] = await Promise.all([
    prisma.relationship.findMany({ where: { userId, type: 'FRIEND' }, select: { targetId: true } }),
    prisma.member.findMany({ where: { userId }, select: { guildId: true } }),
  ]);
  const ids = new Set<string>(friends.map((f) => f.targetId));
  for (const m of memberships) for (const id of await guildMemberIds(m.guildId)) ids.add(id);
  ids.add(userId);
  return [...ids];
}

async function publishIfChanged(userId: string, st: UserPresenceState, force = false) {
  const p = compute(userId, st);
  const s = JSON.stringify(p);
  if (!force && s === st.last) return;
  st.last = s;
  if (p.status === 'offline') await kv.del(key(userId));
  else await kv.set(key(userId), s, TTL);
  await bus.toUsers(await presenceAudience(userId), 'PRESENCE_UPDATE', p);
}

async function loadUserPrefs(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, customStatus: true, settings: true } });
  const settings = (u?.settings ?? {}) as { privacy?: { showActivity?: boolean } };
  return {
    pref: (u?.status ?? 'online') as UserStatus,
    customStatus: parseCustomStatus(u?.customStatus),
    showActivity: settings.privacy?.showActivity !== false,
  };
}

export async function connectPresence(userId: string, connId: string) {
  let st = local.get(userId);
  if (!st) {
    const prefs = await loadUserPrefs(userId);
    st = { ...prefs, conns: new Map(), last: '' };
    local.set(userId, st);
  }
  st.conns.set(connId, { afk: false, activities: [], updatedAt: Date.now() });
  await publishIfChanged(userId, st);
}

export async function disconnectPresence(userId: string, connId: string) {
  const st = local.get(userId);
  if (!st) return;
  st.conns.delete(connId);
  await publishIfChanged(userId, st);
  if (st.conns.size === 0) local.delete(userId);
}

export async function updateConnPresence(
  userId: string,
  connId: string,
  patch: { afk?: boolean; activities?: Activity[] },
) {
  const st = local.get(userId);
  const c = st?.conns.get(connId);
  if (!st || !c) return;
  if (patch.afk !== undefined) c.afk = patch.afk;
  if (patch.activities) {
    c.activities = patch.activities.slice(0, 5);
    c.updatedAt = Date.now();
    void logActivities(userId, c.activities);
  }
  await publishIfChanged(userId, st);
}

/** Chamado quando o usuário muda status/status personalizado/privacidade (persistidos no banco). */
export async function refreshUserPresence(userId: string) {
  const st = local.get(userId);
  if (!st) return;
  Object.assign(st, await loadUserPrefs(userId));
  await publishIfChanged(userId, st);
}

async function logActivities(userId: string, activities: Activity[]) {
  for (const a of activities) {
    const k = `${userId}:${a.name}`;
    const last = activityLogThrottle.get(k) ?? 0;
    if (Date.now() - last < 5 * 60_000) continue;
    activityLogThrottle.set(k, Date.now());
    await prisma.activityLog
      .upsert({
        where: { userId_name: { userId, name: a.name.slice(0, 128) } },
        create: { userId, name: a.name.slice(0, 128), type: a.type },
        update: { lastSeenAt: new Date(), type: a.type },
      })
      .catch(() => {});
  }
  if (activityLogThrottle.size > 50_000) activityLogThrottle.clear();
}

export async function getPresences(userIds: string[]): Promise<Presence[]> {
  const unique = [...new Set(userIds)];
  const raw = await kv.mget(unique.map(key));
  const out: Presence[] = [];
  raw.forEach((r, i) => {
    if (!r) return;
    try {
      out.push(JSON.parse(r));
    } catch {
      out.push(OFFLINE(unique[i]!));
    }
  });
  return out;
}

export async function isOnline(userId: string) {
  return !!(await kv.get(key(userId)));
}

/** Renova o TTL das presenças mantidas por esta instância. */
setInterval(() => {
  for (const [userId, st] of local) {
    if (st.last && st.conns.size && !st.last.includes('"offline"')) void kv.set(key(userId), st.last, TTL);
  }
}, 60_000).unref();
