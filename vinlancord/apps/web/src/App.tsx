import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { WifiOff, MailWarning, X } from 'lucide-react';
import { useStore, S, sortedGuildChannels } from './store';
import { useUI, ui } from './store/ui';
import { useLocal, local } from './store/local';
import { ackChannel } from './store/actions';
import { api } from './lib/api';
import { gateway } from './lib/gateway';
import { setNavigate } from './lib/nav';
import { applyAppearance } from './lib/themes';
import { useAppearance, syncAppearance } from './store/appearance';
import { Ambience } from './components/Ambience';
import { desktop } from './lib/desktop';
import { badgeCount } from './lib/notify';
import { setSoundVolume, setSoundOutput } from './lib/sounds';
import { useKeybinds, type KeybindHandlers } from './lib/keybinds';
import { voice, useVoice } from './lib/voice/engine';
import { LoginPage, RegisterPage, ForgotPage, ResetPage, VerifyPage, HostPage } from './pages/Auth';
import { connectToServer, parseServerLink } from './lib/serverLink';
import { onRouteChange } from './lib/mobile';
import { initNative } from './lib/native';
import { LoadingScreen } from './pages/Loading';
import { DiscoverPage } from './pages/Discover';
import { Overlays } from './components/overlays';
import { TitleBar } from './components/layout/TitleBar';
import { ServerRail } from './components/layout/ServerRail';
import { GuildSidebar, HomeSidebar } from './components/layout/Sidebar';
import { FriendsView } from './components/friends/FriendsView';
import { ChannelView } from './components/chat/ChannelView';
import { IncomingCall } from './components/voice/VoiceView';
import { Button } from './components/ui';
import { MarkdownProvider } from './components/MarkdownProvider';

function NavigationBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  // celular: abrir um canal/conversa mostra o conteúdo
  useEffect(() => onRouteChange(), [location.pathname]);
  useEffect(() => setNavigate((to) => navigate(to)), [navigate]);
  // convite de servidor (vinlancord://servidor?...) funciona até na tela de login
  useEffect(() => {
    const onLink = (url: string) => {
      const link = parseServerLink(url);
      if (link) void connectToServer(link);
      const invite = /invite\/([a-zA-Z0-9]{4,16})/.exec(url);
      if (invite && api.token) ui.open({ type: 'joinServer', code: invite[1] });
    };
    initNative(onLink);
    return desktop?.onDeepLink(onLink);
  }, []);
  return null;
}

function ThemeApplier() {
  const settings = useStore((st) => st.settings);
  const booted = useStore((st) => st.booted);
  const custom = useLocal((st) => st.customThemes);
  const current = useAppearance((s) => s.current);
  useEffect(() => {
    if (booted) syncAppearance(settings, custom);
  }, [settings, custom, booted]);
  useEffect(() => applyAppearance(current, { fontScale: settings.fontScale, reduceMotion: settings.reduceMotion }), [current, settings.fontScale, settings.reduceMotion]);
  return createPortal(<Ambience />, document.body);
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const booted = useStore((s) => s.booted);
  if (!api.token) return <Navigate to="/login" replace />;
  if (!booted) return <LoadingScreen />;
  return <>{children}</>;
}

function GuildRoute() {
  const { guildId, channelId } = useParams();
  const channel = useStore((s) => (channelId ? s.channels[channelId] : undefined));
  const guild = useStore((s) => s.guilds[guildId!]);
  const fallback = useStore((s) => {
    if (!guildId || !s.guilds[guildId]) return null;
    const last = localStorage.getItem(`vl:last:${guildId}`);
    if (last && s.channels[last]?.guildId === guildId) return last;
    const t = sortedGuildChannels(s, guildId);
    const all = [...t.uncategorized, ...t.categories.flatMap((c) => c.channels)];
    return all.find((c) => c.type === 'text')?.id ?? all[0]?.id ?? null;
  });
  if (!guild) return <Navigate to="/channels/@me" replace />;
  if (!channel || channel.guildId !== guildId) {
    if (fallback && fallback !== channelId) return <Navigate to={`/channels/${guildId}/${fallback}`} replace />;
    return (
      <>
        <GuildSidebar />
        <main className="vl-content vl-panel grid flex-1 place-items-center text-fg-2">Nenhum canal disponível.</main>
      </>
    );
  }
  return (
    <>
      <GuildSidebar />
      <ChannelView channel={channel} />
    </>
  );
}

function DMRoute() {
  const { channelId } = useParams();
  const channel = useStore((s) => s.channels[channelId!]);
  if (!channel || channel.guildId) return <Navigate to="/channels/@me" replace />;
  return (
    <>
      <HomeSidebar />
      <ChannelView channel={channel} />
    </>
  );
}

