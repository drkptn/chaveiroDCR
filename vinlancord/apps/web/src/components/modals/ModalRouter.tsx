/** Todos os modais do app, roteados pelo tipo. */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Hash,
  Volume2,
  Video,
  Copy,
  Check,
  Upload,
  Users,
  Gamepad2,
  BookOpen,
  Sparkles,
  ExternalLink,
  CalendarDays,
  MapPin,
  Clock,
  Star,
  Search,
  Download,
  Monitor,
  AppWindow,
  Lock,
} from 'lucide-react';
import { LIMITS, P, has, type Invite, type ScheduledEvent, type GuildFull } from '@vinlancord/shared';
import { useGuildPerms } from '../../lib/perms';
import type { ModalSpec } from '../../store/ui';
import { ui } from '../../store/ui';
import { useShallow } from 'zustand/react/shallow';
import { useStore, reducers, S } from '../../store';
import { useLocal, local, type ScreenCodec, type ScreenQuality } from '../../store/local';
import { api, errorMessage } from '../../lib/api';
import { joinInvite, loadEvents } from '../../store/actions';
import { desktop, openExternal, type DesktopSource } from '../../lib/desktop';
import { voice } from '../../lib/voice/engine';
import { formatFull } from '../../lib/format';
import { nav as navigate } from '../../lib/nav';
import { Avatar, Button, Field, GuildIcon, Input, Modal, Segmented, Select, Spinner, Switch, Textarea, cx } from '../ui';
import { ProfileModalContent } from '../profile/ProfilePopout';

const UserSettings = lazy(() => import('../settings/UserSettings'));
const ServerSettings = lazy(() => import('../settings/ServerSettings'));
const ChannelSettings = lazy(() => import('../settings/ChannelSettings'));

export default function ModalRouter({ spec, onClose }: { spec: ModalSpec & { key: number }; onClose: () => void }) {
  switch (spec.type) {
    case 'createServer':
      return <CreateServerModal onClose={onClose} />;
    case 'joinServer':
      return <JoinServerModal onClose={onClose} initial={spec.code} />;
    case 'createChannel':
      return <CreateChannelModal onClose={onClose} guildId={spec.guildId} parentId={spec.parentId ?? null} kind={spec.kind} />;
    case 'invite':
      return <InviteModal onClose={onClose} guildId={spec.guildId} channelId={spec.channelId} />;
    case 'confirm':
      return <ConfirmModal onClose={onClose} spec={spec} />;
    case 'report':
      return <ReportModal onClose={onClose} spec={spec} />;
    case 'events':
      return <EventsModal onClose={onClose} guildId={spec.guildId} />;
    case 'image':
      return <ImageModal onClose={onClose} src={spec.src} filename={spec.filename} />;
    case 'quickSwitcher':
      return <QuickSwitcher onClose={onClose} />;
    case 'screenShare':
      return <ScreenShareModal onClose={onClose} />;
    case 'externalLink':
      return <ExternalLinkModal onClose={onClose} url={spec.url} />;
    case 'newGroup':
      return <NewGroupModal onClose={onClose} />;
    case 'customStatus':
      return <CustomStatusModal onClose={onClose} />;
    case 'profile':
      return (
        <Modal onClose={onClose} width={760} bare>
          <ProfileModalContent userId={spec.userId} guildId={spec.guildId ?? null} />
        </Modal>
      );
    case 'userSettings':
      return <Suspense fallback={<Spinner />}><UserSettings onClose={onClose} initialTab={spec.tab} /></Suspense>;
    case 'serverSettings':
      return <Suspense fallback={<Spinner />}><ServerSettings onClose={onClose} guildId={spec.guildId} initialTab={spec.tab} /></Suspense>;
    case 'channelSettings':
      return <Suspense fallback={<Spinner />}><ChannelSettings onClose={onClose} channelId={spec.channelId} initialTab={spec.tab} /></Suspense>;
  }
}

/* ───────────── servidores ───────────── */

