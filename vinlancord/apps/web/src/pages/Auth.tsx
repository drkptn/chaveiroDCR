/** Telas de entrada: login, cadastro, recuperação/redefinição de senha e verificação de e-mail. */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Eye, EyeOff, MailCheck, Server, ShieldCheck, Sparkles } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { login, register } from '../store/actions';
import { Button, Field, Input, LogoMark, cx } from '../components/ui';
import { Sigil, AnimatedWordmark } from '../components/brand';
import { THEMES } from '../lib/themes';
import { useAppearance, pickAppearanceLocally } from '../store/appearance';
import { TitleBar } from '../components/layout/TitleBar';

interface ServerConfig {
  registrationEnabled: boolean;
  registrationCodeRequired: boolean;
  requireEmailVerification: boolean;
  mailConfigured: boolean;
}

const TAGLINES = [
  'Sua turma, sua voz, seu lugar.',
  'Escreva seu nome na história do servidor.',
  'Toda muralha tem um portão. Este é o seu.',
  'Mova suas peças. Chame seus aliados.',
  'Chamadas cristalinas. Zero enrolação.',
];

function useServerConfig() {
  const [cfg, setCfg] = useState<ServerConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [server, setServerState] = useState(api.server);
  useEffect(() => {
    setCfg(null);
    setError(null);
    api
      .get<ServerConfig>('/auth/config')
      .then(setCfg)
      .catch((e) => setError(errorMessage(e)));
  }, [server]);
  return {
    cfg,
    error,
    server,
    setServer: (s: string) => {
      api.setServer(s);
      setServerState(api.server);
    },
  };
}