function InviteRoute() {
  const { code } = useParams();
  useEffect(() => {
    ui.open({ type: 'joinServer', code });
  }, [code]);
  return <Navigate to="/channels/@me" replace />;
}

function ConnectionBanner() {
  const conn = useStore((s) => s.conn);
  if (conn === 'ready' || conn === 'idle' || conn === 'connecting') return null;
  return (
    <div className="flex h-8 shrink-0 items-center justify-center gap-2 bg-warning text-[13px] font-medium text-black animate-slide-up">
      <WifiOff size={14} /> Conexão perdida. Tentando reconectar… suas mensagens chegam assim que voltar.
      <button className="underline" onClick={() => gateway.reconnectNow()}>Reconectar agora</button>
    </div>
  );
}

function VerifyBanner() {
  const me = useStore((s) => s.me);
  const dismissed = useLocal((s) => s.dismissedVerifyBanner);
  if (!me || me.emailVerified || dismissed) return null;
  return (
    <div className="flex h-8 shrink-0 items-center justify-center gap-2 bg-accent text-[13px] font-medium text-accent-fg">
      <MailWarning size={14} /> Confirme seu e-mail para proteger sua conta.
      <button className="underline" onClick={() => void api.post('/auth/resend-verification').then(() => ui.success('E-mail de confirmação enviado!')).catch((e) => ui.error(e))}>Reenviar e-mail</button>
      <button className="ml-2 opacity-80 hover:opacity-100" onClick={() => local().set({ dismissedVerifyBanner: true })} aria-label="Dispensar"><X size={14} /></button>
    </div>
  );
}

/** Efeitos globais: foco, atalhos, inatividade, jogos, badge, links profundos. */
function GlobalEffects() {
  const nav = useNavigate();
  const loc = useLocation();
  const customGames = useStore((s) => s.settings.customGames);
  const soundVolume = useLocal((s) => s.soundVolume);
  const outputDevice = useLocal((s) => s.outputDeviceId);

  useEffect(() => setSoundVolume(soundVolume), [soundVolume]);
  useEffect(() => void setSoundOutput(outputDevice), [outputDevice]);

  // foco da janela (notificações e "lido")
  useEffect(() => {
    const on = () => {
      useUI.setState({ focused: true });
      const ch = useUI.getState().currentChannelId;
      if (ch) void ackChannel(ch);
    };
    const off = () => useUI.setState({ focused: false });
    window.addEventListener('focus', on);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('focus', on);
      window.removeEventListener('blur', off);
    };
  }, []);

  // ausente automático após 10 min sem interação
  useEffect(() => {
    let last = Date.now();
    let afk = false;
    const bump = () => {
      last = Date.now();
      if (afk) {
        afk = false;
        void gateway.rpc('presence.update', { afk: false }).catch(() => {});
      }
    };
    const t = setInterval(async () => {
      let idleSecs = (Date.now() - last) / 1000;
      if (desktop) idleSecs = await desktop.idle.getIdleSeconds().catch(() => idleSecs);
      if (!afk && idleSecs > 600 && gateway.status === 'ready') {
        afk = true;
        void gateway.rpc('presence.update', { afk: true }).catch(() => {});
      } else if (afk && idleSecs < 30) bump();
    }, 30_000);
    window.addEventListener('mousemove', bump, { passive: true });
    window.addEventListener('keydown', bump);
    return () => {
      clearInterval(t);
      window.removeEventListener('mousemove', bump);
      window.removeEventListener('keydown', bump);
    };
  }, []);

  // detecção de jogos (desktop)
  const lastGame = useRef<string>('');
  useEffect(() => {
    if (!desktop) return;
    const started = new Map<string, number>();
    const scan = async () => {
      if (gateway.status !== 'ready') return;
      const games = await desktop!.activity.detect(customGames).catch(() => []);
      const g = games[0];
      const key = g?.name ?? '';
      if (key === lastGame.current) return;
      lastGame.current = key;
      if (g && !started.has(g.name)) started.set(g.name, Date.now());
      void gateway.rpc('presence.update', { activities: g ? [{ type: 'playing', name: g.name, startedAt: started.get(g.name) ?? Date.now() }] : [] }).catch(() => {});
    };
    void scan();
    const t = setInterval(() => void scan(), 15_000);
    return () => clearInterval(t);
  }, [customGames]);

  // reenvia atividade após reconectar
  const conn = useStore((s) => s.conn);
  useEffect(() => {
    if (conn === 'ready') lastGame.current = '__resync__';
  }, [conn]);

  // badge do app (menções)
  useEffect(() => useStore.subscribe(() => desktop?.notify.setBadge(badgeCount())), []);

  // links vinlancord://invite/CODE e vinlancord://servidor: tratados no NavigationBridge (desktop e celular)

  // avisos do motor de voz
  useEffect(() => {
    const f = (e: Event) => ui.toast({ kind: 'info', title: 'Chamada', body: (e as CustomEvent).detail });
    window.addEventListener('vl:voice-notice', f);
    return () => window.removeEventListener('vl:voice-notice', f);
  }, []);

  // atalhos
  const handlers = useMemo<KeybindHandlers>(() => {
    const navChannels = (dir: 1 | -1) => {
      const s = S();
      const gid = useUI.getState().currentGuildId;
      const cur = useUI.getState().currentChannelId;
      if (gid) {
        const t = sortedGuildChannels(s, gid);
        const list = [...t.uncategorized, ...t.categories.flatMap((c) => c.channels)].filter((c) => c.type === 'text');
        const i = list.findIndex((c) => c.id === cur);
        const next = list[(i + dir + list.length) % list.length];
        if (next) nav(`/channels/${gid}/${next.id}`);
      } else {
        const list = s.privateChannelIds;
        const i = cur ? list.indexOf(cur) : -1;
        const next = list[(i + dir + list.length) % list.length];
        if (next) nav(`/channels/@me/${next}`);
      }
    };
    const navGuilds = (dir: 1 | -1) => {
      const order = ['@me', ...S().guildOrder];
      const cur = useUI.getState().currentGuildId ?? '@me';
      const next = order[(order.indexOf(cur) + dir + order.length) % order.length]!;
      nav(next === '@me' ? '/channels/@me' : `/channels/${next}`);
    };
    return {
      toggleMute: () => void voice.setMute(!useVoice.getState().selfMute),
      toggleDeafen: () => void voice.setDeaf(!useVoice.getState().selfDeaf),
      toggleCamera: () => useVoice.getState().channelId && void voice.setCamera(!useVoice.getState().camera).catch((e) => ui.error(e)),
      toggleScreen: () => useVoice.getState().channelId && (useVoice.getState().screen ? void voice.stopScreen() : ui.open({ type: 'screenShare' })),
      disconnectVoice: () => void voice.leave(),
      openSettings: () => ui.open({ type: 'userSettings' }),
      quickSwitcher: () => ui.open({ type: 'quickSwitcher' }),
      search: () => document.getElementById('vl-search-input')?.focus(),
      prevChannel: () => navChannels(-1),
      nextChannel: () => navChannels(1),
      prevServer: () => navGuilds(-1),
      nextServer: () => navGuilds(1),
      markRead: () => {
        const ch = useUI.getState().currentChannelId;
        if (ch && !useUI.getState().modals.length) void ackChannel(ch);
      },
      pushToTalk: () => local().inputMode === 'ptt' && voice.setPtt(true),
      pttUp: () => voice.setPtt(false),
    };
  }, [nav]);
  useKeybinds(handlers);

  // última rota para reabrir no mesmo lugar
  useEffect(() => {
    if (loc.pathname.startsWith('/channels')) localStorage.setItem('vl:last-route', loc.pathname);
  }, [loc.pathname]);

  return null;
}

