/**
 * Motor de voz/vídeo/tela do cliente (mediasoup-client).
 *
 * - Um transporte de envio e um de recebimento por chamada (SFU).
 * - Microfone passa pelo AudioEngine (ganho, VAD/PTT) antes de ser enviado.
 * - Câmera usa simulcast (3 camadas); tela usa camadas temporais (VP8/VP9) ou
 *   H.264 (aceleração por hardware) — cada espectador recebe a qualidade que aguenta.
 * - Reconexão: ICE restart automático, retomada após queda do WebSocket e
 *   reentrada completa como último recurso.
 */
import { Device } from 'mediasoup-client';
import type { types } from 'mediasoup-client';
import { create } from 'zustand';
import type { ConsumeResult, GatewayEvents, ProducerInfo, SourceType, TransportOptions } from '@vinlancord/shared';
import { gateway } from '../gateway';
import { AudioEngine } from './audio';
import { local, type ScreenCodec, type ScreenQuality } from '../../store/local';
import { S } from '../../store';
import { playSound } from '../sounds';
import { desktop } from '../desktop';

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface RemoteMedia {
  mic?: { producerId: string; consumerId?: string; paused: boolean };
  camera?: { producerId: string; consumerId?: string; paused: boolean };
  screen?: { producerId: string; consumerId?: string; paused: boolean };
  screenAudio?: { producerId: string; consumerId?: string };
}

export interface VoiceUI {
  status: VoiceStatus;
  channelId: string | null;
  guildId: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  camera: boolean;
  screen: boolean;
  screenHasAudio: boolean;
  ping: number | null;
  loss: number;
  quality: 'good' | 'ok' | 'bad' | null;
  micLevel: number;
  localSpeaking: boolean;
  remote: Record<string, RemoteMedia>;
  /** vídeos prontos para exibir: `${userId}:camera` | `${userId}:screen` (o próprio usuário usa o seu ID) */
  videos: Record<string, MediaStream>;
  watching: Record<string, boolean>;
  error: string | null;
  noMic: boolean;
  pttActive: boolean;
}

export const useVoice = create<VoiceUI>()(() => ({
  status: 'idle',
  channelId: null,
  guildId: null,
  selfMute: false,
  selfDeaf: false,
  camera: false,
  screen: false,
  screenHasAudio: false,
  ping: null,
  loss: 0,
  quality: null,
  micLevel: 0,
  localSpeaking: false,
  remote: {},
  videos: {},
  watching: {},
  error: null,
  noMic: false,
  pttActive: false,
}));

const setV = useVoice.setState;
const V = () => useVoice.getState();

const SCREEN_PRESETS: Record<ScreenQuality, { width: number; height: number; fps: number; bitrate: number }> = {
  '720p30': { width: 1280, height: 720, fps: 30, bitrate: 2_500_000 },
  '1080p30': { width: 1920, height: 1080, fps: 30, bitrate: 4_500_000 },
  '1080p60': { width: 1920, height: 1080, fps: 60, bitrate: 8_000_000 },
  '1440p60': { width: 2560, height: 1440, fps: 60, bitrate: 12_000_000 },
  source: { width: 3840, height: 2160, fps: 60, bitrate: 14_000_000 },
};

const CAMERA_PRESETS = {
  '480p': { width: 854, height: 480, maxBitrate: 900_000 },
  '720p': { width: 1280, height: 720, maxBitrate: 1_600_000 },
  '1080p': { width: 1920, height: 1080, maxBitrate: 2_800_000 },
} as const;

function uuid() {
  return crypto.randomUUID();
}

/** Logs de diagnóstico de voz: ative com localStorage.setItem('vl:debug-voice', '1'). */
const dbg = (...a: unknown[]) => {
  try {
    if (localStorage.getItem('vl:debug-voice')) console.info('[voz]', ...a);
  } catch {
    /* sem storage */
  }
};

class VoiceEngine {
  private device: Device | null = null;
  private send: types.Transport | null = null;
  private recv: types.Transport | null = null;
  private producers: Partial<Record<SourceType, types.Producer>> = {};
  private consumers = new Map<string, { consumer: types.Consumer; userId: string; source: SourceType }>();
  private known = new Map<string, ProducerInfo>();
  /** produtores com consumo em andamento (evita consumir duas vezes o mesmo) */
  private consuming = new Set<string>();
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private lastInbound = { lost: 0, received: 0 };
  private rejoining = false;
  private iceRestartTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private voiceSessionId = uuid();
  private joinSeq = 0;
  audio: AudioEngine | null = null;

