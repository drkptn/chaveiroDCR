/** Configurações do servidor: visão geral, cargos/permissões, emojis, figurinhas, membros, convites, banimentos, auditoria, denúncias. */
import { useEffect, useMemo, useState } from 'react';
import { Upload, Plus, Trash2, ChevronUp, ChevronDown, Search, Crown, Copy, Shield, Users as UsersIcon } from 'lucide-react';
import { LIMITS, P, PERMISSION_INFO, has, type AuditLogEntry, type Ban, type PublicUser, type Role } from '@vinlancord/shared';
import { useShallow } from 'zustand/react/shallow';
import { useStore, displayName, EMPTY_OBJ, EMPTY_ARR } from '../../store';
import { ui } from '../../store/ui';
import { loadMembers } from '../../store/actions';
import { api } from '../../lib/api';
import { useGuildPerms } from '../../lib/perms';
import { relativeTime } from '../../lib/format';
import { ACCENTS } from '../../lib/themes';
import { Avatar, Button, Field, GuildIcon, Input, Select, SettingRow, Spinner, Switch, Textarea, cx } from '../ui';
import { SettingsLayout, SectionTitle, Card, type SettingsTab } from './SettingsLayout';
import { userMenu } from '../profile/userMenu';

export default function ServerSettings({ onClose, guildId, initialTab }: { onClose: () => void; guildId: string; initialTab?: string }) {
  const guild = useStore((s) => s.guilds[guildId]);
  const meId = useStore((s) => s.me?.id);
  const perms = useGuildPerms(guildId);
  const [tab, setTab] = useState(initialTab ?? 'overview');
  useEffect(() => {
    if (!guild) onClose();
  }, [guild, onClose]);
  if (!guild) return null;
  const owner = guild.ownerId === meId;
  const tabs: SettingsTab[] = [
    { id: 'overview', label: 'Visão geral', section: guild.name, hidden: !has(perms, P.MANAGE_GUILD) },
    { id: 'roles', label: 'Cargos', hidden: !has(perms, P.MANAGE_ROLES) },
    { id: 'emojis', label: 'Emojis', hidden: !has(perms, P.MANAGE_EMOJIS) },
    { id: 'stickers', label: 'Figurinhas', hidden: !has(perms, P.MANAGE_EMOJIS) },
    { id: 'myprofile', label: 'Meu perfil no servidor' },
    { id: 'members', label: 'Membros', section: 'Gerenciamento de membros' },
    { id: 'invites', label: 'Convites', hidden: !has(perms, P.MANAGE_GUILD) },
    { id: 'bans', label: 'Banimentos', hidden: !has(perms, P.BAN_MEMBERS) },
    { id: 'audit', label: 'Registro de auditoria', section: 'Moderação', hidden: !has(perms, P.VIEW_AUDIT_LOG) },
    { id: 'reports', label: 'Denúncias', hidden: !has(perms, P.MANAGE_MESSAGES) },
    { id: 'danger', label: 'Excluir servidor', danger: true, hidden: !owner, section: ' ' },
  ];
  return (
    <SettingsLayout tabs={tabs} active={tab} onTab={setTab} onClose={onClose}>
      {tab === 'overview' && <Overview guildId={guildId} />}
      {tab === 'roles' && <Roles guildId={guildId} />}
      {(tab === 'emojis' || tab === 'stickers') && <Expressions guildId={guildId} kind={tab} />}
      {tab === 'myprofile' && <MyServerProfile guildId={guildId} />}
      {tab === 'members' && <Members guildId={guildId} />}
      {tab === 'invites' && <Invites guildId={guildId} />}
      {tab === 'bans' && <Bans guildId={guildId} />}
      {tab === 'audit' && <Audit guildId={guildId} />}
      {tab === 'reports' && <Reports guildId={guildId} />}
      {tab === 'danger' && <Danger guildId={guildId} onClose={onClose} />}
    </SettingsLayout>
  );
}