function CreateServerModal({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const me = useStore((s) => s.me);
  const [step, setStep] = useState<'pick' | 'name'>('pick');
  const [template, setTemplate] = useState<'amigos' | 'jogos' | 'estudos' | 'vazio'>('amigos');
  const [name, setName] = useState(`Servidor de ${me?.displayName ?? 'alguém'}`);
  const [icon, setIcon] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const iconUrl = useMemo(() => (icon ? URL.createObjectURL(icon) : null), [icon]);
  const templates = [
    { id: 'amigos' as const, label: 'Amigos', desc: 'Bate-papo, memes e calls com a galera', icon: <Users size={22} /> },
    { id: 'jogos' as const, label: 'Jogos', desc: 'Squads, clipes e procura de grupo', icon: <Gamepad2 size={22} /> },
    { id: 'estudos' as const, label: 'Estudos', desc: 'Salas de estudo, dúvidas e materiais', icon: <BookOpen size={22} /> },
    { id: 'vazio' as const, label: 'Do zero', desc: 'Só o básico: um canal de texto e um de voz', icon: <Sparkles size={22} /> },
  ];
  const create = async () => {
    setLoading(true);
    try {
      const g = await api.post<GuildFull>('/guilds', { name, template });
      reducers.GUILD_CREATE!(g);
      if (icon) {
        const fd = new FormData();
        fd.append('file', icon);
        await api.post(`/guilds/${g.id}/icon`, fd).catch((e) => ui.error(e, 'Não deu para enviar o ícone'));
      }
      onClose();
      const first = g.channels.find((c) => c.type === 'text');
      nav(`/channels/${g.id}${first ? '/' + first.id : ''}`);
      ui.success('Servidor criado! 🎉', 'Convide a galera pelo menu do servidor.');
    } catch (e) {
      ui.error(e);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal onClose={onClose} title={step === 'pick' ? 'Crie seu servidor' : 'Personalize seu servidor'} subtitle={step === 'pick' ? 'Seu servidor é onde você e seus amigos se encontram. Escolha um ponto de partida.' : 'Dê personalidade ao servidor com um nome e um ícone. Dá para mudar depois.'} width={460}>
      {step === 'pick' ? (
        <div className="space-y-2 pb-3">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => (setTemplate(t.id), setStep('name'))}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-bg-1 p-3 text-left transition hover:border-accent hover:bg-bg-3"
            >
              <span className="grid size-11 place-items-center rounded-xl gradient-accent text-white">{t.icon}</span>
              <span className="flex-1">
                <span className="block font-semibold text-fg">{t.label}</span>
                <span className="block text-xs text-fg-2">{t.desc}</span>
              </span>
            </button>
          ))}
          <div className="pt-3 text-center">
            <div className="text-sm font-semibold text-fg">Já tem um convite?</div>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => (onClose(), ui.open({ type: 'joinServer' }))}>Entrar em um servidor</Button>
          </div>
        </div>
      ) : (
        <div className="pb-4">
          <label className="mx-auto mb-5 grid size-24 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-line-strong bg-bg-1 text-fg-2 transition hover:border-accent hover:text-accent">
            {iconUrl ? <img src={iconUrl} alt="" className="size-full object-cover" /> : <span className="flex flex-col items-center text-[11px] font-semibold uppercase"><Upload size={22} />Ícone</span>}
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => setIcon(e.target.files?.[0] ?? null)} />
          </label>
          <Field label="Nome do servidor">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.GUILD_NAME_MAX} autoFocus />
          </Field>
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep('pick')}>Voltar</Button>
            <Button onClick={() => void create()} loading={loading} disabled={name.trim().length < 2}>Criar servidor</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function JoinServerModal({ onClose, initial }: { onClose: () => void; initial?: string }) {
  const [code, setCode] = useState(initial ?? '');
  const [preview, setPreview] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const parse = (v: string) => /([a-zA-Z0-9]{4,16})\/?$/.exec(v.trim())?.[1] ?? '';
  useEffect(() => {
    const c = parse(code);
    setPreview(null);
    if (c.length < 4) return;
    const t = setTimeout(() => void api.get<Invite>(`/invites/${c}`).then(setPreview).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [code]);
  return (
    <Modal onClose={onClose} title="Entrar em um servidor" subtitle="Cole um link ou código de convite." width={460}>
      <form
        className="space-y-4 pb-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          try {
            await joinInvite(parse(code));
            onClose();
          } catch (er) {
            setError(errorMessage(er));
          } finally {
            setLoading(false);
          }
        }}
      >
        <Field label="Link de convite" error={error}>
          <Input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="https://…/invite/aBcD1234 ou aBcD1234" />
        </Field>
        {preview && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-bg-1 p-3 animate-fade-in">
            <GuildIcon guild={preview.guild} size={44} className="rounded-xl" />
            <div className="min-w-0">
              <div className="truncate font-semibold text-fg">{preview.guild.name}</div>
              <div className="text-xs text-fg-2">{preview.guild.onlineCount} online • {preview.guild.memberCount} membros</div>
            </div>
          </div>
        )}
        <Button type="submit" className="w-full" loading={loading} disabled={!parse(code)}>Entrar</Button>
      </form>
    </Modal>
  );
}

