/** Tela inicial de amigos: online, todos, pendentes, bloqueados, adicionar + "Ativos agora". */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Users, MessageSquare, MoreVertical, Check, X, UserPlus, Search, Gamepad2, Volume2, Ban, Phone } from 'lucide-react';
import { useStore, S } from '../../store';
import { ui, useUI } from '../../store/ui';
import { addFriend, openDM, startCall } from '../../store/actions';
import { api, errorMessage } from '../../lib/api';
import { Avatar, Button, EmptyState, IconButton, STATUS_LABEL, Tooltip, cx, usePresenceStatus, Badge } from '../ui';
import { userMenu } from '../profile/userMenu';

type Tab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

export function FriendsView() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'online';
  const setTab = (t: Tab) => setParams(t === 'online' ? {} : { tab: t });
  const rels = useStore((s) => s.relationships);
  const presences = useStore((s) => s.presences);
  const [q, setQ] = useState('');
  useEffect(() => {
    useUI.setState({ currentChannelId: null, currentGuildId: null });
  }, []);
  const pendingCount = Object.values(rels).filter((r) => r.type === 'incoming').length;
  const list = useMemo(() => {
    const all = Object.values(rels);
    let l = all;
    if (tab === 'online') l = all.filter((r) => r.type === 'friend' && (presences[r.id]?.status ?? 'offline') !== 'offline');
    else if (tab === 'all') l = all.filter((r) => r.type === 'friend');
    else if (tab === 'pending') l = all.filter((r) => r.type === 'incoming' || r.type === 'outgoing');
    else if (tab === 'blocked') l = all.filter((r) => r.type === 'blocked');
    const n = q.toLowerCase();
    return l.filter((r) => !n || r.user.displayName.toLowerCase().includes(n) || r.user.username.includes(n)).sort((a, b) => a.user.displayName.localeCompare(b.user.displayName, 'pt-BR'));
  }, [rels, presences, tab, q]);

  const tabs: [Tab, string][] = [
    ['online', 'Disponível'],
    ['all', 'Todos'],
    ['pending', 'Pendentes'],
    ['blocked', 'Bloqueados'],
  ];

  return (
    <main className="vl-panel flex min-w-0 flex-1 flex-col">
      <header className="vl-header flex h-12 shrink-0 items-center gap-3 px-4">
        <Users size={20} className="text-fg-2" />
        <span className="font-heading text-[17px] text-fg">Amigos</span>
        <span className="mx-1 h-6 w-px bg-line-strong" />
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={cx('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[14px] font-medium transition', tab === t ? 'bg-bg-4 text-fg' : 'text-fg-2 hover:bg-bg-3 hover:text-fg-1')}>
            {label}
            {t === 'pending' && <Badge count={pendingCount} />}
          </button>
        ))}
        <button onClick={() => setTab('add')} className={cx('rounded-md px-2.5 py-1 text-[14px] font-medium transition', tab === 'add' ? 'bg-transparent text-success' : 'bg-success text-white hover:brightness-110')}>
          Adicionar amigo
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="scroll-thin min-w-0 flex-1 overflow-y-auto px-6 py-4">
          {tab === 'add' ? (
            <AddFriend />
          ) : (
            <>
              <div className="mb-4 flex h-9 items-center gap-2 rounded-lg border border-line bg-bg-1 px-3">
                <Search size={15} className="text-fg-2" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-2" />
              </div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-2">
                {{ online: 'Disponível', all: 'Todos os amigos', pending: 'Pendentes', blocked: 'Bloqueados', add: '' }[tab]} — {list.length}
              </div>
              {list.map((r) => (
                <FriendRow key={r.id} id={r.id} type={r.type} />
              ))}
              {!list.length && (
                <EmptyState
                  icon={tab === 'blocked' ? <Ban size={28} /> : <Users size={28} />}
                  title={{ online: 'Ninguém online agora', all: 'Você ainda não adicionou amigos', pending: 'Nenhum pedido pendente', blocked: 'Ninguém bloqueado', add: '' }[tab]}
                  body={tab === 'online' || tab === 'all' ? 'Adicione amigos pelo nome de usuário ou ID e comece a resenha.' : undefined}
                  action={tab !== 'blocked' && tab !== 'pending' ? <Button onClick={() => setTab('add')} icon={<UserPlus size={16} />}>Adicionar amigo</Button> : undefined}
                />
              )}
            </>
          )}
        </div>
        <ActiveNow />
      </div>
    </main>
  );
}