function Overview({ guildId }: { guildId: string }) {
  const g = useStore((s) => s.guilds[guildId])!;
  const textChannels = useStore(useShallow((s) => Object.values(s.channels).filter((c) => c.guildId === guildId && c.type === 'text')));
  const [form, setForm] = useState({ name: g.name, description: g.description, isPublic: g.isPublic, systemChannelId: g.systemChannelId ?? '' });
  const [saving, setSaving] = useState(false);
  const upload = async (kind: 'icon' | 'banner', f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    try {
      await api.post(`/guilds/${guildId}/${kind}`, fd);
    } catch (e) {
      ui.error(e);
    }
  };
  return (
    <>
      <SectionTitle>Visão geral do servidor</SectionTitle>
      <div className="mb-6 flex items-start gap-6">
        <div className="text-center">
          <label className="group relative block cursor-pointer overflow-hidden rounded-3xl">
            <GuildIcon guild={g} size={100} />
            <span className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-bold uppercase text-white opacity-0 transition group-hover:opacity-100">Mudar ícone</span>
            <input type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && void upload('icon', e.target.files[0])} />
          </label>
          {g.icon && <button className="mt-2 text-xs text-fg-2 hover:text-danger" onClick={() => void api.del(`/guilds/${guildId}/icon`)}>Remover</button>}
        </div>
        <div className="flex-1 space-y-4">
          <Field label="Nome do servidor"><Input value={form.name} maxLength={LIMITS.GUILD_NAME_MAX} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Descrição" hint="Aparece no Explorar e nos convites."><Textarea rows={3} maxLength={LIMITS.GUILD_DESCRIPTION_MAX} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </div>
      <Card title="Banner">
        <div className="relative mb-3 h-32 overflow-hidden rounded-xl bg-gradient-to-br from-accent/50 to-accent-2/30">{g.banner && <img src={g.banner} alt="" className="size-full object-cover" />}</div>
        <div className="flex gap-2">
          <label>
            <Button size="sm" icon={<Upload size={14} />} onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement).click()}>Enviar banner</Button>
            <input type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && void upload('banner', e.target.files[0])} />
          </label>
          {g.banner && <Button size="sm" variant="ghost" onClick={() => void api.del(`/guilds/${guildId}/banner`)}>Remover</Button>}
        </div>
      </Card>
      <Card title="Configurações">
        <SettingRow title="Servidor público" description="Aparece em Explorar e qualquer pessoa pode entrar sem convite."><Switch checked={form.isPublic} onChange={(v) => setForm({ ...form, isPublic: v })} /></SettingRow>
        <Field label="Canal de mensagens do sistema" hint="Boas-vindas a novos membros e avisos de eventos.">
          <Select value={form.systemChannelId} onChange={(v) => setForm({ ...form, systemChannelId: v })} options={[{ value: '', label: 'Nenhum' }, ...textChannels.map((c) => ({ value: c.id, label: '#' + c.name }))]} />
        </Field>
      </Card>
      <Button
        loading={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await api.patch(`/guilds/${guildId}`, { ...form, systemChannelId: form.systemChannelId || null });
            ui.success('Alterações salvas!');
          } catch (e) {
            ui.error(e);
          } finally {
            setSaving(false);
          }
        }}
      >
        Salvar alterações
      </Button>
    </>
  );
}