function CreateChannelModal({ onClose, guildId, parentId, kind }: { onClose: () => void; guildId: string; parentId: string | null; kind?: 'text' | 'voice' | 'video' | 'category' }) {
  const nav = useNavigate();
  const [type, setType] = useState<'text' | 'voice' | 'video' | 'category'>(kind ?? 'text');
  const [name, setName] = useState('');
  const [priv, setPriv] = useState(false);
  const [loading, setLoading] = useState(false);
  const types = [
    { id: 'text' as const, label: 'Texto', desc: 'Mensagens, imagens, GIFs, emojis e arquivos', icon: <Hash size={22} /> },
    { id: 'voice' as const, label: 'Voz', desc: 'Conversa por voz, com câmera e tela opcionais', icon: <Volume2 size={22} /> },
    { id: 'video' as const, label: 'Vídeo', desc: 'Entra com a câmera ligada, em grade', icon: <Video size={22} /> },
  ];
  return (
    <Modal onClose={onClose} title={type === 'category' ? 'Criar categoria' : 'Criar canal'} width={460}>
      <form
        className="space-y-4 pb-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          try {
            const ch = await api.post<{ id: string }>(`/guilds/${guildId}/channels`, { name, type, parentId, private: priv });
            onClose();
            if (type === 'text') nav(`/channels/${guildId}/${ch.id}`);
          } catch (er) {
            ui.error(er);
          } finally {
            setLoading(false);
          }
        }}
      >
        {type !== 'category' && (
          <div className="space-y-2">
            {types.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setType(t.id)}
                className={cx('flex w-full items-center gap-3 rounded-xl border p-3 text-left transition', type === t.id ? 'border-accent bg-accent/10' : 'border-line bg-bg-1 hover:bg-bg-3')}
              >
                <span className="text-fg-1">{t.icon}</span>
                <span className="flex-1">
                  <span className="block font-semibold text-fg">{t.label}</span>
                  <span className="block text-xs text-fg-2">{t.desc}</span>
                </span>
                <span className={cx('size-5 rounded-full border-2', type === t.id ? 'border-accent bg-accent shadow-[inset_0_0_0_3px_var(--vl-bg-2)]' : 'border-line-strong')} />
              </button>
            ))}
          </div>
        )}
        <Field label={type === 'category' ? 'Nome da categoria' : 'Nome do canal'}>
          <Input autoFocus value={name} onChange={(e) => setName(type === 'text' ? e.target.value.toLowerCase().replace(/\s+/g, '-') : e.target.value)} placeholder={type === 'text' ? 'novo-canal' : 'Novo canal'} maxLength={100} />
        </Field>
        <div className="flex items-center justify-between rounded-xl border border-line bg-bg-1 p-3">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-fg-2" />
            <div>
              <div className="text-sm font-medium text-fg">{type === 'category' ? 'Categoria privada' : 'Canal privado'}</div>
              <div className="text-xs text-fg-2">Só você (e quem você liberar) verá.</div>
            </div>
          </div>
          <Switch checked={priv} onChange={setPriv} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading} disabled={!name.trim()}>Criar</Button>
        </div>
      </form>
    </Modal>
  );
}