/** Escolha rápida de estética antes de entrar (vale para a conta ao fazer login). */
function AestheticPicker() {
  const current = useAppearance((s) => s.current.preset);
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-2">Escolha sua estética</div>
      <div className="flex flex-wrap gap-2">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pickAppearanceLocally(t.appearance)}
            className={cx(
              'vl-cut-sm group flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur transition-all hover:-translate-y-0.5',
              current === t.id ? 'border-accent bg-accent/15 text-fg shadow-[0_0_18px_-6px_var(--vl-glow-color)]' : 'border-line-strong bg-bg-2/50 text-fg-1 hover:border-accent/50 hover:text-fg',
            )}
            title={t.description}
          >
            <span className="flex -space-x-1">
              {t.preview.map((c, i) => (
                <span key={i} className="size-3 rounded-full ring-1 ring-black/40" style={{ background: c }} />
              ))}
            </span>
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function AuthLayout({ children }: { children: ReactNode }) {
  const [tag, setTag] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTag((x) => (x + 1) % TAGLINES.length), 4200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* lado artístico */}
        <div className="relative hidden flex-1 overflow-hidden lg:block">
          <div className="pointer-events-none absolute -right-48 top-1/2 -translate-y-1/2 opacity-35">
            <Sigil size={620}>
              <span />
            </Sigil>
          </div>
          <div className="relative flex h-full flex-col justify-between p-12">
            <div className="flex items-center gap-3 animate-fade-in">
              <LogoMark size={40} className="vl-glow-pulse" />
              <AnimatedWordmark className="text-3xl text-fg" />
            </div>
            <div className="max-w-xl">
              <div className="vl-cut-sm mb-5 inline-flex items-center gap-2 rounded-full border border-line-strong bg-bg-2/60 px-3 py-1 text-xs text-fg-1 backdrop-blur">
                <Sparkles size={14} className="text-accent" /> Voz, vídeo, tela e chat em tempo real
              </div>
              <h1 key={tag} className="font-display text-6xl leading-[1.05] text-fg text-glow animate-slide-up">
                {TAGLINES[tag]}
              </h1>
              <p className="mt-5 max-w-md text-lg text-fg-1">Crie servidores, chame os amigos e deixe tudo com a sua cara — cores, fontes, formas e animações.</p>
              <div className="mt-8">
                <AestheticPicker />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-fg-2">
              <ShieldCheck size={14} /> Senhas protegidas com Argon2id e conexões criptografadas.
            </div>
          </div>
        </div>
        {/* formulário */}
        <div className="flex w-full items-center justify-center overflow-y-auto p-6 lg:w-[540px] lg:pr-10">
          <div className="vl-panel vl-dialog w-full max-w-[420px] rounded-2xl border border-line-strong p-8">
            <div className="mb-6 lg:hidden">
              <AestheticPicker />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function ServerPicker({ server, setServer, error }: { server: string; setServer: (s: string) => void; error: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(server);
  if (editing)
    return (
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setServer(value);
          setEditing(false);
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://vinlancord.seudominio.com" autoFocus />
        <Button type="submit" variant="secondary">Usar</Button>
      </form>
    );
  return (
    <button onClick={() => setEditing(true)} className="mt-6 flex w-full items-center justify-center gap-2 text-xs text-fg-2 transition hover:text-fg">
      <Server size={13} />
      <span className="truncate">Servidor: {server.replace(/^https?:\/\//, '')}</span>
      {error ? <span className="text-danger">• indisponível</span> : <span className="text-success">•</span>}
      <span className="underline">alterar</span>
    </button>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-2 hover:text-fg" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const nav = useNavigate();
  const { server, setServer, error: serverError } = useServerConfig();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(form.login, form.password);
      nav('/channels/@me');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthLayout>
      <div className="mb-8 lg:hidden">
        <LogoMark size={48} />
      </div>
      <h2 className="font-display text-3xl font-bold text-fg">Que bom te ver de novo!</h2>
      <p className="mt-2 text-sm text-fg-2">Entre para voltar para a resenha.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="E-mail ou nome de usuário">
          <Input autoFocus autoComplete="username" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required />
        </Field>
        <Field label="Senha">
          <PasswordInput autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </Field>
        <div className="-mt-1 text-right">
          <Link to="/forgot" className="text-xs text-accent-2 hover:underline">Esqueceu a senha?</Link>
        </div>
        {error && <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger animate-fade-in">{error}</div>}
        <Button type="submit" size="lg" className="w-full" loading={loading}>Entrar</Button>
      </form>
      <p className="mt-6 text-center text-sm text-fg-2">
        Primeira vez por aqui? <Link to="/register" className="font-medium text-accent-2 hover:underline">Criar conta</Link>
      </p>
      <ServerPicker server={server} setServer={setServer} error={serverError} />
    </AuthLayout>
  );
}

export function RegisterPage() {
  const nav = useNavigate();
  const { cfg, server, setServer, error: serverError } = useServerConfig();
  const [form, setForm] = useState({ email: '', username: '', displayName: '', password: '', registrationCode: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
    try {
      const r = await register({
        email: form.email,
        username: form.username,
        displayName: form.displayName || undefined,
        password: form.password,
        registrationCode: form.registrationCode || undefined,
      });
      if (r.verificationRequired) setDone(true);
      else nav('/channels/@me');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  if (done)
    return (
      <AuthLayout>
        <div className="text-center">
          <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-accent/15 text-accent"><MailCheck size={30} /></div>
          <h2 className="font-display text-2xl font-bold text-fg">Confira seu e-mail</h2>
          <p className="mt-2 text-sm text-fg-2">Enviamos um link de confirmação para <b className="text-fg">{form.email}</b>. Depois é só entrar!</p>
          <Button className="mt-6 w-full" onClick={() => nav('/login')}>Ir para o login</Button>
        </div>
      </AuthLayout>
    );
  return (
    <AuthLayout>
      <h2 className="font-display text-3xl font-bold text-fg">Criar conta</h2>
      <p className="mt-2 text-sm text-fg-2">Leva menos de um minuto. Prometo.</p>
      {cfg && !cfg.registrationEnabled && <div className="mt-6 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">O cadastro está desativado neste servidor.</div>}
      <form onSubmit={submit} className="mt-7 space-y-4">
        <Field label="E-mail" error={fields.email}>
          <Input type="email" autoComplete="email" autoFocus value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} invalid={!!fields.email} required />
        </Field>
        <Field label="Nome de exibição" hint="É como os outros vão te ver. Pode ter emoji e acento!">
          <Input value={form.displayName} maxLength={32} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="D" />
        </Field>
        <Field label="Nome de usuário" error={fields.username} hint="Único: letras minúsculas, números, _ e .">
          <Input
            autoComplete="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '') })}
            invalid={!!fields.username}
            required
            minLength={2}
            maxLength={32}
          />
        </Field>
        <Field label="Senha" error={fields.password} hint="Mínimo de 8 caracteres.">
          <PasswordInput autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} invalid={!!fields.password} required minLength={8} />
        </Field>
        {cfg?.registrationCodeRequired && (
          <Field label="Código de cadastro" error={fields.registrationCode} hint="Este servidor é privado. Peça o código para quem administra.">
            <Input value={form.registrationCode} onChange={(e) => setForm({ ...form, registrationCode: e.target.value })} required />
          </Field>
        )}
        {error && !Object.keys(fields).length && <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={cfg ? !cfg.registrationEnabled : false}>Criar conta</Button>
        <p className="text-center text-xs text-fg-2">Ao criar a conta você concorda em ser gente boa com todo mundo. 🙂</p>
      </form>
      <p className="mt-6 text-center text-sm text-fg-2">
        Já tem conta? <Link to="/login" className="font-medium text-accent-2 hover:underline">Entrar</Link>
      </p>
      <ServerPicker server={server} setServer={setServer} error={serverError} />
    </AuthLayout>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthLayout>
      <Link to="/login" className="mb-6 inline-flex items-center gap-1 text-sm text-fg-2 hover:text-fg"><ArrowLeft size={16} /> Voltar</Link>
      <h2 className="font-display text-3xl font-bold text-fg">Recuperar senha</h2>
      {sent ? (
        <p className="mt-4 text-sm text-fg-1">Se existir uma conta com <b>{email}</b>, você vai receber um link para criar uma nova senha. Ele vale por 1 hora.</p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
              await api.post('/auth/forgot-password', { email });
              setSent(true);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setLoading(false);
            }
          }}
        >
          <p className="text-sm text-fg-2">Informe o e-mail da sua conta e enviaremos um link de redefinição.</p>
          <Field label="E-mail"><Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          {error && <div className="text-sm text-danger">{error}</div>}
          <Button type="submit" className="w-full" size="lg" loading={loading}>Enviar link</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  return (
    <AuthLayout>
      <h2 className="font-display text-3xl font-bold text-fg">Nova senha</h2>
      {ok ? (
        <>
          <p className="mt-4 text-sm text-fg-1">Senha alterada! Por segurança, todas as sessões foram encerradas.</p>
          <Button className="mt-6 w-full" onClick={() => nav('/login')}>Entrar</Button>
        </>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
              await api.post('/auth/reset-password', { token: params.get('token') ?? '', password: pw });
              setOk(true);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="Nova senha" hint="Mínimo de 8 caracteres."><PasswordInput autoFocus value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required /></Field>
          {error && <div className="text-sm text-danger">{error}</div>}
          <Button type="submit" className="w-full" size="lg" loading={loading}>Salvar nova senha</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .post('/auth/verify-email', { token: params.get('token') ?? '' })
      .then(() => setState('ok'))
      .catch((e) => {
        setError(errorMessage(e));
        setState('error');
      });
  }, [params]);
  return (
    <AuthLayout>
      <div className="text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-accent/15 text-accent"><MailCheck size={30} /></div>
        <h2 className="font-display text-2xl font-bold text-fg">
          {state === 'loading' ? 'Confirmando…' : state === 'ok' ? 'E-mail confirmado!' : 'Link inválido'}
        </h2>
        <p className="mt-2 text-sm text-fg-2">{state === 'ok' ? 'Tudo certo, sua conta está protegida.' : state === 'error' ? error : 'Só um instante.'}</p>
        {state !== 'loading' && (
          <Link to="/channels/@me" className="mt-6 inline-block">
            <Button>Abrir o Vinlancord</Button>
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}