function Roles({ guildId }: { guildId: string }) {
  const roles = useStore((s) => s.roles[guildId] ?? EMPTY_OBJ);
  const members = useStore((s) => s.members[guildId] ?? EMPTY_OBJ);
  const sorted = useMemo(() => Object.values(roles).sort((a, b) => b.position - a.position), [roles]);
  const [sel, setSel] = useState<string>(sorted[0]?.id ?? guildId);
  const role = roles[sel];
  const [draft, setDraft] = useState<Role | null>(null);
  useEffect(() => {
    void loadMembers(guildId);
  }, [guildId]);
  useEffect(() => setDraft(role ? { ...role } : null), [role]);
  if (!draft) return null;
  const isEveryone = draft.id === guildId;
  const permsBig = BigInt(draft.permissions);
  const toggle = (flag: bigint) => setDraft({ ...draft, permissions: (permsBig & flag ? permsBig & ~flag : permsBig | flag).toString() });
  const dirty = JSON.stringify(draft) !== JSON.stringify(role);
  const groups = [...new Set(PERMISSION_INFO.map((p) => p.group))];
  const move = async (dir: 1 | -1) => {
    const list = sorted.filter((r) => r.id !== guildId);
    const idx = list.findIndex((r) => r.id === sel);
    const swap = list[idx - dir];
    if (!swap) return;
    try {
      await api.patch(`/guilds/${guildId}/roles`, [
        { id: sel, position: swap.position },
        { id: swap.id, position: roles[sel]!.position },
      ]);
    } catch (e) {
      ui.error(e);
    }
  };
  const count = (rid: string) => (rid === guildId ? Object.keys(members).length : Object.values(members).filter((m) => m.roles.includes(rid)).length);
  return (
    <>
      <SectionTitle sub="Cargos definem permissões e cores. Membros com vários cargos somam as permissões. Cargos mais altos têm prioridade.">Cargos</SectionTitle>
      <div className="flex gap-6">
        <div className="w-52 shrink-0">
          <Button
            size="sm"
            className="mb-3 w-full"
            icon={<Plus size={14} />}
            onClick={async () => {
              try {
                const r = await api.post<Role>(`/guilds/${guildId}/roles`, { name: 'novo cargo', color: ACCENTS[Math.floor(Math.random() * ACCENTS.length)] });
                setSel(r.id);
              } catch (e) {
                ui.error(e);
              }
            }}
          >
            Criar cargo
          </Button>
          {sorted.map((r) => (
            <button key={r.id} onClick={() => setSel(r.id)} className={cx('mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm', sel === r.id ? 'bg-bg-4 text-fg' : 'text-fg-1 hover:bg-bg-3')}>
              <span className="size-3 shrink-0 rounded-full" style={{ background: r.color ?? 'var(--vl-text-2)' }} />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="flex items-center gap-0.5 text-[11px] text-fg-2"><UsersIcon size={11} />{count(r.id)}</span>
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          {!isEveryone && (
            <Card>
              <div className="flex gap-3">
                <Field label="Nome do cargo" className="flex-1"><Input value={draft.name} maxLength={LIMITS.ROLE_NAME_MAX} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                <div className="flex items-end gap-1 pb-0.5">
                  <Button size="sm" variant="ghost" onClick={() => void move(1)} aria-label="Subir"><ChevronUp size={16} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => void move(-1)} aria-label="Descer"><ChevronDown size={16} /></Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {[null, ...ACCENTS].map((c) => (
                  <button key={c ?? 'none'} onClick={() => setDraft({ ...draft, color: c })} className={cx('size-7 rounded-full border-2', draft.color === c ? 'border-fg' : 'border-transparent')} style={{ background: c ?? 'var(--vl-bg-4)' }} />
                ))}
                <input type="color" value={draft.color ?? '#7c5cff'} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="size-7 cursor-pointer rounded-full border-0 bg-transparent" />
              </div>
              <SettingRow title="Exibir separadamente na lista de membros"><Switch checked={draft.hoist} onChange={(v) => setDraft({ ...draft, hoist: v })} /></SettingRow>
              <SettingRow title="Permitir que qualquer um @mencione este cargo"><Switch checked={draft.mentionable} onChange={(v) => setDraft({ ...draft, mentionable: v })} /></SettingRow>
            </Card>
          )}
          {isEveryone && <p className="mb-4 rounded-xl bg-bg-1 p-4 text-sm text-fg-1">O cargo <b>@everyone</b> define as permissões padrão de todos os membros.</p>}
          {groups.map((grp) => (
            <Card key={grp} title={grp}>
              {PERMISSION_INFO.filter((p) => p.group === grp).map((p) => (
                <SettingRow key={p.key} title={p.label} description={p.description}>
                  <Switch checked={(permsBig & P[p.key]) !== 0n} onChange={() => toggle(P[p.key])} />
                </SettingRow>
              ))}
            </Card>
          ))}
          <div className="sticky bottom-4 flex items-center gap-2 rounded-xl border border-line-strong bg-bg-1/95 p-3 shadow-[var(--vl-shadow)] backdrop-blur">
            <span className="flex-1 text-sm text-fg-1">{dirty ? 'Você tem alterações não salvas!' : 'Tudo salvo.'}</span>
            {!isEveryone && (
              <Button
                variant="ghost"
                className="text-danger"
                icon={<Trash2 size={14} />}
                onClick={() => ui.confirm({ title: `Excluir o cargo ${draft.name}?`, body: 'Os membros perderão esse cargo.', danger: true, confirmLabel: 'Excluir', onConfirm: async () => { await api.del(`/guilds/${guildId}/roles/${draft.id}`); setSel(guildId); } })}
              >
                Excluir
              </Button>
            )}
            <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(role ? { ...role } : null)}>Desfazer</Button>
            <Button
              disabled={!dirty}
              onClick={async () => {
                try {
                  await api.patch(`/guilds/${guildId}/roles/${draft.id}`, { name: draft.name, color: draft.color, hoist: draft.hoist, mentionable: draft.mentionable, permissions: draft.permissions });
                  ui.success('Cargo salvo!');
                } catch (e) {
                  ui.error(e);
                }
              }}
            >
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function Expressions({ guildId, kind }: { guildId: string; kind: 'emojis' | 'stickers' }) {
  const emojis = useStore((s) => s.emojis[guildId] ?? EMPTY_ARR);
  const stickers = useStore((s) => s.stickers[guildId] ?? EMPTY_ARR);
  const list = kind === 'emojis' ? emojis : stickers;
  const [uploading, setUploading] = useState(false);
  const max = kind === 'emojis' ? LIMITS.EMOJIS_PER_GUILD : LIMITS.STICKERS_PER_GUILD;
  return (
    <>
      <SectionTitle sub={kind === 'emojis' ? 'Emojis personalizados para todos os membros usarem em mensagens e reações. PNG, GIF ou WebP até 512 KB; GIFs animam!' : 'Figurinhas grandes para mandar no chat. PNG, GIF ou WebP até 1 MB.'}>
        {kind === 'emojis' ? 'Emojis' : 'Figurinhas'}
      </SectionTitle>
      <label>
        <Button loading={uploading} icon={<Upload size={16} />} onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement).click()} disabled={list.length >= max}>
          Enviar {kind === 'emojis' ? 'emoji' : 'figurinha'}
        </Button>
        <input
          type="file"
          multiple
          hidden
          accept="image/png,image/gif,image/webp,image/jpeg"
          onChange={async (e) => {
            setUploading(true);
            for (const f of [...(e.target.files ?? [])]) {
              const fd = new FormData();
              fd.append('name', f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32));
              fd.append('file', f);
              await api.post(`/guilds/${guildId}/${kind}`, fd).catch((er) => ui.error(er, f.name));
            }
            setUploading(false);
            e.target.value = '';
          }}
        />
      </label>
      <div className="mt-2 text-xs text-fg-2">{list.length} de {max} usados</div>
      <div className="mt-4 space-y-1">
        {list.map((e) => (
          <div key={e.id} className="flex items-center gap-4 rounded-lg px-3 py-2 hover:bg-bg-1">
            <img src={e.url} alt={e.name} className={kind === 'emojis' ? 'size-8 object-contain' : 'size-16 object-contain'} />
            <Input
              defaultValue={e.name}
              className="h-8 max-w-[240px]"
              onBlur={(ev) => ev.target.value !== e.name && void api.patch(`/guilds/${guildId}/${kind}/${e.id}`, { name: ev.target.value }).catch((er) => ui.error(er))}
            />
            <span className="flex-1" />
            <button className="text-fg-2 hover:text-danger" onClick={() => void api.del(`/guilds/${guildId}/${kind}/${e.id}`).catch((er) => ui.error(er))} aria-label="Excluir">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function MyServerProfile({ guildId }: { guildId: string }) {
  const me = useStore((s) => s.myMembers[guildId]);
  const [nick, setNick] = useState(me?.nick ?? '');
  return (
    <>
      <SectionTitle sub="Como você aparece só neste servidor.">Meu perfil no servidor</SectionTitle>
      <Field label="Apelido no servidor"><Input value={nick} maxLength={LIMITS.NICK_MAX} onChange={(e) => setNick(e.target.value)} placeholder="Deixe vazio para usar seu nome" /></Field>
      <Button className="mt-4" onClick={() => void api.patch(`/guilds/${guildId}/members/@me`, { nick: nick.trim() || null }).then(() => ui.success('Apelido salvo!')).catch((e) => ui.error(e))}>Salvar</Button>
    </>
  );
}

function Members({ guildId }: { guildId: string }) {
  const members = useStore((s) => s.members[guildId] ?? EMPTY_OBJ);
  const roles = useStore((s) => s.roles[guildId] ?? EMPTY_OBJ);
  const ownerId = useStore((s) => s.guilds[guildId]?.ownerId);
  const [q, setQ] = useState('');
  useEffect(() => {
    void loadMembers(guildId, true);
  }, [guildId]);
  const list = Object.values(members)
    .filter((m) => !q || displayName(m.userId, guildId).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => displayName(a.userId, guildId).localeCompare(displayName(b.userId, guildId), 'pt-BR'));
  return (
    <>
      <SectionTitle sub={`${Object.keys(members).length} membros. Clique direito (ou no ⋯) para moderar.`}>Membros</SectionTitle>
      <div className="mb-3 flex h-9 items-center gap-2 rounded-lg border border-line bg-bg-1 px-3">
        <Search size={15} className="text-fg-2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar membros" className="flex-1 bg-transparent text-sm text-fg outline-none" />
      </div>
      {list.map((m) => (
        <div key={m.userId} onContextMenu={(e) => userMenu(e, m.userId, guildId)} className="flex items-center gap-3 border-b border-line px-2 py-2.5">
          <Avatar userId={m.userId} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-fg">
              {displayName(m.userId, guildId)} {m.userId === ownerId && <Crown size={13} className="text-warning" />}
              {m.timeoutUntil && <span className="rounded bg-danger/20 px-1 text-[10px] text-danger">de castigo</span>}
            </div>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {m.roles.map((r) => roles[r]).filter(Boolean).map((r) => (
                <span key={r!.id} className="flex items-center gap-1 rounded bg-bg-4 px-1.5 text-[11px] text-fg-1"><span className="size-2 rounded-full" style={{ background: r!.color ?? 'var(--vl-text-2)' }} />{r!.name}</span>
              ))}
            </div>
          </div>
          <span className="text-xs text-fg-2">entrou {relativeTime(m.joinedAt)}</span>
          <Button size="sm" variant="ghost" onClick={(e) => userMenu(e, m.userId, guildId)}>⋯</Button>
        </div>
      ))}
    </>
  );
}

function Invites({ guildId }: { guildId: string }) {
  const [list, setList] = useState<{ code: string; inviter: PublicUser | null; uses: number; maxUses: number; expiresAt: string | null }[] | null>(null);
  const load = () => void api.get<typeof list>(`/guilds/${guildId}/invites`).then(setList);
  useEffect(load, [guildId]);
  return (
    <>
      <SectionTitle>Convites ativos</SectionTitle>
      {!list ? <Spinner /> : !list.length ? <p className="text-sm text-fg-2">Nenhum convite ativo.</p> : null}
      {list?.map((i) => (
        <div key={i.code} className="flex items-center gap-3 border-b border-line py-2.5 text-sm">
          {i.inviter && <Avatar userId={i.inviter.id} src={i.inviter.avatar} name={i.inviter.displayName} size={28} />}
          <span className="w-40 truncate text-fg">{i.inviter?.displayName ?? '—'}</span>
          <span className="font-mono text-fg-1">{i.code}</span>
          <span className="flex-1 text-fg-2">{i.uses}{i.maxUses ? `/${i.maxUses}` : ''} usos • {i.expiresAt ? `expira ${relativeTime(i.expiresAt)}` : 'nunca expira'}</span>
          <button onClick={() => void navigator.clipboard.writeText(i.code)} className="text-fg-2 hover:text-fg" aria-label="Copiar"><Copy size={15} /></button>
          <button onClick={() => void api.del(`/invites/${i.code}`).then(load)} className="text-fg-2 hover:text-danger" aria-label="Revogar"><Trash2 size={15} /></button>
        </div>
      ))}
    </>
  );
}

function Bans({ guildId }: { guildId: string }) {
  const [list, setList] = useState<Ban[] | null>(null);
  const load = () => void api.get<Ban[]>(`/guilds/${guildId}/bans`).then(setList);
  useEffect(load, [guildId]);
  return (
    <>
      <SectionTitle>Banimentos</SectionTitle>
      {!list ? <Spinner /> : !list.length ? <p className="text-sm text-fg-2">Ninguém banido. Servidor pacífico! 🕊️</p> : null}
      {list?.map((b) => (
        <div key={b.user.id} className="flex items-center gap-3 border-b border-line py-2.5">
          <Avatar userId={b.user.id} src={b.user.avatar} name={b.user.displayName} size={32} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-fg">{b.user.displayName} <span className="text-fg-2">@{b.user.username}</span></div>
            <div className="text-xs text-fg-2">{b.reason || 'Sem motivo informado'} • {relativeTime(b.createdAt)}</div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void api.del(`/guilds/${guildId}/bans/${b.user.id}`).then(load)}>Revogar banimento</Button>
        </div>
      ))}
    </>
  );
}

const ACTIONS: Record<string, string> = {
  GUILD_CREATE: 'criou o servidor',
  GUILD_UPDATE: 'atualizou o servidor',
  GUILD_TRANSFER: 'transferiu a posse para',
  CHANNEL_CREATE: 'criou um canal',
  CHANNEL_UPDATE: 'editou um canal',
  CHANNEL_DELETE: 'excluiu um canal',
  CHANNEL_OVERWRITE_UPDATE: 'alterou permissões de um canal',
  ROLE_CREATE: 'criou um cargo',
  ROLE_UPDATE: 'editou um cargo',
  ROLE_DELETE: 'excluiu um cargo',
  ROLE_REORDER: 'reordenou cargos',
  MEMBER_KICK: 'expulsou',
  MEMBER_BAN: 'baniu',
  MEMBER_UNBAN: 'revogou o banimento de',
  MEMBER_TIMEOUT: 'aplicou castigo em',
  MEMBER_UPDATE: 'editou',
  MEMBER_ROLE_UPDATE: 'alterou os cargos de',
  MEMBER_VOICE_UPDATE: 'alterou o áudio de',
  MEMBER_JOIN: 'entrou com convite',
  MESSAGE_DELETE: 'apagou uma mensagem de',
  MESSAGE_BULK_DELETE: 'apagou mensagens em massa',
  MESSAGE_PIN: 'fixou uma mensagem de',
  MESSAGE_UNPIN: 'desafixou uma mensagem de',
  INVITE_CREATE: 'criou um convite',
  INVITE_DELETE: 'revogou um convite',
  EMOJI_CREATE: 'adicionou um emoji',
  EMOJI_DELETE: 'removeu um emoji',
  STICKER_CREATE: 'adicionou uma figurinha',
  STICKER_DELETE: 'removeu uma figurinha',
  EVENT_CREATE: 'criou um evento',
};

function Audit({ guildId }: { guildId: string }) {
  const [data, setData] = useState<{ entries: AuditLogEntry[]; users: PublicUser[] } | null>(null);
  useEffect(() => {
    void api.get<typeof data>(`/guilds/${guildId}/audit-log`).then(setData);
  }, [guildId]);
  const users = new Map(data?.users.map((u) => [u.id, u]));
  return (
    <>
      <SectionTitle sub="Tudo o que a moderação fez por aqui.">Registro de auditoria</SectionTitle>
      {!data ? <Spinner /> : null}
      {data?.entries.map((e) => {
        const actor = e.actorId ? users.get(e.actorId) : null;
        const target = e.targetId ? users.get(e.targetId) : null;
        return (
          <div key={e.id} className="flex items-center gap-3 border-b border-line py-2.5 text-sm">
            <Shield size={16} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 text-fg-1">
              <b className="text-fg">{actor?.displayName ?? 'Alguém'}</b> {ACTIONS[e.action] ?? e.action.toLowerCase()} {target && <b className="text-fg">{target.displayName}</b>}
              {e.changes && 'name' in e.changes && typeof e.changes.name === 'string' && <span className="text-fg-2"> “{e.changes.name}”</span>}
              {e.reason && <span className="text-fg-2"> — motivo: {e.reason}</span>}
            </span>
            <span className="shrink-0 text-xs text-fg-2">{relativeTime(e.createdAt)}</span>
          </div>
        );
      })}
    </>
  );
}

function Reports({ guildId }: { guildId: string }) {
  const [list, setList] = useState<{ id: string; reason: string; details: string; status: string; snapshot: { content?: string; authorId?: string } | null; createdAt: string }[] | null>(null);
  const load = () => void api.get<typeof list>(`/guilds/${guildId}/reports`).then(setList);
  useEffect(load, [guildId]);
  return (
    <>
      <SectionTitle sub="Mensagens denunciadas pelos membros neste servidor.">Denúncias</SectionTitle>
      {!list ? <Spinner /> : !list.length ? <p className="text-sm text-fg-2">Nenhuma denúncia. 👏</p> : null}
      {list?.map((r) => (
        <Card key={r.id}>
          <div className="flex items-center justify-between text-xs text-fg-2">
            <span className="rounded bg-danger/15 px-2 py-0.5 font-semibold uppercase text-danger">{r.reason.replace(/_/g, ' ')}</span>
            <span>{relativeTime(r.createdAt)} • {r.status}</span>
          </div>
          {r.snapshot?.content && <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-sm text-fg-1">{r.snapshot.content}</blockquote>}
          {r.snapshot?.authorId && <div className="mt-1 text-xs text-fg-2">Autor: {displayName(r.snapshot.authorId, guildId)}</div>}
          {r.details && <p className="mt-2 text-sm text-fg-1">{r.details}</p>}
          <div className="mt-3 flex gap-2">
            {['REVIEWING', 'RESOLVED', 'DISMISSED'].map((st) => (
              <Button key={st} size="sm" variant={r.status === st ? 'primary' : 'secondary'} onClick={() => void api.patch(`/guilds/${guildId}/reports/${r.id}`, { status: st }).then(load)}>
                {{ REVIEWING: 'Analisando', RESOLVED: 'Resolvida', DISMISSED: 'Descartar' }[st]}
              </Button>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

function Danger({ guildId, onClose }: { guildId: string; onClose: () => void }) {
  const g = useStore((s) => s.guilds[guildId])!;
  const members = useStore(useShallow((s) => Object.keys(s.members[guildId] ?? {}).filter((id) => id !== g.ownerId)));
  const [target, setTarget] = useState('');
  return (
    <>
      <SectionTitle>Zona de perigo</SectionTitle>
      <Card title="Transferir posse">
        <p className="mb-3 text-sm text-fg-1">O novo dono terá controle total. Você continuará como membro.</p>
        <div className="flex gap-2">
          <Select value={target} onChange={setTarget} options={[{ value: '', label: 'Escolha um membro' }, ...members.map((id) => ({ value: id, label: displayName(id, guildId) }))]} />
          <Button
            variant="secondary"
            disabled={!target}
            onClick={() => ui.confirm({ title: 'Transferir posse?', body: `${displayName(target, guildId)} será o novo dono de ${g.name}.`, danger: true, requirePassword: true, confirmLabel: 'Transferir', onConfirm: async (password) => void (await api.post(`/guilds/${guildId}/transfer`, { userId: target, password })) })}
          >
            Transferir
          </Button>
        </div>
      </Card>
      <Card title="Excluir servidor">
        <p className="mb-3 text-sm text-fg-1">Apaga o servidor com todos os canais, mensagens e arquivos. Não tem volta!</p>
        <Button
          variant="danger"
          onClick={() =>
            ui.confirm({
              title: `Excluir ${g.name}?`,
              body: 'Todos os canais e mensagens serão apagados para sempre.',
              danger: true,
              requirePassword: true,
              confirmLabel: 'Excluir servidor',
              onConfirm: async (password) => {
                await api.del(`/guilds/${guildId}`, { password });
                onClose();
              },
            })
          }
        >
          Excluir servidor
        </Button>
      </Card>
    </>
  );
}