function InviteModal({ onClose, guildId, channelId }: { onClose: () => void; guildId: string; channelId?: string }) {
  const guild = useStore((s) => s.guilds[guildId]);
  const target = channelId ?? Object.values(S().channels).find((c) => c.guildId === guildId && c.type === 'text')?.id;
  const [opts, setOpts] = useState({ maxAge: 604800, maxUses: 0 });
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const friends = useStore(useShallow((s) => Object.values(s.relationships).filter((r) => r.type === 'friend')));
  const [sent, setSent] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!target) return;
    setCode(null);
    void api.post<{ code: string }>(`/channels/${target}/invites`, opts).then((r) => setCode(r.code)).catch((e) => ui.error(e));
  }, [target, opts]);
  const base = api.server.replace(/\/$/, '');
  const link = code ? `${base}/#/invite/${code}` : '';
  return (
    <Modal onClose={onClose} title={`Convidar amigos para ${guild?.name ?? ''}`} width={480}>
      <div className="pb-4">
        {friends.length > 0 && (
          <div className="scroll-thin mb-4 max-h-56 space-y-1 overflow-y-auto">
            {friends.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-bg-3">
                <Avatar userId={f.id} size={32} />
                <span className="flex-1 truncate text-sm text-fg">{f.user.displayName}</span>
                <Button
                  size="sm"
                  variant={sent[f.id] ? 'ghost' : 'secondary'}
                  disabled={!code || sent[f.id]}
                  onClick={async () => {
                    try {
                      const dm = await api.post<{ id: string }>('/users/@me/channels', { recipients: [f.id] });
                      await api.post(`/channels/${dm.id}/messages`, { content: link });
                      setSent({ ...sent, [f.id]: true });
                    } catch (e) {
                      ui.error(e);
                    }
                  }}
                >
                  {sent[f.id] ? 'Enviado' : 'Convidar'}
                </Button>
              </div>
            ))}
          </div>
        )}
        <Field label="Ou envie este link">
          <div className="flex gap-2">
            <Input readOnly value={link || 'Gerando…'} onFocus={(e) => e.target.select()} />
            <Button
              variant={copied ? 'success' : 'primary'}
              icon={copied ? <Check size={16} /> : <Copy size={16} />}
              disabled={!code}
              onClick={() => {
                void navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Expira em">
            <Select
              value={String(opts.maxAge)}
              onChange={(v) => setOpts({ ...opts, maxAge: Number(v) })}
              options={[
                { value: '1800', label: '30 minutos' },
                { value: '3600', label: '1 hora' },
                { value: '86400', label: '1 dia' },
                { value: '604800', label: '7 dias' },
                { value: '0', label: 'Nunca' },
              ]}
            />
          </Field>
          <Field label="Máximo de usos">
            <Select
              value={String(opts.maxUses)}
              onChange={(v) => setOpts({ ...opts, maxUses: Number(v) })}
              options={[{ value: '0', label: 'Sem limite' }, ...[1, 5, 10, 25, 50, 100].map((n) => ({ value: String(n), label: `${n} uso${n > 1 ? 's' : ''}` }))]}
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-fg-2">Quem abrir o link no app Vinlancord ou no navegador cai direto no servidor. Para entrar pelo app, use “Entrar em um servidor” e cole o link.</p>
      </div>
    </Modal>
  );
}

/* ───────────── confirmação e denúncia ───────────── */

