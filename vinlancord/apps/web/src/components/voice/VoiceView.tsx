/** Interface de chamadas: grade dinâmica, destaque, transmissões de tela, controles e chamada recebida. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { MobileNavButton } from '../layout/MobileNav';
import { canShareScreen } from '../../lib/mobile';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Headphones,
  HeadphoneOff,
  Maximize2,
  Minimize2,
  Volume2,
  Users,
  Phone,
  PhoneIncoming,
  Eye,
  EyeOff,
  Signal,
  LayoutGrid,
  Focus,
  Video as VideoIcon,
} from 'lucide-react';
import { P, has, type Channel } from '@vinlancord/shared';
import { useShallow } from 'zustand/react/shallow';
import { useStore, displayName, S } from '../../store';
import { ui, useUI } from '../../store/ui';
import { voice, useVoice } from '../../lib/voice/engine';
import { gateway } from '../../lib/gateway';
import { useChannelPerms } from '../../lib/perms';
import { loopSound } from '../../lib/sounds';
import { Avatar, Button, IconButton, Tooltip, cx } from '../ui';
import { userMenu } from '../profile/userMenu';

/* ───────────── vídeo ───────────── */

function VideoEl({ stream, mirror, contain, userId, source }: { stream: MediaStream; mirror?: boolean; contain?: boolean; userId: string; source: 'camera' | 'screen' }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => {});
  }, [stream]);
  // camada adequada ao tamanho exibido (qualidade adaptativa)
  useEffect(() => {
    const el = ref.current!;
    if (userId === S().me?.id) return;
    const ro = new ResizeObserver(([e]) => voice.setPreferredLayer(userId, source, e!.contentRect.width * devicePixelRatio));
    ro.observe(el);
    return () => ro.disconnect();
  }, [userId, source]);
  return <video ref={ref} autoPlay playsInline muted className={cx('size-full', contain ? 'object-contain' : 'object-cover', mirror && '-scale-x-100')} />;
}

interface Tile {
  key: string;
  userId: string;
  kind: 'user' | 'screen';
}

