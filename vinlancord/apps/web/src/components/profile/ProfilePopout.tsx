/** Cartão de perfil (popout) e conteúdo reutilizado no modal de perfil. */
import { useEffect, useState } from 'react';
import { MoreHorizontal, UserPlus, MessageSquare, Gamepad2, ExternalLink, Pencil, Clock, Check, Phone } from 'lucide-react';
import type { UserProfile } from '@vinlancord/shared';
import { api } from '../../lib/api';
import { useStore, displayName, S } from '../../store';
import { ui } from '../../store/ui';
import { addFriend, openDM, sendMessage, startCall } from '../../store/actions';
import { formatLongDate, elapsed, relativeTime } from '../../lib/format';
import { Markdown } from '../../lib/markdown';
import { openExternal } from '../../lib/desktop';
import { Avatar, Button, Spinner, STATUS_LABEL, Tooltip, usePresenceStatus, cx } from '../ui';
import { userMenu } from './userMenu';
import { UserBadges } from '../UserBadges';

const cache = new Map<string, { at: number; p: Promise<UserProfile> }>();
export function fetchProfile(userId: string, force = false) {
  const c = cache.get(userId);
  if (c && !force && Date.now() - c.at < 60_000) return c.p;
  const p = api.get<UserProfile>(`/users/${userId}/profile`);
  cache.set(userId, { at: Date.now(), p });
  p.catch(() => cache.delete(userId));
  return p;
}