function ConfirmModal({ onClose, spec }: { onClose: () => void; spec: Extract<ModalSpec, { type: 'confirm' }> }) {
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  return (
    <Modal
      onClose={onClose}
      title={spec.title}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant={spec.danger ? 'danger' : 'primary'}
            loading={loading}
            disabled={spec.requirePassword && !password}
            onClick={async () => {
              setLoading(true);
              try {
                await spec.onConfirm(password);
                onClose();
              } catch (e) {
                ui.error(e);
              } finally {
                setLoading(false);
              }
            }}
          >
            {spec.confirmLabel ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="pb-3 text-sm text-fg-1">{spec.body}</div>
      {spec.requirePassword && (
        <Field label="Sua senha" className="pb-3">
          <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}

function ReportModal({ onClose, spec }: { onClose: () => void; spec: Extract<ModalSpec, { type: 'report' }> }) {
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const reasons = [
    ['spam', 'Spam ou propaganda'],
    ['assedio', 'Assédio ou bullying'],
    ['odio', 'Discurso de ódio'],
    ['violencia', 'Violência ou ameaças'],
    ['conteudo_sexual', 'Conteúdo sexual indesejado'],
    ['golpe', 'Golpe ou fraude'],
    ['menor_de_idade', 'Envolve menores de idade'],
    ['outro', 'Outro motivo'],
  ];
  return (
    <Modal
      onClose={onClose}
      title={`Denunciar ${spec.label ?? ''}`}
      subtitle="Sua denúncia é confidencial. Obrigado por ajudar a manter o Vinlancord seguro."
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="danger"
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await api.post('/reports', { targetType: spec.targetType, targetId: spec.targetId, channelId: spec.channelId, reason, details });
                ui.success('Denúncia enviada', 'Obrigado! Ela será analisada pela moderação.');
                onClose();
              } catch (e) {
                ui.error(e);
              } finally {
                setLoading(false);
              }
            }}
          >
            Enviar denúncia
          </Button>
        </>
      }
    >
      <div className="space-y-1.5 pb-3">
        {reasons.map(([id, label]) => (
          <label key={id} className={cx('flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm transition', reason === id ? 'border-danger/60 bg-danger/10 text-fg' : 'border-line text-fg-1 hover:bg-bg-3')}>
            <input type="radio" name="reason" checked={reason === id} onChange={() => setReason(id!)} className="accent-[var(--vl-danger)]" />
            {label}
          </label>
        ))}
        <Field label="Detalhes (opcional)" className="pt-2">
          <Textarea rows={3} maxLength={LIMITS.REPORT_DETAILS_MAX} value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ───────────── eventos ───────────── */

function EventsModal({ onClose, guildId }: { onClose: () => void; guildId: string }) {
  const events = useStore((s) => s.events[guildId]);
  const channels = useStore(useShallow((s) => Object.values(s.channels).filter((c) => c.guildId === guildId && (c.type === 'voice' || c.type === 'video'))));
  const canManage = has(useGuildPerms(guildId), P.MANAGE_EVENTS);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', location: '', channelId: '', date: '', time: '20:00' });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    void loadEvents(guildId).catch(() => {});
  }, [guildId]);
  const rsvp = async (e: ScheduledEvent) => {
    try {
      const updated = await (e.me ? api.del<ScheduledEvent>(`/guilds/${guildId}/events/${e.id}/rsvp`) : api.put<ScheduledEvent>(`/guilds/${guildId}/events/${e.id}/rsvp`));
      useStore.setState((s) => ({ events: { ...s.events, [guildId]: (s.events[guildId] ?? []).map((x) => (x.id === e.id ? updated : x)) } }));
    } catch (er) {
      ui.error(er);
    }
  };
  return (
    <Modal onClose={onClose} title={creating ? 'Criar evento' : 'Eventos'} subtitle={creating ? 'Quem confirmar presença será avisado quando começar.' : 'Próximos eventos do servidor'} width={520}>
      {creating ? (
        <form
          className="space-y-3 pb-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              const startAt = new Date(`${form.date}T${form.time}`).toISOString();
              await api.post(`/guilds/${guildId}/events`, { name: form.name, description: form.description, location: form.location, channelId: form.channelId || null, startAt });
              await loadEvents(guildId);
              setCreating(false);
              ui.success('Evento criado!');
            } catch (er) {
              ui.error(er);
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="Nome do evento"><Input autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} placeholder="Noite de jogos 🎮" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Horário"><Input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
          </div>
          <Field label="Canal de voz (opcional)">
            <Select value={form.channelId} onChange={(v) => setForm({ ...form, channelId: v })} options={[{ value: '', label: 'Nenhum / outro lugar' }, ...channels.map((c) => ({ value: c.id, label: c.name }))]} />
          </Field>
          {!form.channelId && <Field label="Local"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ex.: Casa do D, link, jogo…" /></Field>}
          <Field label="Descrição"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Voltar</Button>
            <Button type="submit" loading={loading}>Criar evento</Button>
          </div>
        </form>
      ) : (
        <div className="pb-4">
          {!events ? (
            <div className="grid h-32 place-items-center"><Spinner /></div>
          ) : !events.length ? (
            <div className="py-10 text-center">
              <CalendarDays size={36} className="mx-auto text-fg-2" />
              <div className="mt-3 font-semibold text-fg">Nenhum evento marcado</div>
              <p className="text-sm text-fg-2">Que tal organizar uma noite de jogos?</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((e) => (
                <div key={e.id} className="overflow-hidden rounded-xl border border-line bg-bg-1">
                  {e.cover && <img src={e.cover} alt="" className="h-28 w-full object-cover" />}
                  <div className="p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-accent">
                      <Clock size={13} /> {e.status === 'active' ? <span className="text-success">Acontecendo agora!</span> : formatFull(e.startAt)}
                    </div>
                    <div className="mt-1 font-display text-lg font-bold text-fg">{e.name}</div>
                    {e.description && <p className="mt-1 whitespace-pre-wrap text-sm text-fg-1">{e.description}</p>}
                    <div className="mt-2 flex items-center gap-3 text-xs text-fg-2">
                      {(e.location || e.channelId) && (
                        <span className="flex items-center gap-1"><MapPin size={12} /> {e.channelId ? S().channels[e.channelId]?.name ?? 'Canal' : e.location}</span>
                      )}
                      <span className="flex items-center gap-1"><Star size={12} /> {e.interestedCount} interessado{e.interestedCount === 1 ? '' : 's'}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant={e.me ? 'secondary' : 'primary'} icon={<Star size={14} className={e.me ? 'fill-warning text-warning' : ''} />} onClick={() => void rsvp(e)}>
                        {e.me ? 'Tenho interesse ✓' : 'Tenho interesse'}
                      </Button>
                      {canManage && (
                        <Button size="sm" variant="ghost" onClick={() => ui.confirm({ title: 'Cancelar evento?', body: e.name, danger: true, confirmLabel: 'Excluir evento', onConfirm: async () => { await api.del(`/guilds/${guildId}/events/${e.id}`); await loadEvents(guildId); } })}>
                          Excluir
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {canManage && <Button className="mt-4 w-full" variant="secondary" icon={<CalendarDays size={16} />} onClick={() => setCreating(true)}>Criar evento</Button>}
        </div>
      )}
    </Modal>
  );
}

/* ───────────── diversos ───────────── */

function ImageModal({ onClose, src, filename }: { onClose: () => void; src: string; filename?: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-8 animate-fade-in" onClick={onClose}>
      <img src={src} alt={filename} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl animate-pop-in" onClick={(e) => e.stopPropagation()} />
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <a href={src + (src.includes('?') ? '&' : '?') + 'download=1'} download={filename} className="flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 text-white hover:bg-black">
          <Download size={14} /> Baixar
        </a>
        <button onClick={() => openExternal(src)} className="flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 text-white hover:bg-black">
          <ExternalLink size={14} /> Abrir original
        </button>
      </div>
    </div>
  );
}

function ExternalLinkModal({ onClose, url }: { onClose: () => void; url: string }) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* ignora */
  }
  return (
    <Modal
      onClose={onClose}
      title="Saindo do Vinlancord"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button onClick={() => (openExternal(url), onClose())}>Visitar site</Button>
        </>
      }
    >
      <p className="pb-2 text-sm text-fg-1">Este link vai te levar para <b className="text-fg">{host}</b>. Tem certeza que quer abrir?</p>
      <div className="mb-3 break-all rounded-lg bg-bg-1 p-3 font-mono text-xs text-fg-1">{url}</div>
    </Modal>
  );
}

function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const s = useStore();
  const results = useMemo(() => {
    const n = q.toLowerCase().replace(/^[#@*]/, '');
    const out: { key: string; label: string; sub: string; icon: React.ReactNode; go: () => void }[] = [];
    for (const id of s.privateChannelIds) {
      const c = s.channels[id];
      if (!c) continue;
      const other = c.recipients?.find((r) => r !== s.me?.id);
      const name = c.type === 'group_dm' ? c.name || 'Grupo' : s.users[other ?? '']?.displayName ?? '';
      if (!n || name.toLowerCase().includes(n) || s.users[other ?? '']?.username.includes(n))
        out.push({ key: id, label: name, sub: 'Mensagem direta', icon: other ? <Avatar userId={other} size={20} /> : <Users size={16} />, go: () => nav(`/channels/@me/${id}`) });
    }
    for (const c of Object.values(s.channels)) {
      if (!c.guildId || c.type === 'category') continue;
      if (n && !c.name.toLowerCase().includes(n)) continue;
      out.push({ key: c.id, label: c.name, sub: s.guilds[c.guildId]?.name ?? '', icon: c.type === 'text' ? <Hash size={16} /> : <Volume2 size={16} />, go: () => nav(`/channels/${c.guildId}/${c.id}`) });
    }
    for (const g of Object.values(s.guilds)) if (!n || g.name.toLowerCase().includes(n)) out.push({ key: g.id, label: g.name, sub: 'Servidor', icon: <GuildIcon guild={g} size={20} className="rounded" />, go: () => nav(`/channels/${g.id}`) });
    for (const r of Object.values(s.relationships)) {
      if (r.type !== 'friend') continue;
      if (n && !r.user.displayName.toLowerCase().includes(n) && !r.user.username.includes(n)) continue;
      if (out.some((o) => o.label === r.user.displayName)) continue;
      out.push({ key: 'f' + r.id, label: r.user.displayName, sub: 'Amigo', icon: <Avatar userId={r.id} size={20} />, go: () => void api.post<{ id: string }>('/users/@me/channels', { recipients: [r.id] }).then((ch) => nav(`/channels/@me/${ch.id}`)) });
    }
    return out.slice(0, 12);
  }, [q, s, nav]);
  useEffect(() => setI(0), [q]);
  return (
    <Modal onClose={onClose} width={560} bare>
      <div className="p-4">
        <div className="flex h-12 items-center gap-3 rounded-xl border border-line bg-bg-1 px-4 focus-within:border-accent">
          <Search size={18} className="text-fg-2" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setI((i + 1) % Math.max(1, results.length)));
              if (e.key === 'ArrowUp') (e.preventDefault(), setI((i - 1 + results.length) % Math.max(1, results.length)));
              if (e.key === 'Enter' && results[i]) (results[i]!.go(), onClose());
            }}
            placeholder="Para onde você quer ir?"
            className="flex-1 bg-transparent text-lg text-fg outline-none placeholder:text-fg-2"
          />
        </div>
        <div className="mt-3 max-h-[50vh] space-y-0.5 overflow-y-auto">
          {results.map((r, idx) => (
            <button key={r.key} onMouseEnter={() => setI(idx)} onClick={() => (r.go(), onClose())} className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', idx === i ? 'bg-bg-4' : '')}>
              <span className="text-fg-2">{r.icon}</span>
              <span className="flex-1 truncate font-medium text-fg">{r.label}</span>
              <span className="truncate text-xs text-fg-2">{r.sub}</span>
            </button>
          ))}
          {!results.length && <div className="py-8 text-center text-sm text-fg-2">Nada encontrado.</div>}
        </div>
        <div className="mt-3 text-xs text-fg-2">Dica: use ↑ ↓ e Enter. Abra com <b>Ctrl+K</b> de qualquer lugar.</div>
      </div>
    </Modal>
  );
}

function NewGroupModal({ onClose }: { onClose: () => void }) {
  const friends = useStore(useShallow((s) => Object.values(s.relationships).filter((r) => r.type === 'friend')));
  const [sel, setSel] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  return (
    <Modal
      onClose={onClose}
      title="Nova conversa em grupo"
      subtitle={`Selecione até ${LIMITS.GROUP_DM_MAX - 1} amigos.`}
      width={440}
      footer={
        <Button
          loading={loading}
          disabled={!sel.length}
          onClick={async () => {
            setLoading(true);
            try {
              const ch = await api.post<{ id: string }>('/users/@me/channels', { recipients: sel });
              onClose();
              navigate(`/channels/@me/${ch.id}`);
            } catch (e) {
              ui.error(e);
            } finally {
              setLoading(false);
            }
          }}
        >
          {sel.length > 1 ? 'Criar grupo' : 'Criar conversa'}
        </Button>
      }
    >
      <div className="scroll-thin max-h-80 space-y-1 overflow-y-auto pb-3">
        {!friends.length && <p className="py-6 text-center text-sm text-fg-2">Adicione amigos primeiro. 🙂</p>}
        {friends.map((f) => (
          <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-bg-3">
            <Avatar userId={f.id} size={32} />
            <span className="flex-1 truncate text-sm text-fg">{f.user.displayName}</span>
            <input
              type="checkbox"
              className="size-4 accent-[var(--vl-accent)]"
              checked={sel.includes(f.id)}
              disabled={!sel.includes(f.id) && sel.length >= LIMITS.GROUP_DM_MAX - 1}
              onChange={(e) => setSel(e.target.checked ? [...sel, f.id] : sel.filter((x) => x !== f.id))}
            />
          </label>
        ))}
      </div>
    </Modal>
  );
}

function CustomStatusModal({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me);
  const [text, setText] = useState(me?.customStatus?.text ?? '');
  const [emoji, setEmoji] = useState(me?.customStatus?.emoji ?? '😎');
  const [expires, setExpires] = useState('0');
  const EMOJIS = ['😎', '🎮', '📚', '💤', '🍕', '🎧', '💻', '🏃', '🎉', '🤒', '✈️', '🔥'];
  return (
    <Modal
      onClose={onClose}
      title="Status personalizado"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={async () => {
              const exp = Number(expires);
              try {
                await api.put('/users/@me/custom-status', { text: text.trim() || null, emoji, expiresAt: exp ? new Date(Date.now() + exp * 1000).toISOString() : null });
                onClose();
              } catch (e) {
                ui.error(e);
              }
            }}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-3">
        <div className="flex flex-wrap gap-1">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => setEmoji(e)} className={cx('grid size-9 place-items-center rounded-lg text-xl', emoji === e ? 'bg-accent/20 ring-2 ring-accent' : 'hover:bg-bg-4')}>
              {e}
            </button>
          ))}
        </div>
        <Field label="O que está rolando?">
          <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={LIMITS.CUSTOM_STATUS_MAX} placeholder="Jogando com a galera" />
        </Field>
        <Field label="Limpar depois de">
          <Select value={expires} onChange={setExpires} options={[{ value: '1800', label: '30 minutos' }, { value: '3600', label: '1 hora' }, { value: '14400', label: '4 horas' }, { value: '86400', label: 'Hoje' }, { value: '0', label: 'Não limpar' }]} />
        </Field>
      </div>
    </Modal>
  );
}