function AppShell() {
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <ConnectionBanner />
      <VerifyBanner />
      <div className="vl-stage flex min-h-0 flex-1">
        <ServerRail />
        <Routes>
          <Route path="/channels/@me" element={<><HomeSidebar /><FriendsView /></>} />
          <Route path="/channels/@me/:channelId" element={<DMRoute />} />
          <Route path="/channels/:guildId/:channelId?" element={<GuildRoute />} />
          <Route path="/discover" element={<><HomeSidebar /><DiscoverPage /></>} />
          <Route path="/invite/:code" element={<InviteRoute />} />
          <Route path="*" element={<Navigate to={localStorage.getItem('vl:last-route') ?? '/channels/@me'} replace />} />
        </Routes>
      </div>
      <IncomingCall />
      <GlobalEffects />
    </div>
  );
}

function NotFoundGuard() {
  return (
    <div className="grid h-full place-items-center text-fg">
      <div className="text-center">
        <div className="font-display text-2xl font-bold">Página não encontrada</div>
        <Button className="mt-4" onClick={() => (location.hash = '#/channels/@me')}>Voltar</Button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <NavigationBridge />
      <ThemeApplier />
      <MarkdownProvider>
      <Routes>
        <Route path="/login" element={api.token ? <Navigate to="/channels/@me" replace /> : <LoginPage />} />
        <Route path="/register" element={api.token ? <Navigate to="/channels/@me" replace /> : <RegisterPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route path="/reset" element={<ResetPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/404" element={<NotFoundGuard />} />
        <Route path="/*" element={<RequireAuth><AppShell /></RequireAuth>} />
      </Routes>
      <Overlays />
      </MarkdownProvider>
    </HashRouter>
  );
}
