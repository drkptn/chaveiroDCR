/** Configurações do usuário: conta, perfil, privacidade, dispositivos, aparência, voz e vídeo, notificações, atalhos, atividades. */
import { useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone, Globe, Trash2, Upload, Plus, Download, Mic, Gamepad2, RefreshCw, Check, LogOut, ShieldCheck, Keyboard, X } from 'lucide-react';
import { LIMITS, type SessionInfo, type ProfileLink } from '@vinlancord/shared';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store';
import { ui } from '../../store/ui';
import { useLocal, local, KEYBIND_LABELS, DEFAULT_KEYBINDS, type KeybindAction } from '../../store/local';
import { logout, updateSettings } from '../../store/actions';
import { api, errorMessage } from '../../lib/api';
import { desktop, type DesktopSettings, type UpdateStatus } from '../../lib/desktop';
import { ACCENTS, THEMES, validateCustomTheme, type ThemeDef } from '../../lib/themes';
import { voice, useVoice } from '../../lib/voice/engine';
import { AudioEngine } from '../../lib/voice/audio';
import { requestNotificationPermission } from '../../lib/notify';
import { relativeTime, formatLongDate } from '../../lib/format';
import { playSound, setSoundVolume } from '../../lib/sounds';
import { Avatar, Button, Field, Input, Kbd, Segmented, Select, SettingRow, Slider, Switch, Textarea, cx } from '../ui';
import { SettingsLayout, SectionTitle, Card, type SettingsTab } from './SettingsLayout';
import ProfilePopout from '../profile/ProfilePopout';
import { formatAccelerator } from '../../lib/keybinds';

export default function UserSettings({ onClose, initialTab }: { onClose: () => void; initialTab?: string }) {
  const [tab, setTab] = useState(initialTab ?? 'account');
  const tabs: SettingsTab[] = [
    { id: 'account', label: 'Minha conta', section: 'Configurações de usuário' },
    { id: 'profile', label: 'Perfil' },
    { id: 'privacy', label: 'Privacidade e segurança' },
    { id: 'devices', label: 'Dispositivos' },
    { id: 'appearance', label: 'Aparência', section: 'Configurações do app' },
    { id: 'voice', label: 'Voz e vídeo' },
    { id: 'notifications', label: 'Notificações' },
    { id: 'keybinds', label: 'Atalhos de teclado' },
    { id: 'activity', label: 'Atividade de jogo' },
    { id: 'desktop', label: 'Windows e desktop', hidden: !desktop },
    { id: 'about', label: 'Sobre o Vinlancord', section: 'Outros' },
    { id: 'logout', label: 'Sair', danger: true, onClick: () => ui.confirm({ title: 'Sair da conta?', body: 'Você precisará entrar de novo neste dispositivo.', confirmLabel: 'Sair', danger: true, onConfirm: () => logout() }) },
  ];
  return (
    <SettingsLayout tabs={tabs} active={tab} onTab={setTab} onClose={onClose}>
      {tab === 'account' && <Account />}
      {tab === 'profile' && <Profile />}
      {tab === 'privacy' && <Privacy />}
      {tab === 'devices' && <Devices />}
      {tab === 'appearance' && <Appearance />}
      {tab === 'voice' && <VoiceSettings />}
      {tab === 'notifications' && <Notifications />}
      {tab === 'keybinds' && <Keybinds />}
      {tab === 'activity' && <Activity />}
      {tab === 'desktop' && <DesktopTab />}
      {tab === 'about' && <About />}
    </SettingsLayout>
  );
}

/* ───────────── conta ───────────── */

