/**
 * Painel do Criador: só aparece para a conta com o selo "creator" (única por servidor).
 * O servidor confere a permissão em toda chamada; esta tela é só a interface.
 */
import { useEffect, useState } from 'react';
import { Activity, Crown, Megaphone, RefreshCw, Search, ShieldOff, ShieldCheck, Trash2, Users, Server, MessageSquare, Phone, Sparkles } from 'lucide-react';
import type { PublicUser } from '@vinlancord/shared';
import { api } from '../../lib/api';
import { ui } from '../../store/ui';
import { useAppearance, editAppearance } from '../../store/appearance';
import { CREATOR_THEME } from '../../lib/themes';
import { relativeTime } from '../../lib/format';
import { Avatar, Button, Input, Segmented, Spinner, Textarea, cx } from '../ui';
import { SectionTitle, Card } from './SettingsLayout';

interface Overview {
  users: number;
  suspended: number;
  online: number;
  guilds: number;
  channels: number;
  messages: number;
  inCalls: number;
  activeCalls: number;
  uptimeSec: number;
}
interface UserRow {
  user: PublicUser;
  email: string;
  suspended: boolean;
  online: boolean;
  messages: number;
  guilds: number;
}
interface GuildRow {
  id: string;
  name: string;
  icon: string | null;
  createdAt: string;
  owner: { username: string; displayName: string };
  members: number;
  channels: number;
}

type Tab = 'overview' | 'users' | 'guilds' | 'announce' | 'exclusive';

export default function CreatorPanel() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <>
      <SectionTitle sub="Exclusivo da sua conta de criador. Tudo aqui vale para o servidor em que você está conectado.">
        <span className="inline-flex items-center gap-3">
          Painel do Criador <span className="vl-badge-creator inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-heading text-[14px]"><Crown size={14} /> Lord of Freedom</span>
        </span>
      </SectionTitle>
      <div className="mb-5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Visão geral' },
            { value: 'users', label: 'Contas' },
            { value: 'guilds', label: 'Comunidades' },
            { value: 'announce', label: 'Anúncio' },
            { value: 'exclusive', label: 'Exclusivos' },
          ]}
        />
      </div>
      <div key={tab} className="animate-slide-up">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'guilds' && <GuildsTab />}
        {tab === 'announce' && <AnnounceTab />}
        {tab === 'exclusive' && <ExclusiveTab />}
      </div>
    </>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="vl-cut rounded-xl border border-line bg-bg-1/70 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-2">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="mt-1 font-heading text-3xl text-fg">{value}</div>
      {hint && <div className="text-xs text-fg-2">{hint}</div>}
    </div>
  );
}

function OverviewTab() {
  const [d, setD] = useState<Overview | null>(null);
  const load = () => void api.get<Overview>('/creator/overview').then(setD).catch((e) => ui.error(e));
  useEffect(load, []);
  if (!d) return <Spinner />;
  const up = d.uptimeSec >= 3600 ? `${Math.floor(d.uptimeSec / 3600)} h ${Math.floor((d.uptimeSec % 3600) / 60)} min` : `${Math.floor(d.uptimeSec / 60)} min`;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat icon={<Users size={14} />} label="Contas" value={d.users} hint={d.suspended ? `${d.suspended} suspensa(s)` : undefined} />
        <Stat icon={<Activity size={14} />} label="Online agora" value={d.online} />
        <Stat icon={<Server size={14} />} label="Comunidades" value={d.guilds} hint={`${d.channels} canais`} />
        <Stat icon={<MessageSquare size={14} />} label="Mensagens" value={d.messages.toLocaleString('pt-BR')} />
        <Stat icon={<Phone size={14} />} label="Em chamada" value={d.inCalls} hint={`${d.activeCalls} chamada(s) ativa(s)`} />
        <Stat icon={<RefreshCw size={14} />} label="No ar há" value={up} />
      </div>
      <Button className="mt-4" size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={load}>
        Atualizar
      </Button>
    </>
  );
}