function ParticipantTile({ tile, focused, onFocus, small }: { tile: Tile; focused: boolean; onFocus: () => void; small?: boolean }) {
  const { userId, kind } = tile;
  const meId = useStore((s) => s.me?.id);
  const isMe = userId === meId;
  const vs = useStore((s) => s.voiceStates[userId]);
  const speaking = useStore((s) => userId in s.speaking);
  const stats = useStore((s) => s.peerStats[userId]);
  const localSpeaking = useVoice((s) => s.localSpeaking);
  const video = useVoice((s) => s.videos[`${userId}:${kind === 'screen' ? 'screen' : 'camera'}`]);
  const watching = useVoice((s) => !!s.watching[userId]);
  const mirror = useVoice(() => isMe);
  const name = useStore(() => displayName(userId, vs?.guildId ?? null));
  const accent = useStore((s) => s.users[userId]?.accentColor);
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const f = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  const talking = (isMe ? localSpeaking && !vs?.selfMute : speaking) && kind === 'user';
  const toggleFull = () => (document.fullscreenElement ? void document.exitFullscreen() : void box.current?.requestFullscreen());

  return (
    <div
      ref={box}
      onDoubleClick={toggleFull}
      onClick={onFocus}
      onContextMenu={(e) => !isMe && userMenu(e, userId, vs?.guildId ?? null)}
      className={cx(
        'vl-cut group relative flex size-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-bg-1 transition-shadow duration-150 animate-pop-in',
        talking ? 'ring-[3px] ring-success shadow-[0_0_24px_-4px_var(--vl-success)]' : 'ring-1 ring-line-strong',
        focused && 'ring-accent',
      )}
      style={!video ? { background: `radial-gradient(circle at 50% 40%, color-mix(in oklab, ${accent ?? 'var(--vl-accent)'} 28%, var(--vl-bg-1)), var(--vl-bg-1) 70%)` } : undefined}
    >
      {video ? (
        <VideoEl stream={video} mirror={kind === 'user' && mirror} contain={kind === 'screen' || full} userId={userId} source={kind === 'screen' ? 'screen' : 'camera'} />
      ) : kind === 'screen' && !isMe ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <Avatar userId={userId} size={small ? 40 : 72} />
          <div className="text-sm text-fg-1">{name} está transmitindo a tela</div>
          {!watching && (
            <Button
              size="sm"
              icon={<Eye size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                void voice.watch(userId);
              }}
            >
              Assistir transmissão
            </Button>
          )}
        </div>
      ) : (
        <span className="relative">
          {talking && <span className="vl-sigil-ring" />}
          <Avatar userId={userId} size={small ? 48 : 96} speaking={talking} animate />
        </span>
      )}
      {/* rótulos */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[80%] items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-[13px] font-medium text-white backdrop-blur">
        {kind === 'screen' && <span className="rounded bg-danger px-1 text-[10px] font-bold">AO VIVO</span>}
        {kind === 'user' && (vs?.selfMute || vs?.serverMute) && <MicOff size={13} className={vs?.serverMute ? 'text-danger' : ''} />}
        {kind === 'user' && (vs?.selfDeaf || vs?.serverDeaf) && <HeadphoneOff size={13} />}
        <span className="truncate">{name}{isMe && kind === 'user' ? ' (você)' : ''}</span>
      </div>
      {stats && !isMe && kind === 'user' && (
        <Tooltip label={`Ping ${stats.rtt} ms • perda ${stats.loss}%`}>
          <span className={cx('absolute right-2 top-2 rounded-md bg-black/50 p-1 opacity-0 transition group-hover:opacity-100', stats.rtt > 300 || stats.loss > 8 ? 'text-danger' : stats.rtt > 120 ? 'text-warning' : 'text-success')}>
            <Signal size={13} />
          </span>
        </Tooltip>
      )}
      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
        {kind === 'screen' && watching && !isMe && (
          <Tooltip label="Parar de assistir">
            <button onClick={(e) => (e.stopPropagation(), void voice.stopWatching(userId))} className="grid size-8 place-items-center rounded-lg bg-black/60 text-white hover:bg-black/80">
              <EyeOff size={15} />
            </button>
          </Tooltip>
        )}
        <Tooltip label={full ? 'Sair da tela cheia' : 'Tela cheia'}>
          <button onClick={(e) => (e.stopPropagation(), toggleFull())} className="grid size-8 place-items-center rounded-lg bg-black/60 text-white hover:bg-black/80">
            {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/* ───────────── grade ───────────── */

function useTiles(channelId: string): Tile[] {
  const userIds = useStore(useShallow((s) => Object.values(s.voiceStates).filter((v) => v.channelId === channelId).map((v) => v.userId)));
  const streams = useStore(useShallow((s) => Object.values(s.voiceStates).filter((v) => v.channelId === channelId && v.selfStream).map((v) => v.userId)));
  return useMemo(() => {
    const tiles: Tile[] = streams.map((u) => ({ key: `${u}:screen`, userId: u, kind: 'screen' as const }));
    for (const u of userIds) tiles.push({ key: `${u}:user`, userId: u, kind: 'user' });
    return tiles;
  }, [userIds, streams]);
}

function Grid({ channelId, compact }: { channelId: string; compact?: boolean }) {
  const tiles = useTiles(channelId);
  const [focus, setFocus] = useState<string | null>(null);
  const [layout, setLayout] = useState<'grid' | 'focus'>('grid');
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 450 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(wrap.current!);
    return () => ro.disconnect();
  }, []);
  // transmissão nova ganha destaque automático
  const streamKey = tiles.find((t) => t.kind === 'screen')?.key;
  useEffect(() => {
    if (streamKey) {
      setFocus(streamKey);
      setLayout('focus');
    }
  }, [streamKey]);
  useEffect(() => {
    if (focus && !tiles.some((t) => t.key === focus)) {
      setFocus(null);
      setLayout('grid');
    }
  }, [tiles, focus]);
  useEffect(() => {
    voice.setVideoVisible(true);
    return () => voice.setVideoVisible(false);
  }, []);

  // calcula a melhor quantidade de colunas para tiles 16:9
  const best = useMemo(() => {
    const n = Math.max(1, tiles.length);
    let bestTile = { cols: 1, w: 0, h: 0 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const gap = 12;
      let w = (size.w - gap * (cols - 1)) / cols;
      let h = w * (9 / 16);
      if (h * rows + gap * (rows - 1) > size.h) {
        h = (size.h - gap * (rows - 1)) / rows;
        w = h * (16 / 9);
      }
      if (w > bestTile.w) bestTile = { cols, w, h };
    }
    return bestTile;
  }, [tiles.length, size]);

  const focused = layout === 'focus' ? tiles.find((t) => t.key === focus) : undefined;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {!compact && tiles.length > 1 && (
        <div className="absolute right-3 top-0 z-10 flex gap-1">
          <IconButton label="Grade" active={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid size={16} /></IconButton>
          <IconButton label="Destaque" active={layout === 'focus'} onClick={() => (setLayout('focus'), setFocus(focus ?? tiles[0]!.key))}><Focus size={16} /></IconButton>
        </div>
      )}
      <div ref={wrap} className="flex min-h-0 flex-1 items-center justify-center p-3">
        {focused ? (
          <div className="flex size-full flex-col gap-3">
            <div className="min-h-0 flex-1">
              <ParticipantTile tile={focused} focused onFocus={() => setLayout('grid')} />
            </div>
            <div className="scroll-thin flex h-28 shrink-0 justify-center gap-3 overflow-x-auto">
              {tiles
                .filter((t) => t.key !== focused.key)
                .map((t) => (
                  <div key={t.key} className="aspect-video h-full shrink-0">
                    <ParticipantTile tile={t} focused={false} onFocus={() => setFocus(t.key)} small />
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap content-center justify-center gap-3" style={{ width: best.cols * best.w + (best.cols - 1) * 12 }}>
            {tiles.map((t) => (
              <div key={t.key} style={{ width: best.w, height: best.h }}>
                <ParticipantTile
                  tile={t}
                  focused={false}
                  small={best.w < 300}
                  onFocus={() => {
                    if (tiles.length > 1) {
                      setFocus(t.key);
                      setLayout('focus');
                    }
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────── controles ───────────── */

export function CallControls() {
  const v = useVoice();
  const perms = useChannelPerms(v.channelId);
  const btn = 'grid size-12 place-items-center rounded-full transition-all hover:-translate-y-0.5 active:scale-95';
  return (
    <div className="mx-auto mb-4 flex w-fit items-center justify-center gap-3 rounded-full border border-line-strong bg-bg-1/70 px-4 py-2.5 shadow-[var(--vl-shadow)] backdrop-blur-xl animate-slide-up">
      <Tooltip label={v.camera ? 'Desligar câmera' : 'Ligar câmera'}>
        <button
          aria-label={v.camera ? 'Desligar câmera' : 'Ligar câmera'}
          disabled={!has(perms, P.VIDEO)}
          onClick={() => void voice.setCamera(!v.camera).catch((e) => ui.error(e, 'Câmera indisponível'))}
          className={cx(btn, v.camera ? 'bg-fg text-bg-0' : 'bg-bg-4 text-fg hover:bg-bg-5', 'disabled:opacity-40')}
        >
          {v.camera ? <Video size={22} /> : <VideoOff size={22} />}
        </button>
      </Tooltip>
      {(v.screen || canShareScreen()) && <Tooltip label={v.screen ? 'Parar compartilhamento' : 'Compartilhar tela'}>
        <button
          aria-label={v.screen ? 'Parar compartilhamento' : 'Compartilhar tela'}
          disabled={!has(perms, P.STREAM)}
          onClick={() => (v.screen ? void voice.stopScreen() : canShareScreen() ? ui.open({ type: 'screenShare' }) : ui.error('Compartilhar a tela ainda não funciona no celular.'))}
          className={cx(btn, v.screen ? 'bg-accent text-accent-fg' : 'bg-bg-4 text-fg hover:bg-bg-5', 'disabled:opacity-40')}
        >
          {v.screen ? <MonitorX size={22} /> : <MonitorUp size={22} />}
        </button>
      </Tooltip>}
      <Tooltip label={v.selfMute ? 'Ativar microfone' : 'Silenciar'}>
        <button aria-label={v.selfMute ? 'Ativar microfone' : 'Silenciar'} onClick={() => void voice.setMute(!v.selfMute)} className={cx(btn, v.selfMute ? 'bg-danger/20 text-danger' : 'bg-bg-4 text-fg hover:bg-bg-5')}>
          {v.selfMute ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
      </Tooltip>
      <Tooltip label={v.selfDeaf ? 'Ativar áudio' : 'Desativar áudio'}>
        <button aria-label={v.selfDeaf ? 'Ativar áudio' : 'Desativar áudio'} onClick={() => void voice.setDeaf(!v.selfDeaf)} className={cx(btn, v.selfDeaf ? 'bg-danger/20 text-danger' : 'bg-bg-4 text-fg hover:bg-bg-5')}>
          {v.selfDeaf ? <HeadphoneOff size={22} /> : <Headphones size={22} />}
        </button>
      </Tooltip>
      <Tooltip label="Desconectar">
        <button aria-label="Desconectar da chamada" onClick={() => void voice.leave()} className={cx(btn, 'w-16 bg-danger text-white hover:brightness-110')}>
          <PhoneOff size={22} />
        </button>
      </Tooltip>
    </div>
  );
}

/* ───────────── canal de voz/vídeo do servidor ───────────── */

export function VoiceView({ channel, joined }: { channel: Channel; joined: boolean }) {
  const status = useVoice((s) => s.status);
  const perms = useChannelPerms(channel.id);
  const count = useStore((s) => Object.values(s.voiceStates).filter((v) => v.channelId === channel.id).length);
  const Icon = channel.type === 'video' ? VideoIcon : Volume2;
  useEffect(() => {
    useUI.setState({ currentChannelId: channel.id, currentGuildId: channel.guildId, voiceViewOpen: true });
    return () => useUI.setState({ voiceViewOpen: false });
  }, [channel.id, channel.guildId]);
  // canal de vídeo: liga a câmera automaticamente ao entrar
  const autoCam = useRef(false);
  useEffect(() => {
    if (joined && status === 'connected' && channel.type === 'video' && !autoCam.current && has(perms, P.VIDEO)) {
      autoCam.current = true;
      void voice.setCamera(true).catch(() => {});
    }
    if (!joined) autoCam.current = false;
  }, [joined, status, channel.type, perms]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--vl-accent)_14%,transparent),transparent_60%)]">
      <header className="vl-header flex h-12 shrink-0 items-center gap-2 px-4">
        <MobileNavButton />
        <Icon size={20} className="text-accent" />
        <span className="font-heading text-[17px] text-fg">{channel.name}</span>
        <span className="ml-2 flex items-center gap-1 text-xs text-fg-2"><Users size={13} /> {count}{channel.userLimit ? `/${channel.userLimit}` : ''}</span>
      </header>
      {joined && status !== 'idle' ? (
        <>
          {status === 'connecting' && <div className="py-1 text-center text-xs text-warning">Conectando à chamada…</div>}
          {status === 'reconnecting' && <div className="py-1 text-center text-xs text-warning">Conexão instável, reconectando… sua chamada continua assim que voltar.</div>}
          <Grid channelId={channel.id} />
          <CallControls />
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <div className="flex -space-x-3">
            {Object.values(S().voiceStates)
              .filter((v) => v.channelId === channel.id)
              .slice(0, 6)
              .map((v) => (
                <Avatar key={v.userId} userId={v.userId} size={56} className="rounded-full ring-4 ring-bg-2" />
              ))}
          </div>
          <div>
            <h2 className="font-display text-4xl text-fg text-glow">{channel.name}</h2>
            <p className="mt-1 text-sm text-fg-2">{count ? `${count} pessoa${count > 1 ? 's' : ''} conversando agora.` : 'Ninguém por aqui ainda. Seja o primeiro!'}</p>
          </div>
          <Button size="lg" icon={channel.type === 'video' ? <Video size={18} /> : <Phone size={18} />} disabled={!has(perms, P.CONNECT)} onClick={() => void voice.join(channel.id).catch((e) => ui.error(e, 'Não foi possível entrar'))}>
            {has(perms, P.CONNECT) ? 'Entrar na chamada' : 'Sem permissão para entrar'}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ───────────── chamada em DM ───────────── */

export function CallStrip({ channel }: { channel: Channel }) {
  const call = useStore((s) => s.calls[channel.id]);
  const inVoice = useVoice((s) => s.channelId === channel.id);
  const participants = useStore(useShallow((s) => Object.values(s.voiceStates).filter((v) => v.channelId === channel.id).map((v) => v.userId)));
  const [expanded, setExpanded] = useState(true);
  if (!call && !inVoice) return null;
  return (
    <div className={cx('flex shrink-0 flex-col border-b border-line bg-bg-0/70 transition-all', expanded && inVoice ? 'h-[46vh] min-h-[280px]' : 'h-auto')}>
      {inVoice && expanded ? (
        <>
          <Grid channelId={channel.id} compact />
          <CallControls />
        </>
      ) : (
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="flex -space-x-2">
            {participants.map((u) => (
              <Avatar key={u} userId={u} size={40} className="ring-2 ring-bg-0" />
            ))}
          </div>
          <div className="flex-1 text-sm text-fg-1">
            {inVoice ? 'Você está na chamada' : participants.length ? `${participants.map((u) => displayName(u, null)).join(', ')} ${participants.length > 1 ? 'estão' : 'está'} em chamada` : 'Chamando…'}
          </div>
          {!inVoice ? (
            <Button variant="success" icon={<Phone size={16} />} onClick={() => void voice.join(channel.id).catch((e) => ui.error(e))}>
              Entrar
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setExpanded(true)}>Mostrar chamada</Button>
          )}
        </div>
      )}
      {inVoice && (
        <button onClick={() => setExpanded(!expanded)} className="mx-auto -mt-1 mb-1 h-1.5 w-12 rounded-full bg-line-strong hover:bg-fg-2" aria-label="Expandir/recolher chamada" />
      )}
    </div>
  );
}

/** Aviso de chamada recebida (toque) — aparece em qualquer tela. */
export function IncomingCall() {
  const meId = useStore((s) => s.me?.id);
  const myStatus = useStore((s) => s.me?.status);
  const ringing = useStore(useShallow((s) => Object.values(s.calls).filter((c) => meId && c.ringing.includes(meId))));
  const inVoice = useVoice((s) => s.channelId);
  const call = ringing.find((c) => c.channelId !== inVoice);
  const soundOn = useStore((s) => s.settings.notifications.callSound);
  useEffect(() => {
    if (!call || myStatus === 'dnd' || !soundOn) return;
    return loopSound('ring');
  }, [call?.channelId, myStatus, soundOn]);
  if (!call) return null;
  const caller = call.startedBy;
  const ch = S().channels[call.channelId];
  return (
    <div className="vl-dialog fixed left-1/2 top-12 z-[80] w-[320px] -translate-x-1/2 rounded-2xl border border-line-strong bg-bg-1/95 p-5 text-center backdrop-blur-xl">
      <div className="mx-auto w-fit rounded-full" style={{ animation: 'pulse-ring 1.4s infinite' }}>
        <Avatar userId={caller} size={80} animate />
      </div>
      <div className="mt-3 font-display text-lg font-bold text-fg">{displayName(caller, null)}</div>
      <div className="flex items-center justify-center gap-1.5 text-sm text-fg-2">
        <PhoneIncoming size={14} style={{ animation: 'ring-shake 1.2s infinite' }} /> {ch?.type === 'group_dm' ? `Chamada em ${ch.name || 'grupo'}` : 'Chamada recebida…'}
      </div>
      <div className="mt-5 flex justify-center gap-6">
        <Tooltip label="Recusar">
          <button aria-label="Recusar chamada" onClick={() => void gateway.rpc('call.decline', { channelId: call.channelId }).catch(() => {})} className="grid size-14 place-items-center rounded-full bg-danger text-white transition hover:brightness-110 active:scale-95">
            <PhoneOff size={24} />
          </button>
        </Tooltip>
        <Tooltip label="Atender">
          <button
            aria-label="Atender chamada"
            onClick={() => {
              void voice.join(call.channelId).catch((e) => ui.error(e));
              window.location.hash = `#/channels/@me/${call.channelId}`;
            }}
            className="grid size-14 place-items-center rounded-full bg-success text-white transition hover:brightness-110 active:scale-95"
          >
            <Phone size={24} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