function Account() {
  const me = useStore((s) => s.me)!;
  const [edit, setEdit] = useState<null | 'username' | 'email' | 'password'>(null);
  return (
    <>
      <SectionTitle>Minha conta</SectionTitle>
      {!me.emailVerified && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          <ShieldCheck size={20} />
          <span className="flex-1">Seu e-mail ainda não foi confirmado. Confirme para proteger sua conta e recuperar a senha.</span>
          <Button size="sm" variant="secondary" onClick={() => void api.post('/auth/resend-verification').then(() => ui.success('E-mail enviado!')).catch((e) => ui.error(e))}>Reenviar</Button>
        </div>
      )}
      <Card>
        <div className="mb-4 flex items-center gap-4">
          <Avatar userId={me.id} size={72} animate />
          <div>
            <div className="font-display text-xl font-bold text-fg">{me.displayName}</div>
            <div className="text-sm text-fg-2">@{me.username} • ID {me.id}</div>
          </div>
        </div>
        <div className="space-y-1 rounded-xl bg-bg-2 p-4">
          <SettingRow title="Nome de usuário" description={me.username}><Button size="sm" variant="secondary" onClick={() => setEdit('username')}>Editar</Button></SettingRow>
          <SettingRow title="E-mail" description={me.email.replace(/(.{2}).+(@.+)/, '$1•••••$2')}><Button size="sm" variant="secondary" onClick={() => setEdit('email')}>Editar</Button></SettingRow>
          <SettingRow title="Senha" description="Recomendamos uma senha longa e única."><Button size="sm" variant="secondary" onClick={() => setEdit('password')}>Alterar senha</Button></SettingRow>
          <SettingRow title="Conta criada em" description={formatLongDate(me.createdAt)}><span /></SettingRow>
        </div>
      </Card>
      <Card title="Zona de perigo">
        <SettingRow title="Excluir conta" description="Apaga sua conta e seus dados. Transfira ou exclua seus servidores antes.">
          <Button
            size="sm"
            variant="danger"
            onClick={() =>
              ui.confirm({
                title: 'Excluir conta para sempre?',
                body: 'Isso não pode ser desfeito. Suas mensagens, amizades e dados serão apagados.',
                confirmLabel: 'Excluir minha conta',
                danger: true,
                requirePassword: true,
                onConfirm: async (password) => {
                  await api.del('/users/@me', { password });
                  await logout(true);
                },
              })
            }
          >
            Excluir conta
          </Button>
        </SettingRow>
      </Card>
      {edit && <AccountEdit kind={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function AccountEdit({ kind, onClose }: { kind: 'username' | 'email' | 'password'; onClose: () => void }) {
  const me = useStore((s) => s.me)!;
  const [value, setValue] = useState(kind === 'username' ? me.username : kind === 'email' ? me.email : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      if (kind === 'username') await api.patch('/users/@me/username', { username: value, password });
      if (kind === 'email') await api.patch('/users/@me/email', { email: value, password });
      if (kind === 'password') await api.patch('/users/@me/password', { currentPassword: password, newPassword: value });
      ui.success(kind === 'password' ? 'Senha alterada! Outras sessões foram encerradas.' : 'Alteração salva!');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="w-[440px] rounded-2xl border border-line bg-bg-2 p-6 shadow-[var(--vl-shadow)] animate-pop-in"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h3 className="font-display text-xl font-bold text-fg">{{ username: 'Mudar nome de usuário', email: 'Mudar e-mail', password: 'Alterar senha' }[kind]}</h3>
        <div className="mt-4 space-y-3">
          {kind === 'password' ? (
            <>
              <Field label="Senha atual"><Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Field label="Nova senha" hint="Mínimo de 8 caracteres."><Input type="password" value={value} onChange={(e) => setValue(e.target.value)} minLength={8} /></Field>
            </>
          ) : (
            <>
              <Field label={kind === 'username' ? 'Nome de usuário' : 'E-mail'}>
                <Input autoFocus value={value} onChange={(e) => setValue(kind === 'username' ? e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '') : e.target.value)} />
              </Field>
              <Field label="Senha atual"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            </>
          )}
          {error && <div className="text-sm text-danger">{error}</div>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Salvar</Button>
        </div>
      </form>
    </div>
  );
}

/* ───────────── perfil ───────────── */

function Profile() {
  const me = useStore((s) => s.me)!;
  const [form, setForm] = useState({ displayName: me.displayName, bio: me.bio, pronouns: me.pronouns, accentColor: me.accentColor ?? '', bannerColor: me.bannerColor ?? '', links: me.links as ProfileLink[] });
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify({ displayName: me.displayName, bio: me.bio, pronouns: me.pronouns, accentColor: me.accentColor ?? '', bannerColor: me.bannerColor ?? '', links: me.links });
  const upload = async (kind: 'avatar' | 'banner', file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post(`/users/@me/${kind}`, fd);
      ui.success(kind === 'avatar' ? 'Foto atualizada!' : 'Banner atualizado!');
    } catch (e) {
      ui.error(e);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/users/@me', {
        displayName: form.displayName,
        bio: form.bio,
        pronouns: form.pronouns,
        accentColor: form.accentColor || null,
        bannerColor: form.bannerColor || null,
        links: form.links.filter((l) => l.label && l.url),
      });
      ui.success('Perfil salvo!');
    } catch (e) {
      ui.error(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <SectionTitle sub="Foto e banner aceitam GIF animado. As animações aparecem ao passar o mouse.">Perfil</SectionTitle>
      <div className="flex gap-8">
        <div className="min-w-0 flex-1 space-y-5">
          <Field label="Nome de exibição"><Input value={form.displayName} maxLength={LIMITS.DISPLAY_NAME_MAX} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
          <Field label="Pronomes"><Input value={form.pronouns} maxLength={LIMITS.PRONOUNS_MAX} placeholder="ele/dele, ela/dela…" onChange={(e) => setForm({ ...form, pronouns: e.target.value })} /></Field>
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fg-1">Foto de perfil</span>
              <div className="flex gap-2">
                <Button size="sm" icon={<Upload size={14} />} onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement).click()}>Enviar foto</Button>
                <input type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => e.target.files?.[0] && void upload('avatar', e.target.files[0])} />
                {me.avatar && <Button size="sm" variant="ghost" onClick={() => void api.del('/users/@me/avatar')}>Remover</Button>}
              </div>
            </label>
            <label className="flex-1">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fg-1">Banner</span>
              <div className="flex gap-2">
                <Button size="sm" icon={<Upload size={14} />} onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement).click()}>Enviar banner</Button>
                <input type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => e.target.files?.[0] && void upload('banner', e.target.files[0])} />
                {me.banner && <Button size="sm" variant="ghost" onClick={() => void api.del('/users/@me/banner')}>Remover</Button>}
              </div>
            </label>
          </div>
          <div className="flex gap-6">
            <Field label="Cor do perfil">
              <div className="flex flex-wrap gap-1.5">
                {['', ...ACCENTS].map((c) => (
                  <button key={c || 'none'} onClick={() => setForm({ ...form, accentColor: c })} className={cx('size-7 rounded-full border-2', form.accentColor === c ? 'border-fg' : 'border-transparent')} style={{ background: c || 'var(--vl-bg-4)' }} title={c || 'Padrão'} />
                ))}
              </div>
            </Field>
          </div>
          <Field label={`Sobre mim (${form.bio.length}/${LIMITS.BIO_MAX})`} hint="Aceita Markdown: **negrito**, *itálico*, links…">
            <Textarea rows={4} maxLength={LIMITS.BIO_MAX} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </Field>
          <Field label="Links">
            <div className="space-y-2">
              {form.links.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={l.label} placeholder="Nome (ex.: Twitch)" className="w-40" onChange={(e) => setForm({ ...form, links: form.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <Input value={l.url} placeholder="https://…" onChange={(e) => setForm({ ...form, links: form.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                  <Button variant="ghost" onClick={() => setForm({ ...form, links: form.links.filter((_, j) => j !== i) })}><X size={16} /></Button>
                </div>
              ))}
              {form.links.length < LIMITS.LINKS_MAX && (
                <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setForm({ ...form, links: [...form.links, { label: '', url: '' }] })}>Adicionar link</Button>
              )}
            </div>
          </Field>
          <div className="flex gap-2">
            <Button onClick={() => void save()} loading={saving} disabled={!dirty}>Salvar alterações</Button>
            {dirty && <Button variant="ghost" onClick={() => setForm({ displayName: me.displayName, bio: me.bio, pronouns: me.pronouns, accentColor: me.accentColor ?? '', bannerColor: me.bannerColor ?? '', links: me.links })}>Desfazer</Button>}
          </div>
        </div>
        <div className="shrink-0">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-1">Prévia</div>
          <ProfilePopout userId={me.id} guildId={null} />
        </div>
      </div>
    </>
  );
}

/* ───────────── privacidade ───────────── */

function Privacy() {
  const p = useStore((s) => s.settings.privacy);
  const blocked = useStore(useShallow((s) => Object.values(s.relationships).filter((r) => r.type === 'blocked')));
  const set = (patch: Partial<typeof p>) => void updateSettings({ privacy: { ...p, ...patch } });
  return (
    <>
      <SectionTitle sub="Você decide quem fala com você e o que aparece no seu perfil.">Privacidade e segurança</SectionTitle>
      <Card title="Mensagens diretas">
        <Field label="Quem pode me mandar mensagem direta">
          <Select value={p.dmsFrom} onChange={(v) => set({ dmsFrom: v })} options={[{ value: 'everyone', label: 'Qualquer pessoa' }, { value: 'server_members', label: 'Amigos e membros dos meus servidores' }, { value: 'friends', label: 'Somente amigos' }]} />
        </Field>
      </Card>
      <Card title="Pedidos de amizade">
        <Field label="Quem pode me enviar pedido de amizade">
          <Select value={p.friendRequestsFrom} onChange={(v) => set({ friendRequestsFrom: v })} options={[{ value: 'everyone', label: 'Qualquer pessoa' }, { value: 'server_members', label: 'Membros dos meus servidores' }, { value: 'nobody', label: 'Ninguém' }]} />
        </Field>
      </Card>
      <Card title="Perfil e atividade">
        <SettingRow title="Bio, banner e links visíveis para" description="Seu nome, foto e status são sempre visíveis.">
          <Segmented value={p.profileDetails} onChange={(v) => set({ profileDetails: v })} options={[{ value: 'everyone', label: 'Todos' }, { value: 'friends', label: 'Amigos' }]} />
        </SettingRow>
        <SettingRow title="Mostrar o jogo atual no meu status" description="Exibe “Jogando …” para amigos e membros dos seus servidores.">
          <Switch checked={p.showActivity} onChange={(v) => set({ showActivity: v })} />
        </SettingRow>
        <SettingRow title="Mostrar atividade recente no perfil" description="Lista os últimos jogos para amigos e membros de servidores em comum.">
          <Switch checked={p.showRecentActivity} onChange={(v) => set({ showRecentActivity: v })} />
        </SettingRow>
      </Card>
      <Card title={`Usuários bloqueados (${blocked.length})`}>
        {!blocked.length && <p className="text-sm text-fg-2">Ninguém bloqueado. Paz e amor. ✌️</p>}
        {blocked.map((b) => (
          <div key={b.id} className="flex items-center gap-3 py-2">
            <Avatar userId={b.id} size={32} />
            <span className="flex-1 text-sm text-fg">{b.user.displayName}</span>
            <Button size="sm" variant="secondary" onClick={() => void api.del(`/relationships/${b.id}`)}>Desbloquear</Button>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ───────────── dispositivos ───────────── */

function Devices() {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const load = () => void api.get<SessionInfo[]>('/auth/sessions').then(setSessions).catch((e) => ui.error(e));
  useEffect(load, []);
  const icon = (s: SessionInfo) => (s.platform === 'desktop' ? <Monitor size={22} /> : /android|ios/i.test(s.deviceName) ? <Smartphone size={22} /> : <Globe size={22} />);
  return (
    <>
      <SectionTitle sub="Todos os lugares em que sua conta está conectada. Encerre o que você não reconhecer.">Dispositivos</SectionTitle>
      {sessions?.map((s) => (
        <div key={s.id} className="mb-2 flex items-center gap-4 rounded-xl border border-line bg-bg-1 p-4">
          <span className="grid size-11 place-items-center rounded-xl bg-bg-4 text-fg-1">{icon(s)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-semibold text-fg">
              {s.deviceName}
              {s.current && <span className="rounded bg-success/20 px-1.5 text-[10px] font-bold uppercase text-success">Este dispositivo</span>}
            </div>
            <div className="text-xs text-fg-2">
              {s.ip ?? 'IP desconhecido'} • ativo {relativeTime(s.lastActiveAt)} • conectado em {formatLongDate(s.createdAt)}
            </div>
          </div>
          {!s.current && (
            <Button size="sm" variant="ghost" icon={<LogOut size={14} />} onClick={() => void api.del(`/auth/sessions/${s.id}`).then(load).catch((e) => ui.error(e))}>
              Desconectar
            </Button>
          )}
        </div>
      ))}
      {sessions && sessions.length > 1 && (
        <Button
          variant="danger"
          className="mt-4"
          onClick={() =>
            ui.confirm({
              title: 'Desconectar todos os outros dispositivos?',
              body: 'Você continuará conectado só aqui.',
              confirmLabel: 'Desconectar todos',
              danger: true,
              requirePassword: true,
              onConfirm: async (password) => {
                await api.post('/auth/sessions/revoke-others', { password });
                load();
              },
            })
          }
        >
          Desconectar todos os outros
        </Button>
      )}
    </>
  );
}

/* ───────────── aparência ───────────── */

function Appearance() {
  const s = useStore((st) => st.settings);
  const custom = useLocal((st) => st.customThemes);
  const fileRef = useRef<HTMLInputElement>(null);
  const allThemes: ThemeDef[] = [...THEMES, ...custom];
  return (
    <>
      <SectionTitle sub="Deixe o Vinlancord com a sua cara. As preferências acompanham sua conta em todos os dispositivos.">Aparência</SectionTitle>
      <Card title="Modo">
        <Segmented value={s.mode} onChange={(v) => void updateSettings({ mode: v })} options={[{ value: 'dark', label: 'Escuro' }, { value: 'light', label: 'Claro' }, { value: 'system', label: 'Seguir o sistema' }]} />
      </Card>
      <Card title="Biblioteca de temas">
        <div className="grid grid-cols-3 gap-3">
          {allThemes.map((t) => (
            <button key={t.id} onClick={() => void updateSettings({ theme: t.id, mode: t.mode })} className={cx('overflow-hidden rounded-xl border-2 text-left transition', s.theme === t.id ? 'border-accent' : 'border-line hover:border-line-strong')}>
              <div className="flex h-16" style={{ background: t.preview[0] }}>
                <div className="w-1/4" style={{ background: t.colors['bg-0'] }} />
                <div className="flex flex-1 flex-col justify-end gap-1 p-2" style={{ background: t.preview[1] }}>
                  <div className="h-1.5 w-3/4 rounded-full" style={{ background: t.colors['text-2'] }} />
                  <div className="h-1.5 w-1/2 rounded-full" style={{ background: t.preview[2] }} />
                </div>
              </div>
              <div className="bg-bg-2 px-2.5 py-2">
                <div className="flex items-center gap-1 text-sm font-semibold text-fg">{s.theme === t.id && <Check size={14} className="text-accent" />}{t.name}</div>
                <div className="line-clamp-2 text-[11px] text-fg-2">{t.description}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Importar tema (.json)</Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Download size={14} />}
            onClick={() => {
              const t = allThemes.find((x) => x.id === s.theme) ?? THEMES[0]!;
              const blob = new Blob([JSON.stringify({ name: `${t.name} (cópia)`, mode: t.mode, colors: t.colors }, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `tema-${t.id}.json`;
              a.click();
            }}
          >
            Exportar tema atual
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const t = validateCustomTheme(JSON.parse(await f.text()));
                local().set({ customThemes: [...custom.filter((c) => c.id !== t.id), t] });
                void updateSettings({ theme: t.id, mode: t.mode });
                ui.success(`Tema "${t.name}" importado!`);
              } catch (er) {
                ui.error(er);
              }
              e.target.value = '';
            }}
          />
        </div>
      </Card>
      <Card title="Cor de destaque">
        <div className="flex flex-wrap items-center gap-2">
          {ACCENTS.map((c) => (
            <button key={c} onClick={() => void updateSettings({ accent: c })} className={cx('grid size-9 place-items-center rounded-full transition hover:scale-110', s.accent === c && 'ring-2 ring-fg ring-offset-2 ring-offset-bg-1')} style={{ background: c }}>
              {s.accent === c && <Check size={16} className="text-white" />}
            </button>
          ))}
          <label className="relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-line-strong text-fg-2" title="Cor personalizada">
            <Plus size={16} />
            <input type="color" value={s.accent} onChange={(e) => void updateSettings({ accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </Card>
      <Card title="Texto e acessibilidade">
        <div className="mb-2 text-sm text-fg-1">Tamanho da fonte</div>
        <Slider value={s.fontScale} min={0.8} max={1.4} step={0.05} onChange={(v) => void updateSettings({ fontScale: v })} format={(v) => `${Math.round(v * 16)}px`} />
        <SettingRow title="Modo compacto" description="Mensagens mais juntinhas, cabem mais na tela."><Switch checked={s.compact} onChange={(v) => void updateSettings({ compact: v })} /></SettingRow>
        <SettingRow title="Reduzir animações" description="Desliga transições e efeitos de movimento."><Switch checked={s.reduceMotion} onChange={(v) => void updateSettings({ reduceMotion: v })} /></SettingRow>
        <SettingRow title="Mostrar segundos no horário"><Switch checked={s.showSeconds} onChange={(v) => void updateSettings({ showSeconds: v })} /></SettingRow>
      </Card>
    </>
  );
}

/* ───────────── voz e vídeo ───────────── */

function useDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = () => void navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => {});
    load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, []);
  return devices;
}

function VoiceSettings() {
  const l = useLocal();
  const devices = useDevices();
  const inCall = useVoice((s) => !!s.channelId);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [threshold, setThreshold] = useState(0);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const engine = useRef<AudioEngine | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const liveLevel = useVoice((s) => s.micLevel);

  useEffect(() => () => void engine.current?.destroy(), []);
  useEffect(() => {
    if (videoRef.current && preview) videoRef.current.srcObject = preview;
    return () => preview?.getTracks().forEach((t) => t.stop());
  }, [preview]);

  const startTest = async () => {
    if (testing) {
      await engine.current?.destroy();
      engine.current = null;
      setTesting(false);
      setLevel(0);
      return;
    }
    const e = new AudioEngine();
    engine.current = e;
    e.mode = 'vad';
    e.vadAuto = l.vadAuto;
    e.vadThresholdDb = l.vadThreshold;
    e.setInputVolume(l.inputVolume);
    e.onLevel = (lv) => {
      setLevel(lv);
      setThreshold(e.thresholdLevel);
    };
    try {
      await e.startMic({ deviceId: l.inputDeviceId, echoCancellation: l.echoCancellation, noiseSuppression: l.noiseSuppression, autoGainControl: l.autoGainControl });
      setTesting(true);
    } catch (er) {
      ui.error(er, 'Não foi possível acessar o microfone');
    }
  };

  const set = (patch: Parameters<typeof l.set>[0]) => {
    l.set(patch);
    voice.applyLocalSettings();
    if (engine.current) {
      engine.current.vadAuto = local().vadAuto;
      engine.current.vadThresholdDb = local().vadThreshold;
      engine.current.setInputVolume(local().inputVolume);
    }
  };
  const inputs = devices.filter((d) => d.kind === 'audioinput');
  const outputs = devices.filter((d) => d.kind === 'audiooutput');
  const cams = devices.filter((d) => d.kind === 'videoinput');
  const shownLevel = testing ? level : inCall ? liveLevel : 0;

  return (
    <>
      <SectionTitle sub="Ajustes deste dispositivo.">Voz e vídeo</SectionTitle>
      <Card title="Dispositivos de áudio">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Microfone">
            <Select value={l.inputDeviceId} onChange={(v) => void voice.setInputDevice(v).catch((e) => ui.error(e))} options={[{ value: 'default', label: 'Padrão do sistema' }, ...inputs.filter((d) => d.deviceId !== 'default').map((d) => ({ value: d.deviceId, label: d.label || 'Microfone' }))]} />
          </Field>
          <Field label="Saída (fones/caixas)">
            <Select value={l.outputDeviceId} onChange={(v) => void voice.setOutputDevice(v)} options={[{ value: 'default', label: 'Padrão do sistema' }, ...outputs.filter((d) => d.deviceId !== 'default').map((d) => ({ value: d.deviceId, label: d.label || 'Saída de áudio' }))]} />
          </Field>
          <Field label="Volume do microfone">
            <Slider value={Math.round(l.inputVolume * 100)} min={0} max={200} step={5} onChange={(v) => set({ inputVolume: v / 100 })} format={(v) => `${v}%`} />
          </Field>
          <Field label="Volume de saída">
            <Slider value={Math.round(l.outputVolume * 100)} min={0} max={200} step={5} onChange={(v) => set({ outputVolume: v / 100 })} format={(v) => `${v}%`} />
          </Field>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button size="sm" variant={testing ? 'danger' : 'secondary'} icon={<Mic size={14} />} onClick={() => void startTest()}>{testing ? 'Parar teste' : 'Testar microfone'}</Button>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-bg-4">
            <div className={cx('h-full rounded-full transition-[width] duration-75', shownLevel > threshold && threshold > 0 ? 'bg-success' : 'bg-fg-2')} style={{ width: `${shownLevel * 100}%` }} />
            {threshold > 0 && <div className="absolute top-0 h-full w-0.5 bg-warning" style={{ left: `${threshold * 100}%` }} />}
          </div>
        </div>
      </Card>
      <Card title="Modo de entrada">
        <Segmented value={l.inputMode} onChange={(v) => set({ inputMode: v })} options={[{ value: 'vad', label: 'Detecção de voz' }, { value: 'ptt', label: 'Aperte para falar' }]} />
        {l.inputMode === 'vad' ? (
          <div className="mt-4">
            <SettingRow title="Sensibilidade automática" description="Ajusta sozinho ao ruído do ambiente.">
              <Switch checked={l.vadAuto} onChange={(v) => set({ vadAuto: v })} />
            </SettingRow>
            {!l.vadAuto && (
              <Field label="Sensibilidade (dB)">
                <Slider value={l.vadThreshold} min={-90} max={-10} onChange={(v) => set({ vadThreshold: v })} format={(v) => `${v} dB`} />
              </Field>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <SettingRow title="Tecla de aperte-para-falar" description="Configure em Atalhos de teclado → Aperte para falar.">
              <Kbd>{l.keybinds.pushToTalk || 'não definida'}</Kbd>
            </SettingRow>
            <Field label="Atraso ao soltar">
              <Slider value={l.pttReleaseDelay} min={0} max={1000} step={20} onChange={(v) => set({ pttReleaseDelay: v })} format={(v) => `${v}ms`} />
            </Field>
          </div>
        )}
      </Card>
      <Card title="Processamento de voz">
        <SettingRow title="Supressão de ruído" description="Remove ventilador, teclado e barulhos de fundo.">
          <Switch checked={l.noiseSuppression} onChange={(v) => (set({ noiseSuppression: v }), void voice.restartMicWithSettings())} />
        </SettingRow>
        <SettingRow title="Cancelamento de eco" description="Evita que os outros ouçam a própria voz pelo seu microfone.">
          <Switch checked={l.echoCancellation} onChange={(v) => (set({ echoCancellation: v }), void voice.restartMicWithSettings())} />
        </SettingRow>
        <SettingRow title="Controle automático de ganho" description="Mantém seu volume constante.">
          <Switch checked={l.autoGainControl} onChange={(v) => (set({ autoGainControl: v }), void voice.restartMicWithSettings())} />
        </SettingRow>
      </Card>
      <Card title="Vídeo">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Câmera">
            <Select value={l.videoDeviceId} onChange={(v) => l.set({ videoDeviceId: v })} options={[{ value: '', label: 'Padrão' }, ...cams.map((d) => ({ value: d.deviceId, label: d.label || 'Câmera' }))]} />
          </Field>
          <Field label="Qualidade da câmera">
            <Select value={l.cameraQuality} onChange={(v) => l.set({ cameraQuality: v })} options={[{ value: '480p', label: '480p (economia)' }, { value: '720p', label: '720p (recomendado)' }, { value: '1080p', label: '1080p' }]} />
          </Field>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl bg-black">
          {preview ? (
            <video ref={videoRef} autoPlay muted playsInline className={cx('aspect-video w-full object-cover', l.mirrorCamera && '-scale-x-100')} />
          ) : (
            <div className="grid aspect-video place-items-center">
              <Button
                variant="secondary"
                onClick={() =>
                  void navigator.mediaDevices
                    .getUserMedia({ video: l.videoDeviceId ? { deviceId: { ideal: l.videoDeviceId } } : true })
                    .then(setPreview)
                    .catch((e) => ui.error(e, 'Câmera indisponível'))
                }
              >
                Testar câmera
              </Button>
            </div>
          )}
        </div>
        <SettingRow title="Espelhar minha câmera (só para mim)"><Switch checked={l.mirrorCamera} onChange={(v) => l.set({ mirrorCamera: v })} /></SettingRow>
      </Card>
      <Card title="Compartilhamento de tela">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Qualidade padrão">
            <Select value={l.screenQuality} onChange={(v) => l.set({ screenQuality: v })} options={[{ value: '720p30', label: '720p 30 fps' }, { value: '1080p30', label: '1080p 30 fps' }, { value: '1080p60', label: '1080p 60 fps' }, { value: '1440p60', label: '1440p 60 fps' }, { value: 'source', label: 'Original' }]} />
          </Field>
          <Field label="Codificação">
            <Select value={l.screenCodec} onChange={(v) => l.set({ screenCodec: v })} options={[{ value: 'auto', label: 'Automática (hardware)' }, { value: 'h264', label: 'H.264' }, { value: 'vp9', label: 'VP9' }, { value: 'vp8', label: 'VP8' }]} />
          </Field>
        </div>
        <SettingRow title="Abrir transmissões automaticamente em chamadas privadas" description="Em servidores você escolhe quando assistir.">
          <Switch checked={l.autoWatchStreams} onChange={(v) => l.set({ autoWatchStreams: v })} />
        </SettingRow>
      </Card>
      <Card title="Avançado">
        <SettingRow title="Forçar retransmissão (TURN)" description="Use se a chamada não conecta em redes muito restritas (empresa, faculdade). Pode aumentar a latência.">
          <Switch checked={l.forceRelay} onChange={(v) => l.set({ forceRelay: v })} />
        </SettingRow>
      </Card>
    </>
  );
}

/* ───────────── notificações ───────────── */

function Notifications() {
  const n = useStore((s) => s.settings.notifications);
  const soundVolume = useLocal((s) => s.soundVolume);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const set = (patch: Partial<typeof n>) => void updateSettings({ notifications: { ...n, ...patch } });
  return (
    <>
      <SectionTitle sub="Escolha como e quando ser avisado. Por servidor/canal, use o clique direito para silenciar ou mudar o nível.">Notificações</SectionTitle>
      <Card title="Notificações do sistema">
        <SettingRow title="Ativar notificações na área de trabalho" description={perm === 'denied' ? 'Bloqueadas pelo sistema. Libere nas configurações do sistema operacional.' : 'Aparecem quando o Vinlancord não está em foco.'}>
          <Switch
            checked={n.desktop && perm === 'granted'}
            onChange={async (v) => {
              if (v) setPerm(await requestNotificationPermission());
              set({ desktop: v });
            }}
          />
        </SettingRow>
        <SettingRow title="Piscar a barra de tarefas" description="Em menções e mensagens diretas."><Switch checked={n.flashTaskbar} onChange={(v) => set({ flashTaskbar: v })} /></SettingRow>
        <SettingRow title="Mensagens diretas"><Segmented value={n.dmLevel} onChange={(v) => set({ dmLevel: v })} options={[{ value: 'all', label: 'Notificar' }, { value: 'nothing', label: 'Silenciar' }]} /></SettingRow>
        <SettingRow title="Pedidos de amizade"><Switch checked={n.friendRequests} onChange={(v) => set({ friendRequests: v })} /></SettingRow>
      </Card>
      <Card title="Sons">
        <SettingRow title="Sons ativados"><Switch checked={n.sounds} onChange={(v) => set({ sounds: v })} /></SettingRow>
        <Field label="Volume dos sons">
          <Slider value={Math.round(soundVolume * 100)} min={0} max={100} onChange={(v) => (local().set({ soundVolume: v / 100 }), setSoundVolume(v / 100))} format={(v) => `${v}%`} />
        </Field>
        {(
          [
            ['messageSound', 'Nova mensagem', 'message'],
            ['mentionSound', 'Menção', 'mention'],
            ['callSound', 'Chamada recebida', 'ring'],
            ['voiceJoinSound', 'Alguém entra/sai da sua chamada', 'join'],
          ] as const
        ).map(([k, label, sound]) => (
          <SettingRow key={k} title={label}>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => playSound(sound)}>Ouvir</Button>
              <Switch checked={n[k]} onChange={(v) => set({ [k]: v })} />
            </div>
          </SettingRow>
        ))}
      </Card>
      <p className="text-xs text-fg-2">Status “Não perturbe” silencia todos os sons e notificações do sistema.</p>
    </>
  );
}

/* ───────────── atalhos ───────────── */

function Keybinds() {
  const binds = useLocal((s) => s.keybinds);
  const [recording, setRecording] = useState<KeybindAction | null>(null);
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setRecording(null);
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const acc = formatAccelerator(e, recording === 'pushToTalk');
      local().set({ keybinds: { ...local().keybinds, [recording]: acc } });
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording]);
  return (
    <>
      <SectionTitle sub="Clique em um atalho e pressione a nova combinação. Os marcados como globais funcionam mesmo com o app minimizado (desktop).">Atalhos de teclado</SectionTitle>
      <Card>
        {(Object.keys(KEYBIND_LABELS) as KeybindAction[]).map((a) => (
          <SettingRow key={a} title={<span className="flex items-center gap-2">{KEYBIND_LABELS[a].label}{KEYBIND_LABELS[a].global && desktop && <span className="rounded bg-accent/20 px-1.5 text-[10px] font-bold text-accent">GLOBAL</span>}</span>}>
            <div className="flex items-center gap-2">
              <button onClick={() => setRecording(a)} className={cx('min-w-[140px] rounded-lg border px-3 py-1.5 font-mono text-[13px] transition', recording === a ? 'border-accent bg-accent/15 text-accent' : 'border-line bg-bg-2 text-fg hover:border-line-strong')}>
                {recording === a ? 'Pressione…' : binds[a] || 'Nenhum'}
              </button>
              {binds[a] !== DEFAULT_KEYBINDS[a] && (
                <button className="text-xs text-fg-2 hover:text-fg" onClick={() => local().set({ keybinds: { ...binds, [a]: DEFAULT_KEYBINDS[a] } })}>
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          </SettingRow>
        ))}
      </Card>
      <Card title="Markdown nas mensagens">
        <div className="grid grid-cols-2 gap-2 font-mono text-[13px] text-fg-1">
          {[
            ['**negrito**', 'negrito'],
            ['*itálico*', 'itálico'],
            ['__sublinhado__', 'sublinhado'],
            ['~~tachado~~', 'tachado'],
            ['||spoiler||', 'spoiler'],
            ['`código`', 'código'],
            ['```bloco```', 'bloco de código'],
            ['> citação', 'citação'],
            ['- item', 'lista'],
            ['[texto](https://…)', 'link'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between rounded-md bg-bg-2 px-2 py-1">
              <span>{k}</span>
              <span className="font-sans text-fg-2">{v}</span>
            </div>
          ))}
        </div>
      </Card>
      <p className="flex items-center gap-1.5 text-xs text-fg-2"><Keyboard size={14} /> Dica: ↑ na caixa de mensagem edita a sua última mensagem.</p>
    </>
  );
}

/* ───────────── atividade de jogo ───────────── */

function Activity() {
  const s = useStore((st) => st.settings);
  const presence = useStore((st) => (st.me ? st.presences[st.me.id] : undefined));
  const [processes, setProcesses] = useState<string[] | null>(null);
  const [pick, setPick] = useState('');
  const [name, setName] = useState('');
  return (
    <>
      <SectionTitle sub="O app desktop detecta automaticamente jogos populares abertos no seu PC.">Atividade de jogo</SectionTitle>
      <Card>
        <SettingRow title="Compartilhar o jogo atual" description="Mostra “Jogando …” no seu status para amigos e membros dos seus servidores.">
          <Switch checked={s.privacy.showActivity} onChange={(v) => void updateSettings({ privacy: { ...s.privacy, showActivity: v } })} />
        </SettingRow>
        <div className="mt-3 rounded-xl bg-bg-2 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-fg-2">Detectado agora</div>
          <div className="mt-2 flex items-center gap-2 text-fg">
            <Gamepad2 size={18} className="text-accent" />
            {presence?.activities[0]?.name ?? (desktop ? 'Nenhum jogo detectado' : 'Disponível apenas no app desktop')}
          </div>
        </div>
      </Card>
      {desktop && (
        <Card title="Adicionar jogo manualmente">
          <p className="mb-3 text-sm text-fg-2">Não achou seu jogo? Abra o jogo, escolha o processo na lista e dê um nome.</p>
          <div className="flex gap-2">
            {processes ? (
              <Select value={pick} onChange={setPick} options={[{ value: '', label: 'Selecione o processo' }, ...processes.map((p) => ({ value: p, label: p }))]} />
            ) : (
              <Button variant="secondary" onClick={() => void desktop!.activity.listProcesses().then(setProcesses)}>Ver programas abertos</Button>
            )}
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do jogo" />
            <Button
              disabled={!pick || !name.trim()}
              onClick={() => {
                void updateSettings({ customGames: [...s.customGames.filter((g) => g.process !== pick), { process: pick, name: name.trim() }] });
                setPick('');
                setName('');
              }}
            >
              Adicionar
            </Button>
          </div>
          {s.customGames.map((g) => (
            <div key={g.process} className="mt-2 flex items-center gap-3 rounded-lg bg-bg-2 px-3 py-2 text-sm">
              <Gamepad2 size={16} className="text-accent" />
              <span className="flex-1 text-fg">{g.name}</span>
              <span className="font-mono text-xs text-fg-2">{g.process}</span>
              <button onClick={() => void updateSettings({ customGames: s.customGames.filter((x) => x.process !== g.process) })} className="text-fg-2 hover:text-danger"><Trash2 size={15} /></button>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

/* ───────────── desktop ───────────── */

function DesktopTab() {
  const [ds, setDs] = useState<DesktopSettings | null>(null);
  const [upd, setUpd] = useState<UpdateStatus>({ state: 'idle' });
  const closeToTray = useLocal((s) => s.closeToTray);
  useEffect(() => {
    void desktop!.settings.get().then(setDs);
    return desktop!.updates.onStatus(setUpd);
  }, []);
  const set = async (patch: Partial<DesktopSettings>) => setDs(await desktop!.settings.set(patch));
  if (!ds) return null;
  return (
    <>
      <SectionTitle>Windows e desktop</SectionTitle>
      <Card title="Sistema">
        <SettingRow title="Iniciar com o Windows" description="Abre o Vinlancord minimizado quando você liga o PC."><Switch checked={ds.openAtLogin} onChange={(v) => void set({ openAtLogin: v })} /></SettingRow>
        <SettingRow title="Minimizar para a bandeja ao fechar" description="O X esconde a janela e você continua recebendo mensagens e chamadas."><Switch checked={ds.minimizeToTray} onChange={(v) => (void set({ minimizeToTray: v }), local().set({ closeToTray: v }))} /></SettingRow>
        <SettingRow title="Aceleração por hardware" description="Usa a placa de vídeo para interface e vídeo. Desative só se tiver problemas gráficos (requer reiniciar)."><Switch checked={ds.hardwareAcceleration} onChange={(v) => void set({ hardwareAcceleration: v })} /></SettingRow>
      </Card>
      <Card title="Atualizações">
        <SettingRow
          title={`Versão ${desktop!.version}`}
          description={
            {
              idle: 'Clique para procurar atualizações.',
              checking: 'Procurando…',
              available: `Versão ${upd.version} encontrada, baixando…`,
              downloading: `Baixando… ${Math.round((upd.progress ?? 0) * 100)}%`,
              ready: `Versão ${upd.version} pronta para instalar.`,
              none: 'Você está na versão mais recente. 🎉',
              error: upd.message ?? 'Falha ao procurar atualizações.',
              disabled: 'Atualização automática não configurada nesta instalação.',
            }[upd.state]
          }
        >
          {upd.state === 'ready' ? <Button onClick={() => desktop!.updates.install()}>Reiniciar e atualizar</Button> : <Button variant="secondary" loading={upd.state === 'checking'} onClick={() => void desktop!.updates.check().then(setUpd)}>Procurar</Button>}
        </SettingRow>
      </Card>
      <input type="hidden" value={String(closeToTray)} />
    </>
  );
}

function About() {
  return (
    <>
      <SectionTitle>Sobre o Vinlancord</SectionTitle>
      <Card>
        <p className="text-sm text-fg-1">
          Vinlancord é uma plataforma de comunicação para você e seus amigos: chat em tempo real, chamadas de voz e vídeo com SFU (mediasoup/WebRTC), compartilhamento de tela com áudio, servidores, cargos e muito mais.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-bg-2 p-3"><div className="text-xs text-fg-2">Servidor</div><div className="truncate text-fg">{api.server}</div></div>
          <div className="rounded-lg bg-bg-2 p-3"><div className="text-xs text-fg-2">App</div><div className="text-fg">{desktop ? `Desktop ${desktop.version}` : 'Web'}</div></div>
        </div>
      </Card>
    </>
  );
}