function UsersTab() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const load = (query = q) => void api.get<UserRow[]>(`/creator/users?q=${encodeURIComponent(query)}`).then(setRows).catch((e) => ui.error(e));
  useEffect(() => load(''), []);
  const toggle = (r: UserRow) => {
    const go = async () => {
      await api.post(`/creator/users/${r.user.id}/suspend`, { suspended: !r.suspended });
      ui.success(r.suspended ? `${r.user.displayName} reativado(a).` : `${r.user.displayName} suspenso(a).`);
      load();
    };
    if (r.suspended) return void go().catch((e) => ui.error(e));
    ui.confirm({
      title: `Suspender ${r.user.displayName}?`,
      body: 'A pessoa é desconectada na hora e não consegue mais entrar até você reativar. Mensagens e dados ficam guardados.',
      confirmLabel: 'Suspender',
      danger: true,
      onConfirm: go,
    });
  };
  return (
    <Card>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, usuário ou e-mail" />
        <Button type="submit" variant="secondary" icon={<Search size={14} />}>
          Buscar
        </Button>
      </form>
      {!rows ? (
        <Spinner />
      ) : !rows.length ? (
        <p className="text-sm text-fg-2">Ninguém encontrado.</p>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.user.id} className="flex items-center gap-3 py-2.5">
              <Avatar userId={r.user.id} src={r.user.avatar} name={r.user.displayName} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate text-sm font-semibold text-fg">
                  {r.user.displayName}
                  {r.user.badges?.includes('creator') && <Crown size={13} className="text-warning" />}
                  {r.online && <span className="size-2 rounded-full bg-online" title="Online" />}
                  {r.suspended && <span className="rounded bg-danger/20 px-1.5 text-[10px] font-bold text-danger">SUSPENSA</span>}
                </div>
                <div className="truncate text-xs text-fg-2">
                  @{r.user.username} · {r.email} · {r.messages} msg · {r.guilds} comunidade(s) · desde {relativeTime(r.user.createdAt)}
                </div>
              </div>
              {!r.user.badges?.includes('creator') && (
                <Button size="sm" variant={r.suspended ? 'secondary' : 'danger'} icon={r.suspended ? <ShieldCheck size={14} /> : <ShieldOff size={14} />} onClick={() => toggle(r)}>
                  {r.suspended ? 'Reativar' : 'Suspender'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function GuildsTab() {
  const [rows, setRows] = useState<GuildRow[] | null>(null);
  const load = () => void api.get<GuildRow[]>('/creator/guilds').then(setRows).catch((e) => ui.error(e));
  useEffect(load, []);
  return (
    <Card>
      {!rows ? (
        <Spinner />
      ) : !rows.length ? (
        <p className="text-sm text-fg-2">Nenhuma comunidade criada ainda.</p>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((g) => (
            <div key={g.id} className="flex items-center gap-3 py-2.5">
              <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-bg-4 font-semibold text-fg">
                {g.icon ? <img src={g.icon} alt="" className="size-full object-cover" /> : g.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg">{g.name}</div>
                <div className="truncate text-xs text-fg-2">
                  dono @{g.owner.username} · {g.members} membro(s) · {g.channels} canais · criada {relativeTime(g.createdAt)}
                </div>
              </div>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={14} />}
                onClick={() =>
                  ui.confirm({
                    title: `Apagar "${g.name}"?`,
                    body: 'Todos os canais e mensagens dessa comunidade serão apagados para sempre. Não tem como desfazer.',
                    confirmLabel: 'Apagar para sempre',
                    danger: true,
                    onConfirm: async () => {
                      await api.del(`/creator/guilds/${g.id}`);
                      ui.success('Comunidade apagada.');
                      load();
                    },
                  })
                }
              >
                Apagar
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AnnounceTab() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Anúncio para todo mundo conectado">
      <Textarea rows={4} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: Servidor vai reiniciar em 5 minutos!" />
      <div className="mt-3 flex items-center gap-3">
        <Button
          icon={<Megaphone size={15} />}
          loading={busy}
          disabled={!text.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.post<{ delivered: number }>('/creator/announce', { text });
              ui.success(`Anúncio enviado para ${r.delivered} pessoa(s) conectada(s).`);
              setText('');
            } catch (e) {
              ui.error(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Enviar anúncio
        </Button>
        <span className="text-xs text-fg-2">{text.length}/500 · aparece em destaque com som para quem estiver com o app aberto</span>
      </div>
    </Card>
  );
}

function ExclusiveTab() {
  const preset = useAppearance((s) => s.current.preset);
  const active = preset === CREATOR_THEME.id;
  return (
    <>
      <Card title="Estética exclusiva">
        <div className="flex items-center gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-xl" style={{ background: `radial-gradient(circle at 30% 20%, ${CREATOR_THEME.colors.accent}, ${CREATOR_THEME.colors['bg-0']} 70%)` }}>
            <Crown className="text-[#f7d774]" size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-heading text-lg text-fg">{CREATOR_THEME.name}</div>
            <div className="text-sm text-fg-2">{CREATOR_THEME.description}</div>
          </div>
          <Button icon={<Sparkles size={15} />} disabled={active} onClick={() => editAppearance(CREATOR_THEME.appearance)}>
            {active ? 'Em uso' : 'Usar'}
          </Button>
        </div>
      </Card>
      <Card title="Seu nome">
        <p className="text-sm text-fg-1">
          Seu nome aparece em <span className={cx('vl-name-creator font-semibold')}>dourado animado</span> no chat para todo mundo, junto com o selo. É automático para a conta criadora.
        </p>
      </Card>
    </>
  );
}