function FriendRow({ id, type }: { id: string; type: string }) {
  const user = useStore((s) => s.users[id] ?? s.relationships[id]?.user);
  const status = usePresenceStatus(id);
  const presence = useStore((s) => s.presences[id]);
  if (!user) return null;
  const subtitle =
    type === 'incoming' ? 'Pedido de amizade recebido' : type === 'outgoing' ? 'Pedido de amizade enviado' : type === 'blocked' ? 'Bloqueado' : presence?.activities[0] ? `Jogando ${presence.activities[0].name}` : presence?.customStatus?.text ?? STATUS_LABEL[status];
  return (
    <div
      onClick={() => type === 'friend' && void openDM(id)}
      onContextMenu={(e) => userMenu(e, id, null)}
      className="group flex h-[62px] cursor-pointer items-center gap-3 border-t border-line px-2 transition hover:rounded-lg hover:border-transparent hover:bg-bg-3"
    >
      <Avatar userId={id} size={36} status={type === 'friend' ? status : null} ring="var(--vl-bg-2)" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate font-semibold text-fg">{user.displayName}</span>
          <span className="hidden truncate text-sm text-fg-2 group-hover:inline">{user.username}</span>
        </div>
        <div className="truncate text-[13px] text-fg-2">{subtitle}</div>
      </div>
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        {type === 'friend' && (
          <>
            <IconButton label="Mensagem" onClick={() => void openDM(id)} className="size-9 rounded-full bg-bg-1"><MessageSquare size={17} /></IconButton>
            <IconButton label="Ligar" onClick={() => void startCall(id).catch((e) => ui.error(e))} className="size-9 rounded-full bg-bg-1"><Phone size={17} /></IconButton>
            <IconButton label="Mais" onClick={(e) => userMenu(e, id, null)} className="size-9 rounded-full bg-bg-1"><MoreVertical size={17} /></IconButton>
          </>
        )}
        {type === 'incoming' && (
          <>
            <IconButton label="Aceitar" onClick={() => void api.put(`/relationships/${id}`).catch((e) => ui.error(e))} className="size-9 rounded-full bg-bg-1 hover:text-success"><Check size={18} /></IconButton>
            <IconButton label="Recusar" onClick={() => void api.del(`/relationships/${id}`)} className="size-9 rounded-full bg-bg-1 hover:text-danger"><X size={18} /></IconButton>
          </>
        )}
        {type === 'outgoing' && (
          <IconButton label="Cancelar pedido" onClick={() => void api.del(`/relationships/${id}`)} className="size-9 rounded-full bg-bg-1 hover:text-danger"><X size={18} /></IconButton>
        )}
        {type === 'blocked' && (
          <Button size="sm" variant="secondary" onClick={() => void api.del(`/relationships/${id}`)}>Desbloquear</Button>
        )}
      </div>
    </div>
  );
}