/* ───────────── compartilhamento de tela ───────────── */

function ScreenShareModal({ onClose }: { onClose: () => void }) {
  const l = useLocal();
  const [sources, setSources] = useState<DesktopSource[] | null>(null);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [sel, setSel] = useState<string | null>(null);
  const [quality, setQuality] = useState<ScreenQuality>(l.screenQuality);
  const [codec, setCodec] = useState<ScreenCodec>(l.screenCodec);
  const [content, setContent] = useState(l.screenContent);
  const [audio, setAudio] = useState(l.screenAudio);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!desktop) return;
    const load = () => void desktop!.screen.getSources().then(setSources).catch(() => setSources([]));
    load();
    timer.current = setInterval(load, 4000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);
  const filtered = (sources ?? []).filter((s) => s.type === tab);
  const start = async () => {
    setLoading(true);
    local().set({ screenQuality: quality, screenCodec: codec, screenContent: content, screenAudio: audio });
    try {
      await voice.startScreen({ sourceId: sel ?? undefined, audio, quality, content, codec });
      onClose();
    } catch (e) {
      if ((e as Error).name !== 'NotAllowedError' && (e as Error).name !== 'AbortError') ui.error(e, 'Não foi possível compartilhar a tela');
    } finally {
      setLoading(false);
    }
  };
  const audioSupported = desktop ? desktop.screen.systemAudioSupported : true;
  return (
    <Modal
      onClose={onClose}
      title="Compartilhar tela"
      subtitle={desktop ? 'Escolha uma tela inteira ou uma janela/aplicativo.' : 'O navegador vai pedir para você escolher o que compartilhar.'}
      width={desktop ? 760 : 480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void start()} loading={loading} disabled={!!desktop && !sel}>Transmitir</Button>
        </>
      }
    >
      {desktop && (
        <>
          <div className="mb-3">
            <Segmented
              value={tab}
              onChange={(v) => (setTab(v), setSel(null))}
              options={[
                { value: 'screen', label: <span className="flex items-center gap-1.5"><Monitor size={14} /> Telas</span> },
                { value: 'window', label: <span className="flex items-center gap-1.5"><AppWindow size={14} /> Janelas e aplicativos</span> },
              ]}
            />
          </div>
          <div className="scroll-thin grid max-h-[300px] grid-cols-3 gap-3 overflow-y-auto pb-1">
            {!sources ? (
              <div className="col-span-3 grid h-40 place-items-center"><Spinner /></div>
            ) : (
              filtered.map((s) => (
                <button key={s.id} onClick={() => setSel(s.id)} onDoubleClick={() => (setSel(s.id), void start())} className={cx('overflow-hidden rounded-xl border-2 bg-bg-1 text-left transition', sel === s.id ? 'border-accent' : 'border-transparent hover:border-line-strong')}>
                  <img src={s.thumbnail} alt="" className="aspect-video w-full bg-black object-contain" />
                  <div className="flex items-center gap-1.5 p-2 text-xs text-fg-1">
                    {s.appIcon && <img src={s.appIcon} alt="" className="size-4" />}
                    <span className="truncate">{s.name}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 pb-3">
        <Field label="Qualidade">
          <Select
            value={quality}
            onChange={setQuality}
            options={[
              { value: '720p30', label: '720p • 30 fps (leve)' },
              { value: '1080p30', label: '1080p • 30 fps (recomendado)' },
              { value: '1080p60', label: '1080p • 60 fps (jogos)' },
              { value: '1440p60', label: '1440p • 60 fps' },
              { value: 'source', label: 'Original (até 4K 60 fps)' },
            ]}
          />
        </Field>
        <Field label="Otimizar para">
          <Select value={content} onChange={setContent} options={[{ value: 'detail', label: 'Nitidez (texto, código)' }, { value: 'motion', label: 'Fluidez (jogos, vídeos)' }]} />
        </Field>
        <Field label="Codificação" hint="H.264 usa a placa de vídeo: menos CPU em PCs intermediários.">
          <Select value={codec} onChange={setCodec} options={[{ value: 'auto', label: 'Automática (H.264 por hardware)' }, { value: 'h264', label: 'H.264' }, { value: 'vp9', label: 'VP9 (melhor adaptação)' }, { value: 'vp8', label: 'VP8 (compatível)' }]} />
        </Field>
        <div className="flex items-center justify-between rounded-lg border border-line bg-bg-1 px-3">
          <div>
            <div className="text-sm font-medium text-fg">Áudio do sistema</div>
            <div className="text-xs text-fg-2">{audioSupported ? 'Som do PC junto com a tela' : 'Não suportado neste sistema'}</div>
          </div>
          <Switch checked={audio && audioSupported} disabled={!audioSupported} onChange={setAudio} />
        </div>
      </div>
    </Modal>
  );
}