export function useProfile(userId: string) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const userVersion = useStore((s) => s.users[userId]);
  const rel = useStore((s) => s.relationships[userId]?.type);
  useEffect(() => {
    let alive = true;
    void fetchProfile(userId, true)
      .then((p) => alive && setProfile(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId, userVersion, rel]);
  return profile;
}

export function ActivityCard({ userId }: { userId: string }) {
  const activity = useStore((s) => s.presences[userId]?.activities[0]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!activity?.startedAt) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [activity?.startedAt]);
  if (!activity) return null;
  return (
    <div className="rounded-xl border border-line bg-bg-3/60 p-3">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-fg-2">Jogando agora</div>
      <div className="flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-xl gradient-accent text-white"><Gamepad2 size={24} /></div>
        <div className="min-w-0">
          <div className="truncate font-semibold text-fg">{activity.name}</div>
          {activity.details && <div className="truncate text-xs text-fg-1">{activity.details}</div>}
          {activity.startedAt && (
            <div className="flex items-center gap-1 text-xs text-success">
              <Clock size={11} /> {elapsed(activity.startedAt)} de jogo
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePopout({ userId, guildId }: { userId: string; guildId: string | null }) {
  const user = useStore((s) => s.users[userId]);
  const me = useStore((s) => s.me);
  const profile = useProfile(userId);
  const status = usePresenceStatus(userId);
  const custom = useStore((s) => (userId === s.me?.id ? s.me?.customStatus : s.presences[userId]?.customStatus));
  const member = useStore((s) => (guildId ? s.members[guildId]?.[userId] : undefined));
  const roles = useStore((s) => (guildId ? s.roles[guildId] : undefined));
  const rel = useStore((s) => s.relationships[userId]?.type);
  const [msg, setMsg] = useState('');
  const self = userId === me?.id;
  if (!user) return <div className="grid h-40 w-80 place-items-center rounded-2xl bg-bg-1"><Spinner /></div>;
  const accent = user.accentColor ?? profile?.bannerColor ?? 'var(--vl-accent)';
  const memberRoles = member ? member.roles.map((r) => roles?.[r]).filter(Boolean).sort((a, b) => b!.position - a!.position) : [];
  return (
    <div className="w-[340px] overflow-hidden rounded-2xl border border-line-strong bg-bg-1 shadow-[var(--vl-shadow)]">
      <div className="relative h-[110px]" style={{ background: profile?.banner ? undefined : `linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 40%, var(--vl-bg-1)))` }}>
        {profile?.banner && <img src={profile.banner} alt="" className="size-full object-cover" />}
        <div className="absolute right-2 top-2 flex gap-1">
          {!self && (
            <Tooltip label="Mais">
              <button onClick={(e) => userMenu(e, userId, guildId)} className="grid size-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70">
                <MoreHorizontal size={16} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="relative px-4 pb-4">
        <div className="-mt-11 mb-2 flex items-end justify-between">
          <button onClick={() => (ui.closePopout(), ui.open({ type: 'profile', userId, guildId }))} className="rounded-full ring-[6px] ring-bg-1">
            <Avatar userId={userId} size={80} status={status} ring="var(--vl-bg-1)" animate />
          </button>
          {!self && rel !== 'friend' && rel !== 'blocked' && (
            <Button size="sm" variant={rel === 'outgoing' ? 'secondary' : 'success'} icon={rel === 'outgoing' ? <Check size={14} /> : <UserPlus size={14} />} disabled={rel === 'outgoing'} onClick={() => void addFriend(userId).catch((e) => ui.error(e))}>
              {rel === 'incoming' ? 'Aceitar' : rel === 'outgoing' ? 'Enviado' : 'Adicionar'}
            </Button>
          )}
          {self && (
            <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => (ui.closePopout(), ui.open({ type: 'userSettings', tab: 'profile' }))}>
              Editar perfil
            </Button>
          )}
        </div>
        <div className="rounded-xl bg-bg-2 p-3">
          <div className="font-display text-xl font-bold leading-tight text-fg">{guildId ? displayName(userId, guildId) : user.displayName}</div>
          <UserBadges userId={userId} size="md" className="my-1.5" />
          <div className="text-sm text-fg-1">
            {user.username}
            {profile?.pronouns && <span className="text-fg-2"> • {profile.pronouns}</span>}
          </div>
          <div className="mt-1 text-xs text-fg-2">{STATUS_LABEL[status]}</div>
          {(custom?.text || custom?.emoji) && <div className="mt-2 text-sm text-fg-1">{custom.emoji} {custom.text}</div>}
          <div className="my-3 h-px bg-line" />
          <div className="space-y-3">
            <ActivityCard userId={userId} />
            {profile?.bio && (
              <section>
                <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg-2">Sobre mim</h4>
                <div className="text-sm text-fg-1"><Markdown content={profile.bio} /></div>
              </section>
            )}
            <section>
              <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg-2">Membro desde</h4>
              <div className="text-sm text-fg-1">
                No Além-Mar desde {formatLongDate(user.createdAt)}
                {member && <div className="text-xs text-fg-2">Neste servidor desde {formatLongDate(member.joinedAt)}</div>}
              </div>
            </section>
            {memberRoles.length > 0 && (
              <section>
                <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg-2">Cargos</h4>
                <div className="flex flex-wrap gap-1">
                  {memberRoles.map((r) => (
                    <span key={r!.id} className="flex items-center gap-1.5 rounded-md bg-bg-4 px-2 py-0.5 text-xs text-fg-1">
                      <span className="size-2.5 rounded-full" style={{ background: r!.color ?? 'var(--vl-text-2)' }} />
                      {r!.name}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {profile?.links && profile.links.length > 0 && (
              <section className="flex flex-wrap gap-1.5">
                {profile.links.map((l) => (
                  <button key={l.url} onClick={() => ui.open({ type: 'externalLink', url: l.url })} className="flex items-center gap-1 rounded-md border border-line bg-bg-3 px-2 py-1 text-xs text-accent-2 hover:border-line-strong">
                    <ExternalLink size={12} /> {l.label}
                  </button>
                ))}
              </section>
            )}
          </div>
          {!self && (
            <form
              className="mt-4 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!msg.trim()) return;
                try {
                  const ch = await openDM(userId);
                  ui.closePopout();
                  await sendMessage(ch.id, msg.trim());
                } catch (er) {
                  ui.error(er);
                }
              }}
            >
              <input
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder={`Mensagem para @${user.username}`}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-3 text-sm text-fg outline-none focus:border-accent"
              />
              <Tooltip label="Ligar">
                <button type="button" onClick={() => void startCall(userId).then(() => ui.closePopout()).catch((er) => ui.error(er))} className="grid size-9 place-items-center rounded-lg bg-bg-4 text-fg-1 hover:text-fg">
                  <Phone size={16} />
                </button>
              </Tooltip>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProfileModalContent({ userId, guildId }: { userId: string; guildId: string | null }) {
  const profile = useProfile(userId);
  const [tab, setTab] = useState<'about' | 'guilds' | 'friends' | 'activity'>('about');
  const guilds = useStore((s) => s.guilds);
  const users = useStore((s) => s.users);
  const self = userId === S().me?.id;
  return (
    <div className="flex">
      <div className="shrink-0 p-4">
        <ProfilePopout userId={userId} guildId={guildId} />
      </div>
      <div className="flex min-h-[420px] w-[340px] flex-col py-4 pr-4">
        <div className="mb-3 flex gap-1 border-b border-line">
          {(
            [
              ['about', 'Sobre'],
              ['activity', 'Atividade'],
              ...(!self ? [['guilds', `Servidores (${profile?.mutualGuildIds.length ?? 0})`], ['friends', `Amigos (${profile?.mutualFriendIds.length ?? 0})`]] : []),
            ] as [typeof tab, string][]
          ).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={cx('-mb-px border-b-2 px-2 pb-2 text-sm font-medium transition', tab === k ? 'border-accent text-fg' : 'border-transparent text-fg-2 hover:text-fg-1')}>
              {label}
            </button>
          ))}
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto">
          {!profile ? (
            <Spinner />
          ) : tab === 'about' ? (
            <div className="space-y-3 text-sm text-fg-1">
              {profile.bio ? <Markdown content={profile.bio} /> : <p className="text-fg-2">{profile.hidden.includes('bio') ? 'Este perfil é visível apenas para amigos. 🔒' : 'Nenhuma bio por enquanto.'}</p>}
              {profile.links?.map((l) => (
                <button key={l.url} onClick={() => openExternal(l.url)} className="flex items-center gap-2 text-accent-2 hover:underline">
                  <ExternalLink size={14} /> {l.label}
                </button>
              ))}
            </div>
          ) : tab === 'activity' ? (
            <div className="space-y-2">
              <ActivityCard userId={userId} />
              {profile.recentActivities === null ? (
                <p className="text-sm text-fg-2">A atividade recente desta pessoa é privada.</p>
              ) : profile.recentActivities.length ? (
                profile.recentActivities.map((a) => (
                  <div key={a.name} className="flex items-center gap-3 rounded-lg bg-bg-3 p-2.5">
                    <Gamepad2 size={18} className="text-accent" />
                    <span className="flex-1 truncate text-sm text-fg">{a.name}</span>
                    <span className="text-xs text-fg-2">{relativeTime(a.lastSeenAt)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-fg-2">Nenhuma atividade recente.</p>
              )}
            </div>
          ) : tab === 'guilds' ? (
            profile.mutualGuildIds.map((id) => (
              <div key={id} className="flex items-center gap-2 rounded-md p-2 text-sm text-fg hover:bg-bg-3">{guilds[id]?.name ?? 'Servidor'}</div>
            ))
          ) : (
            profile.mutualFriendIds.map((id) => (
              <button key={id} onClick={() => ui.open({ type: 'profile', userId: id })} className="flex w-full items-center gap-2 rounded-md p-2 text-sm text-fg hover:bg-bg-3">
                <Avatar userId={id} size={28} /> {users[id]?.displayName ?? 'Amigo'}
              </button>
            ))
          )}
        </div>
        {!self && (
          <Button variant="secondary" className="mt-3" icon={<MessageSquare size={16} />} onClick={() => void openDM(userId).then(() => ui.closeAll())}>
            Enviar mensagem
          </Button>
        )}
      </div>
    </div>
  );
}