function AddFriend() {
  const [v, setV] = useState('');
  const [state, setState] = useState<{ ok?: string; err?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const me = useStore((s) => s.me);
  return (
    <div className="max-w-2xl">
      <h2 className="font-heading text-xl uppercase tracking-wide text-fg">Adicionar amigo</h2>
      <p className="mt-1 text-sm text-fg-2">Você pode adicionar amigos pelo nome de usuário do Vinlancord ou pelo ID.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!v.trim()) return;
          setLoading(true);
          setState(null);
          try {
            await addFriend(v);
            setState({ ok: `Pedido de amizade enviado para ${v.replace(/^@/, '')}! 🎉` });
            setV('');
          } catch (er) {
            setState({ err: errorMessage(er) === 'Usuário não encontrado.' ? 'Hmm, não encontramos ninguém com esse nome. Confere a grafia?' : errorMessage(er) });
          } finally {
            setLoading(false);
          }
        }}
        className={cx('mt-4 flex items-center gap-2 rounded-xl border bg-bg-1 p-2 pl-4 transition', state?.err ? 'border-danger' : state?.ok ? 'border-success' : 'border-line focus-within:border-accent')}
      >
        <input autoFocus value={v} onChange={(e) => (setV(e.target.value), setState(null))} placeholder="Nome de usuário ou ID" className="h-9 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-2" />
        <Button type="submit" loading={loading} disabled={!v.trim()}>Enviar pedido</Button>
      </form>
      {state?.ok && <p className="mt-2 text-sm text-success animate-fade-in">{state.ok}</p>}
      {state?.err && <p className="mt-2 text-sm text-danger animate-fade-in">{state.err}</p>}
      <div className="mt-8 rounded-xl border border-line bg-bg-1 p-4 text-sm text-fg-1">
        Seu nome de usuário é <b className="text-fg">{me?.username}</b> e seu ID é{' '}
        <Tooltip label="Clique para copiar">
          <button className="font-mono text-accent-2 hover:underline" onClick={() => (void navigator.clipboard.writeText(me?.id ?? ''), ui.success('ID copiado!'))}>
            {me?.id}
          </button>
        </Tooltip>
        . Compartilhe com a galera!
      </div>
    </div>
  );
}

function ActiveNow() {
  const rels = useStore((s) => s.relationships);
  const presences = useStore((s) => s.presences);
  const voiceStates = useStore((s) => s.voiceStates);
  const channels = useStore((s) => s.channels);
  const guilds = useStore((s) => s.guilds);
  const active = Object.values(rels)
    .filter((r) => r.type === 'friend')
    .map((r) => ({ id: r.id, p: presences[r.id], v: voiceStates[r.id] }))
    .filter((x) => (x.p && x.p.status !== 'offline' && x.p.activities.length) || x.v);
  return (
    <aside className="vl-subpanel scroll-thin hidden w-[340px] shrink-0 overflow-y-auto border-l border-line p-4 xl:block">
      <h2 className="mb-4 font-heading text-xl text-fg">Ativos agora</h2>
      {!active.length ? (
        <div className="py-6 text-center">
          <div className="font-semibold text-fg">Está tranquilo por enquanto…</div>
          <p className="mt-1 text-sm text-fg-2">Quando amigos estiverem jogando ou em chamada, aparece aqui.</p>
        </div>
      ) : (
        active.map(({ id, p, v }) => {
          const ch = v ? channels[v.channelId] : undefined;
          return (
            <div key={id} className="mb-3 cursor-pointer rounded-xl border border-line bg-bg-1 p-3 transition hover:bg-bg-3" onClick={(e) => ui.profile(id, null, e.currentTarget)}>
              <div className="flex items-center gap-3">
                <Avatar userId={id} size={36} status={p?.status ?? 'offline'} />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-fg">{S().users[id]?.displayName}</div>
                  <div className="truncate text-xs text-fg-2">{p?.activities[0] ? p.activities[0].name : ch ? 'Em chamada' : ''}</div>
                </div>
                {p?.activities[0] && <Gamepad2 size={18} className="ml-auto shrink-0 text-accent" />}
              </div>
              {ch && (
                <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-bg-3 px-2 py-1.5 text-xs text-fg-1">
                  <Volume2 size={13} className="text-success" /> {ch.guildId ? `${ch.name} • ${guilds[ch.guildId]?.name ?? ''}` : 'Chamada privada'}
                </div>
              )}
            </div>
          );
        })
      )}
    </aside>
  );
}