  private ensureAudio() {
    if (!this.audio) {
      this.audio = new AudioEngine();
      const l = local();
      this.audio.mode = l.inputMode;
      this.audio.vadAuto = l.vadAuto;
      this.audio.vadThresholdDb = l.vadThreshold;
      this.audio.pttReleaseDelay = l.pttReleaseDelay;
      this.audio.setInputVolume(l.inputVolume);
      this.audio.setOutputVolume(l.outputVolume);
      for (const [u, v] of Object.entries(l.userVolumes)) this.audio.setUserVolume(u, v);
      for (const [u, m] of Object.entries(l.localMutes)) if (m) this.audio.setLocalMute(u, true);
      void this.audio.setOutputDevice(l.outputDeviceId);
      let lastSpeaking = false;
      let lastEmit = 0;
      this.audio.onLevel = (level, speaking) => {
        const now = performance.now();
        if (speaking !== lastSpeaking || now - lastEmit > 120) {
          lastSpeaking = speaking;
          lastEmit = now;
          setV({ micLevel: level, localSpeaking: speaking });
        }
      };
    }
    return this.audio;
  }

  get channelId() {
    return V().channelId;
  }

  /* ─────────────────────── entrar / sair ─────────────────────── */

  async join(channelId: string) {
    dbg('join', channelId, 'atual', V().channelId, V().status);
    const ch = S().channels[channelId];
    if (V().channelId === channelId && V().status === 'connected') return;
    if (V().channelId) await this.leave(true);
    const seq = ++this.joinSeq;
    const audio = this.ensureAudio();
    await audio.resume();
    this.voiceSessionId = uuid();
    setV({ status: 'connecting', channelId, guildId: ch?.guildId ?? null, error: null, remote: {}, videos: {}, watching: {}, camera: false, screen: false });
    try {
      await this.connect(channelId, seq);
      playSound('join');
    } catch (e) {
      if (seq !== this.joinSeq) return;
      this.teardown();
      setV({ status: 'failed', channelId: null, guildId: null, error: (e as Error).message });
      throw e;
    }
  }

  private async connect(channelId: string, seq: number) {
    const v = V();
    const res = await gateway.rpc('voice.join', { channelId, selfMute: v.selfMute, selfDeaf: v.selfDeaf, voiceSessionId: this.voiceSessionId });
    if (seq !== this.joinSeq) throw new Error('cancelado');
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: res.routerRtpCapabilities as types.RtpCapabilities });
    const [sendOpts, recvOpts] = await Promise.all([
      gateway.rpc('voice.createTransport', { direction: 'send' }),
      gateway.rpc('voice.createTransport', { direction: 'recv' }),
    ]);
    this.send = this.makeTransport('send', sendOpts);
    this.recv = this.makeTransport('recv', recvOpts);
    dbg('transportes', 'send', this.send.id, 'recv', this.recv.id, 'seq', seq);

    // microfone
    const audio = this.ensureAudio();
    try {
      const l = local();
      await audio.startMic({
        deviceId: l.inputDeviceId,
        echoCancellation: l.echoCancellation,
        noiseSuppression: l.noiseSuppression,
        autoGainControl: l.autoGainControl,
      });
      setV({ noMic: false });
    } catch {
      setV({ noMic: true, selfMute: true });
    }
    audio.muted = V().selfMute || V().selfDeaf;
    this.producers.mic = await this.send.produce({
      track: audio.outputTrack,
      codecOptions: { opusStereo: false, opusDtx: true, opusFec: true, opusMaxAverageBitrate: 96_000 },
      stopTracks: false,
      disableTrackOnPause: false,
      zeroRtpOnPause: true,
      appData: { source: 'mic' },
    });
    if (V().selfMute || V().selfDeaf) {
      this.producers.mic.pause();
      await gateway.rpc('voice.setProducerPaused', { producerId: this.producers.mic.id, paused: true }).catch(() => {});
    }

    for (const p of res.producers) this.registerProducer(p);
    setV({ status: 'connected' });
    // inclui produtores anunciados enquanto os transportes eram criados
    this.consumePending();
    this.startStats();
  }

  private makeTransport(direction: 'send' | 'recv', opts: TransportOptions) {
    const device = this.device!;
    const params = {
      id: opts.id,
      iceParameters: opts.iceParameters as types.IceParameters,
      iceCandidates: opts.iceCandidates as types.IceCandidate[],
      dtlsParameters: opts.dtlsParameters as types.DtlsParameters,
      iceServers: opts.iceServers as RTCIceServer[],
      iceTransportPolicy: (local().forceRelay ? 'relay' : 'all') as RTCIceTransportPolicy,
    };
    const t = direction === 'send' ? device.createSendTransport(params) : device.createRecvTransport(params);
    t.on('connect', ({ dtlsParameters }, cb, eb) => {
      gateway.rpc('voice.connectTransport', { transportId: t.id, dtlsParameters }).then(() => cb(), eb);
    });
    if (direction === 'send') {
      t.on('produce', ({ kind, rtpParameters, appData }, cb, eb) => {
        gateway
          .rpc('voice.produce', { transportId: t.id, kind, rtpParameters, source: (appData as { source: SourceType }).source })
          .then(({ producerId }) => cb({ id: producerId }), eb);
      });
    }
    t.on('connectionstatechange', (state) => this.onTransportState(t, state));
    return t;
  }

  private onTransportState(t: types.Transport, state: RTCPeerConnectionState) {
    dbg('estado do transporte', t.id, state);
    if (state === 'connected') {
      const timer = this.iceRestartTimers.get(t.id);
      if (timer) clearTimeout(timer);
      this.iceRestartTimers.delete(t.id);
      if (V().status === 'reconnecting') setV({ status: 'connected' });
      return;
    }
    if (state === 'disconnected' || state === 'failed') {
      if (V().status === 'connected') setV({ status: 'reconnecting' });
      // "disconnected" às vezes se recupera sozinho; espera um pouco antes de reiniciar o ICE
      const wait = state === 'failed' ? 0 : 2500;
      if (this.iceRestartTimers.has(t.id)) return;
      this.iceRestartTimers.set(
        t.id,
        setTimeout(() => {
          this.iceRestartTimers.delete(t.id);
          void this.restartIce(t);
        }, wait),
      );
    }
  }

  private async restartIce(t: types.Transport, attempt = 0) {
    if (t.closed || !V().channelId) return;
    if (t.connectionState === 'connected') return;
    try {
      const { iceParameters } = await gateway.rpc('voice.restartIce', { transportId: t.id });
      await t.restartIce({ iceParameters: iceParameters as types.IceParameters });
      setTimeout(() => {
        if (!t.closed && t.connectionState !== 'connected' && V().channelId) {
          if (attempt < 2) void this.restartIce(t, attempt + 1);
          else void this.rejoin();
        }
      }, 6000);
    } catch {
      setTimeout(() => (attempt < 4 ? void this.restartIce(t, attempt + 1) : void this.rejoin()), 2000 * (attempt + 1));
    }
  }

  /** Reentra na mesma sala do zero (último recurso de reconexão). */
  async rejoin() {
    dbg('rejoin', V().channelId);
    const channelId = V().channelId;
    if (!channelId || this.rejoining) return;
    this.rejoining = true;
    const hadCamera = V().camera;
    setV({ status: 'reconnecting' });
    try {
      this.teardown(true);
      this.voiceSessionId = uuid();
      const seq = ++this.joinSeq;
      await this.connect(channelId, seq);
      if (hadCamera) await this.setCamera(true).catch(() => {});
    } catch (e) {
      setV({ status: 'reconnecting', error: (e as Error).message });
      setTimeout(() => {
        this.rejoining = false;
        if (V().channelId === channelId) void this.rejoin();
      }, 3000);
      return;
    }
    this.rejoining = false;
  }

  /** Após o WebSocket reconectar (novo READY). */
  async onGatewayReady() {
    dbg('gateway pronto', V().channelId);
    if (!V().channelId) return;
    try {
      const r = await gateway.rpc('voice.resume', { voiceSessionId: this.voiceSessionId });
      if (!r.ok) await this.rejoin();
    } catch {
      await this.rejoin();
    }
  }

  async leave(silent = false) {
    dbg('leave', V().channelId);
    if (!V().channelId) return;
    this.joinSeq++;
    await gateway.rpc('voice.leave', {}).catch(() => {});
    this.teardown();
    setV({ status: 'idle', channelId: null, guildId: null, remote: {}, videos: {}, watching: {}, camera: false, screen: false, ping: null, quality: null, error: null });
    if (!silent) playSound('leave');
  }

  private teardown(keepState = false) {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    for (const t of this.iceRestartTimers.values()) clearTimeout(t);
    this.iceRestartTimers.clear();
    for (const { consumer } of this.consumers.values()) {
      this.audio?.removeRemote(consumer.id);
      consumer.close();
    }
    this.consumers.clear();
    this.known.clear();
    this.consuming.clear();
    for (const p of Object.values(this.producers)) p?.close();
    this.producers = {};
    this.send?.close();
    this.recv?.close();
    this.send = this.recv = null;
    this.device = null;
    this.audio?.stopMic();
    this.cameraStream?.getTracks().forEach((t) => t.stop());
    this.cameraStream = null;
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    if (keepState) setV({ remote: {}, videos: {}, camera: false, screen: false });
  }

  /* ─────────────────────── mudo / surdo / PTT ─────────────────────── */

  async setMute(mute: boolean) {
    const v = V();
    if (!mute && v.selfDeaf) {
      await this.setDeaf(false);
      return;
    }
    setV({ selfMute: mute });
    if (this.audio) this.audio.muted = mute || V().selfDeaf;
    playSound(mute ? 'mute' : 'unmute');
    await this.syncMicPause();
    if (V().channelId) await gateway.rpc('voice.updateState', { selfMute: mute }).catch(() => {});
  }

  async setDeaf(deaf: boolean) {
    setV({ selfDeaf: deaf, ...(deaf ? {} : { selfMute: V().selfMute }) });
    this.audio?.setOutputVolume(deaf ? 0 : local().outputVolume);
    if (this.audio) this.audio.muted = deaf || V().selfMute;
    playSound(deaf ? 'deafen' : 'undeafen');
    await this.syncMicPause();
    if (V().channelId) await gateway.rpc('voice.updateState', { selfDeaf: deaf, selfMute: V().selfMute }).catch(() => {});
  }

  private async syncMicPause() {
    const p = this.producers.mic;
    if (!p) return;
    const shouldPause = V().selfMute || V().selfDeaf;
    if (shouldPause === p.paused) return;
    if (shouldPause) p.pause();
    else p.resume();
    await gateway.rpc('voice.setProducerPaused', { producerId: p.id, paused: shouldPause }).catch(() => {});
  }

  setPtt(active: boolean) {
    if (!this.audio) return;
    this.audio.pttActive = active;
    setV({ pttActive: active });
  }

  applyLocalSettings() {
    const l = local();
    if (!this.audio) return;
    this.audio.mode = l.inputMode;
    this.audio.vadAuto = l.vadAuto;
    this.audio.vadThresholdDb = l.vadThreshold;
    this.audio.pttReleaseDelay = l.pttReleaseDelay;
    this.audio.setInputVolume(l.inputVolume);
    if (!V().selfDeaf) this.audio.setOutputVolume(l.outputVolume);
  }

  async setInputDevice(deviceId: string) {
    local().set({ inputDeviceId: deviceId });
    if (!V().channelId || !this.audio) return;
    const l = local();
    await this.audio.startMic({ deviceId, echoCancellation: l.echoCancellation, noiseSuppression: l.noiseSuppression, autoGainControl: l.autoGainControl });
    setV({ noMic: false });
  }

  async restartMicWithSettings() {
    if (!V().channelId || !this.audio) return;
    const l = local();
    await this.audio.startMic({ deviceId: l.inputDeviceId, echoCancellation: l.echoCancellation, noiseSuppression: l.noiseSuppression, autoGainControl: l.autoGainControl });
  }

  async setOutputDevice(deviceId: string) {
    local().set({ outputDeviceId: deviceId });
    await this.audio?.setOutputDevice(deviceId);
  }

  setUserVolume(userId: string, v: number) {
    local().set({ userVolumes: { ...local().userVolumes, [userId]: v } });
    this.audio?.setUserVolume(userId, v);
  }

  setLocalMute(userId: string, muted: boolean) {
    local().set({ localMutes: { ...local().localMutes, [userId]: muted } });
    this.audio?.setLocalMute(userId, muted);
  }

  /* ─────────────────────── câmera ─────────────────────── */

  async setCamera(on: boolean, deviceId?: string) {
    if (!this.send) throw new Error('Entre em uma chamada primeiro.');
    if (!on) {
      const p = this.producers.camera;
      if (p) {
        p.close();
        delete this.producers.camera;
        await gateway.rpc('voice.closeProducer', { producerId: p.id }).catch(() => {});
      }
      this.cameraStream?.getTracks().forEach((t) => t.stop());
      this.cameraStream = null;
      const me = S().me!.id;
      setV((s) => ({ camera: false, videos: omitKey(s.videos, `${me}:camera`) }));
      return;
    }
    const l = local();
    const preset = CAMERA_PRESETS[l.cameraQuality];
    const dev = deviceId ?? l.videoDeviceId;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(dev ? { deviceId: { ideal: dev } } : {}),
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    this.cameraStream?.getTracks().forEach((t) => t.stop());
    this.cameraStream = stream;
    const track = stream.getVideoTracks()[0]!;
    track.contentHint = 'motion';
    track.onended = () => void this.setCamera(false);
    if (this.producers.camera) {
      await this.producers.camera.replaceTrack({ track });
    } else {
      this.producers.camera = await this.send.produce({
        track,
        encodings: [
          { scaleResolutionDownBy: 4, maxBitrate: 150_000, maxFramerate: 15 },
          { scaleResolutionDownBy: 2, maxBitrate: 500_000, maxFramerate: 30 },
          { scaleResolutionDownBy: 1, maxBitrate: preset.maxBitrate, maxFramerate: 30 },
        ],
        codecOptions: { videoGoogleStartBitrate: 1000 },
        stopTracks: false,
        appData: { source: 'camera' },
      });
    }
    const me = S().me!.id;
    setV((s) => ({ camera: true, videos: { ...s.videos, [`${me}:camera`]: stream } }));
  }

  /* ─────────────────────── tela ─────────────────────── */

  /**
   * Inicia o compartilhamento. No desktop, `sourceId` vem do seletor próprio
   * (telas/janelas) e o áudio do sistema é capturado via loopback (Windows).
   */
  async startScreen(opts: { sourceId?: string; audio: boolean; quality: ScreenQuality; content: 'detail' | 'motion'; codec: ScreenCodec }) {
    if (!this.send) throw new Error('Entre em uma chamada primeiro.');
    const preset = SCREEN_PRESETS[opts.quality];
    if (desktop && opts.sourceId) await desktop.screen.select(opts.sourceId, opts.audio);
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { max: preset.width },
        height: { max: preset.height },
        frameRate: { ideal: preset.fps, max: preset.fps },
      },
      audio: opts.audio
        ? ({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            // evita capturar a voz dos outros participantes junto com o áudio do sistema
            restrictOwnAudio: true,
            suppressLocalAudioPlayback: false,
          } as MediaTrackConstraints)
        : false,
      ...({ systemAudio: opts.audio ? 'include' : 'exclude', selfBrowserSurface: 'exclude', surfaceSwitching: 'include' } as object),
    } as DisplayMediaStreamOptions);

    await this.stopScreen(true);
    this.screenStream = stream;
    const track = stream.getVideoTracks()[0]!;
    track.contentHint = opts.content === 'detail' ? 'detail' : 'motion';
    track.onended = () => void this.stopScreen();

    const caps = this.device!.rtpCapabilities.codecs ?? [];
    const pick = (mime: string) => caps.find((c) => c.mimeType.toLowerCase() === mime);
    let codec: types.RtpCodecCapability | undefined;
    if (opts.codec === 'h264' || opts.codec === 'auto') codec = pick('video/h264');
    if (opts.codec === 'vp9') codec = pick('video/vp9');
    if (!codec || opts.codec === 'vp8') codec = pick('video/vp8');
    const isH264 = codec?.mimeType.toLowerCase() === 'video/h264';
    this.producers.screen = await this.send.produce({
      track,
      codec,
      encodings: [
        {
          maxBitrate: preset.bitrate,
          maxFramerate: preset.fps,
          // camadas temporais: espectadores com pouca banda recebem menos quadros em vez de travar
          ...(isH264 ? {} : { scalabilityMode: 'L1T3' }),
        } as RTCRtpEncodingParameters,
      ],
      codecOptions: { videoGoogleStartBitrate: 2500 },
      stopTracks: false,
      appData: { source: 'screen' },
    });
    try {
      const sender = this.producers.screen.rtpSender;
      if (sender) {
        const params = sender.getParameters();
        (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
          opts.content === 'detail' ? 'maintain-resolution' : 'maintain-framerate';
        await sender.setParameters(params);
      }
    } catch {
      /* nem todo navegador permite */
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      this.producers['screen-audio'] = await this.send.produce({
        track: audioTrack,
        codecOptions: { opusStereo: true, opusDtx: false, opusFec: true, opusMaxAverageBitrate: 128_000 },
        stopTracks: false,
        appData: { source: 'screen-audio' },
      });
    }
    const me = S().me!.id;
    setV((s) => ({ screen: true, screenHasAudio: !!audioTrack, videos: { ...s.videos, [`${me}:screen`]: stream } }));
    playSound('stream');
  }

  async stopScreen(silent = false) {
    for (const src of ['screen', 'screen-audio'] as const) {
      const p = this.producers[src];
      if (p) {
        p.close();
        delete this.producers[src];
        await gateway.rpc('voice.closeProducer', { producerId: p.id }).catch(() => {});
      }
    }
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    const me = S().me?.id;
    if (V().screen && !silent) playSound('leave');
    setV((s) => ({ screen: false, screenHasAudio: false, videos: me ? omitKey(s.videos, `${me}:screen`) : s.videos }));
  }

  /* ─────────────────────── consumo ─────────────────────── */

  private updateRemote(userId: string, fn: (r: RemoteMedia) => RemoteMedia) {
    setV((s) => ({ remote: { ...s.remote, [userId]: fn(s.remote[userId] ?? {}) } }));
  }

  private sourceKey(source: SourceType): keyof RemoteMedia {
    return source === 'screen-audio' ? 'screenAudio' : source;
  }

  private registerProducer(p: ProducerInfo) {
    if (p.userId === S().me?.id) return false;
    this.known.set(p.producerId, p);
    const key = this.sourceKey(p.source);
    this.updateRemote(p.userId, (r) => ({ ...r, [key]: { producerId: p.producerId, paused: p.paused } }));
    return true;
  }

  private maybeConsume(p: ProducerInfo) {
    const isScreen = p.source === 'screen' || p.source === 'screen-audio';
    if (!isScreen) void this.consume(p);
    else if (V().watching[p.userId] || this.shouldAutoWatch()) {
      if (p.source === 'screen') setV((s) => ({ watching: { ...s.watching, [p.userId]: true } }));
      void this.consume(p);
    }
  }

  /** Consome tudo o que já é conhecido e ainda não tem consumidor. */
  private consumePending() {
    if (!this.recv || !this.device) return;
    for (const p of [...this.known.values()]) this.maybeConsume(p);
  }

  onProducer(p: ProducerInfo) {
    if (!this.registerProducer(p)) return;
    // se os transportes ainda não existem, consumePending() cuida disso ao final da conexão
    if (this.recv && this.device) this.maybeConsume(p);
  }

  private shouldAutoWatch() {
    const ch = V().channelId ? S().channels[V().channelId!] : null;
    // em DMs a transmissão abre automaticamente (opcional nas configurações)
    return !!ch && !ch.guildId && local().autoWatchStreams;
  }

  private async consume(p: ProducerInfo) {
    if (!this.recv || !this.device) return;
    if (this.consuming.has(p.producerId)) return;
    for (const c of this.consumers.values()) if (c.consumer.producerId === p.producerId) return;
    this.consuming.add(p.producerId);
    try {
      await this.doConsume(p);
    } finally {
      this.consuming.delete(p.producerId);
    }
  }

  private async doConsume(p: ProducerInfo) {
    let res: ConsumeResult;
    const recv = this.recv!;
    try {
      res = await gateway.rpc('voice.consume', { producerId: p.producerId, rtpCapabilities: this.device!.rtpCapabilities as unknown as Record<string, unknown> });
    } catch (e) {
      console.error('[voz] falha ao consumir', (e as Error).message);
      return;
    }
    // transporte trocado no meio do caminho (reconexão): o novo fluxo consome de novo
    if (!this.recv || this.recv !== recv || !this.known.has(p.producerId)) {
      void gateway.rpc('voice.closeConsumer', { consumerId: res.id }).catch(() => {});
      return;
    }
    dbg('consumindo', res.source, 'de', res.userId, 'no recv', this.recv.id);
    const consumer = await this.recv.consume({
      id: res.id,
      producerId: res.producerId,
      kind: res.kind,
      rtpParameters: res.rtpParameters as types.RtpParameters,
      appData: { userId: res.userId, source: res.source },
    });
    this.consumers.set(consumer.id, { consumer, userId: res.userId, source: res.source });
    const key = this.sourceKey(res.source);
    this.updateRemote(res.userId, (r) => ({ ...r, [key]: { ...(r[key] as object), producerId: res.producerId, consumerId: consumer.id, paused: res.producerPaused } }));
    if (res.kind === 'audio') {
      this.audio?.addRemote(consumer.id, res.userId, consumer.track);
    } else {
      const stream = new MediaStream([consumer.track]);
      setV((s) => ({ videos: { ...s.videos, [`${res.userId}:${res.source}`]: stream } }));
    }
    await gateway.rpc('voice.resumeConsumer', { consumerId: consumer.id }).catch(() => {});
  }

  private dropConsumer(consumerId: string) {
    const c = this.consumers.get(consumerId);
    if (!c) return;
    this.consumers.delete(consumerId);
    this.audio?.removeRemote(consumerId);
    c.consumer.close();
    if (c.consumer.kind === 'video') setV((s) => ({ videos: omitKey(s.videos, `${c.userId}:${c.source}`) }));
  }

  async watch(userId: string) {
    setV((s) => ({ watching: { ...s.watching, [userId]: true } }));
    for (const p of this.known.values()) if (p.userId === userId && (p.source === 'screen' || p.source === 'screen-audio')) await this.consume(p);
  }

  async stopWatching(userId: string) {
    setV((s) => ({ watching: { ...s.watching, [userId]: false } }));
    for (const [id, c] of this.consumers) {
      if (c.userId === userId && (c.source === 'screen' || c.source === 'screen-audio')) {
        this.dropConsumer(id);
        await gateway.rpc('voice.closeConsumer', { consumerId: id }).catch(() => {});
      }
    }
    this.updateRemote(userId, (r) => ({
      ...r,
      screen: r.screen ? { ...r.screen, consumerId: undefined } : undefined,
      screenAudio: r.screenAudio ? { ...r.screenAudio, consumerId: undefined } : undefined,
    }));
  }

  /** Escolhe a camada (resolução) conforme o tamanho em que o vídeo aparece. */
  setPreferredLayer(userId: string, source: 'camera' | 'screen', widthPx: number) {
    for (const [id, c] of this.consumers) {
      if (c.userId !== userId || c.source !== source) continue;
      const layer = source === 'screen' ? 0 : widthPx < 260 ? 0 : widthPx < 640 ? 1 : 2;
      if ((c.consumer.appData as { layer?: number }).layer === layer) return;
      (c.consumer.appData as { layer?: number }).layer = layer;
      void gateway.rpc('voice.setConsumerLayers', { consumerId: id, spatialLayer: layer }).catch(() => {});
    }
  }

  /** Pausa vídeos quando a tela da chamada não está visível (economiza banda e CPU). */
  setVideoVisible(visible: boolean) {
    for (const [id, c] of this.consumers) {
      if (c.source !== 'camera') continue;
      if (visible && c.consumer.paused) {
        c.consumer.resume();
        void gateway.rpc('voice.resumeConsumer', { consumerId: id }).catch(() => {});
      } else if (!visible && !c.consumer.paused) {
        c.consumer.pause();
        void gateway.rpc('voice.pauseConsumer', { consumerId: id }).catch(() => {});
      }
    }
  }

  /* ─────────────────────── eventos do servidor ─────────────────────── */

  handleEvent<E extends keyof GatewayEvents>(t: E, d: GatewayEvents[E]) {
    switch (t) {
      case 'VOICE_PRODUCER_NEW': {
        const p = d as GatewayEvents['VOICE_PRODUCER_NEW'];
        if (p.channelId === V().channelId) {
          this.onProducer(p);
          if (p.source === 'screen') playSound('stream');
        }
        break;
      }
      case 'VOICE_PRODUCER_CLOSED': {
        const p = d as GatewayEvents['VOICE_PRODUCER_CLOSED'];
        this.known.delete(p.producerId);
        for (const [id, c] of this.consumers) if (c.consumer.producerId === p.producerId) this.dropConsumer(id);
        const key = this.sourceKey(p.source);
        this.updateRemote(p.userId, (r) => ({ ...r, [key]: undefined }));
        if (p.source === 'screen') setV((s) => ({ watching: omitKey(s.watching, p.userId) }));
        break;
      }
      case 'VOICE_PRODUCER_PAUSED': {
        const p = d as GatewayEvents['VOICE_PRODUCER_PAUSED'];
        const info = this.known.get(p.producerId);
        if (!info) break;
        info.paused = p.paused;
        const key = this.sourceKey(info.source);
        this.updateRemote(p.userId, (r) => (r[key] ? { ...r, [key]: { ...(r[key] as object), paused: p.paused } } : r));
        break;
      }
      case 'VOICE_CONSUMER_CLOSED':
        this.dropConsumer((d as GatewayEvents['VOICE_CONSUMER_CLOSED']).consumerId);
        break;
      case 'VOICE_DISCONNECTED': {
        const e = d as GatewayEvents['VOICE_DISCONNECTED'];
        if (e.channelId !== V().channelId) break;
        if (e.reason === 'lost') {
          void this.rejoin();
          break;
        }
        this.joinSeq++;
        this.teardown();
        setV({ status: 'idle', channelId: null, guildId: null, remote: {}, videos: {}, watching: {}, camera: false, screen: false, error: null });
        playSound('disconnect');
        const msg =
          e.reason === 'kicked'
            ? 'Você foi desconectado da chamada por um moderador.'
            : e.reason === 'replaced'
              ? 'Você entrou na chamada em outro dispositivo.'
              : 'O canal de voz foi removido.';
        window.dispatchEvent(new CustomEvent('vl:voice-notice', { detail: msg }));
        break;
      }
      case 'VOICE_MOVED': {
        const e = d as GatewayEvents['VOICE_MOVED'];
        void this.join(e.to);
        break;
      }
    }
  }

  /* ─────────────────────── estatísticas ─────────────────────── */

  private startStats() {
    if (this.statsTimer) clearInterval(this.statsTimer);
    let n = 0;
    this.statsTimer = setInterval(async () => {
      if (!this.send || !this.recv) return;
      let rtt: number | null = null;
      try {
        const stats = await this.send.getStats();
        stats.forEach((r: any) => {
          if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && typeof r.currentRoundTripTime === 'number')
            rtt = Math.round(r.currentRoundTripTime * 1000);
        });
        let lost = 0;
        let received = 0;
        const rs = await this.recv.getStats();
        rs.forEach((r: any) => {
          if (r.type === 'inbound-rtp') {
            lost += r.packetsLost ?? 0;
            received += r.packetsReceived ?? 0;
          }
        });
        const dl = Math.max(0, lost - this.lastInbound.lost);
        const dr = Math.max(0, received - this.lastInbound.received);
        this.lastInbound = { lost, received };
        const loss = dl + dr > 0 ? (dl / (dl + dr)) * 100 : 0;
        const quality = rtt === null ? null : rtt < 120 && loss < 2 ? 'good' : rtt < 300 && loss < 8 ? 'ok' : 'bad';
        setV({ ping: rtt, loss, quality });
        if (++n % 2 === 0 && rtt !== null) void gateway.rpc('voice.stats', { rtt, loss }).catch(() => {});
      } catch {
        /* transporte fechando */
      }
    }, 3000);
  }

  debugInfo() {
    return {
      status: V().status,
      channelId: V().channelId,
      known: [...this.known.values()],
      consumers: [...this.consumers.values()].map((c) => ({ id: c.consumer.id, userId: c.userId, source: c.source, paused: c.consumer.paused, closed: c.consumer.closed })),
      producers: Object.fromEntries(Object.entries(this.producers).map(([k, p]) => [k, { id: p!.id, paused: p!.paused, closed: p!.closed }])),
      sendState: this.send?.connectionState,
      recvState: this.recv?.connectionState,
    };
  }

  async debugStats() {
    const out: Record<string, unknown> = {};
    if (this.send) out.send = [...(await this.send.getStats()).values()];
    if (this.recv) out.recv = [...(await this.recv.getStats()).values()];
    return out;
  }
}

function omitKey<T>(rec: Record<string, T>, key: string) {
  if (!(key in rec)) return rec;
  const { [key]: _, ...rest } = rec;
  return rest;
}

export const voice = new VoiceEngine();
// útil para diagnóstico e para os testes ponta a ponta
(window as unknown as { __vlVoice?: VoiceEngine }).__vlVoice = voice;
