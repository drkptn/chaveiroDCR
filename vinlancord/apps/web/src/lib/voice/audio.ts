/**
 * Grafo de áudio do Vinlancord (WebAudio):
 *
 *  microfone ─► ganho de entrada ─► analisador (VAD/medidor) ─► portão (VAD/PTT) ─► trilha enviada
 *  remoto[i] ─► ganho do usuário (0–200%) ─► ganho mestre ─► saída (dispositivo escolhido)
 *
 * O portão usa rampas curtas para não "estalar" e um tempo de retenção para não cortar o fim das frases.
 */

type SinkCtx = AudioContext & { setSinkId?: (id: string | { type: 'none' }) => Promise<void> };

export interface MicOptions {
  deviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export class AudioEngine {
  ctx: SinkCtx;
  private master: GainNode;
  private remotes = new Map<string, { el: HTMLAudioElement; src: MediaStreamAudioSourceNode; gain: GainNode; userId: string }>();
  private userVolumes = new Map<string, number>();
  private localMutes = new Set<string>();

  // microfone
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private inputGain: GainNode;
  private analyser: AnalyserNode;
  private gate: GainNode;
  private dest: MediaStreamAudioDestinationNode;
  private levelBuf: Float32Array<ArrayBuffer>;
  private gateOpen = false;
  private lastVoiceAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  mode: 'vad' | 'ptt' = 'vad';
  vadAuto = true;
  vadThresholdDb = -55;
  pttActive = false;
  pttReleaseDelay = 200;
  muted = false;
  private noiseFloor = -70;
  onLevel: (level: number, speaking: boolean) => void = () => {};

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 }) as SinkCtx;
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.inputGain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    this.levelBuf = new Float32Array(this.analyser.fftSize);
    this.gate = this.ctx.createGain();
    this.gate.gain.value = 0;
    this.dest = this.ctx.createMediaStreamDestination();
    this.inputGain.connect(this.analyser);
    this.inputGain.connect(this.gate);
    this.gate.connect(this.dest);
  }

  async resume() {
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  /** Trilha processada que é enviada para a chamada. */
  get outputTrack(): MediaStreamTrack {
    return this.dest.stream.getAudioTracks()[0]!;
  }

  async startMic(opts: MicOptions): Promise<void> {
    this.stopMic();
    const constraints: MediaTrackConstraints = {
      echoCancellation: opts.echoCancellation,
      noiseSuppression: opts.noiseSuppression,
      autoGainControl: opts.autoGainControl,
      channelCount: 1,
      sampleRate: 48000,
    };
    if (opts.deviceId && opts.deviceId !== 'default') constraints.deviceId = { exact: opts.deviceId };
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    } catch (e) {
      if (constraints.deviceId) {
        // dispositivo sumiu: volta para o padrão
        delete constraints.deviceId;
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      } else throw e;
    }
    this.micSource = this.ctx.createMediaStreamSource(this.micStream);
    this.micSource.connect(this.inputGain);
    this.startLoop();
  }

  stopMic() {
    this.micSource?.disconnect();
    this.micSource = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.setGate(false);
  }

  get hasMic() {
    return !!this.micStream;
  }

  setInputVolume(v: number) {
    this.inputGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setOutputVolume(v: number) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  async setOutputDevice(deviceId: string) {
    if (this.ctx.setSinkId) {
      await this.ctx.setSinkId(deviceId === 'default' ? '' : deviceId).catch((e) => console.warn('setSinkId', e));
    }
  }

  private setGate(open: boolean) {
    if (open === this.gateOpen) return;
    this.gateOpen = open;
    this.gate.gain.setTargetAtTime(open ? 1 : 0, this.ctx.currentTime, open ? 0.005 : 0.04);
  }

  private startLoop() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 30);
  }

  private tick() {
    if (!this.micSource) {
      this.onLevel(0, false);
      return;
    }
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) sum += this.levelBuf[i]! * this.levelBuf[i]!;
    const rms = Math.sqrt(sum / this.levelBuf.length);
    const db = 20 * Math.log10(rms + 1e-9);
    // estimativa adaptativa de ruído de fundo para o modo automático
    if (db < this.noiseFloor + 6) this.noiseFloor = this.noiseFloor * 0.98 + db * 0.02;
    else this.noiseFloor = this.noiseFloor * 0.999 + db * 0.001;
    const threshold = this.vadAuto ? Math.max(-60, Math.min(-30, this.noiseFloor + 14)) : this.vadThresholdDb;
    const now = performance.now();
    let open: boolean;
    if (this.muted) open = false;
    else if (this.mode === 'ptt') open = this.pttActive || now - this.lastVoiceAt < this.pttReleaseDelay;
    else {
      if (db > threshold) this.lastVoiceAt = now;
      open = now - this.lastVoiceAt < 320;
    }
    if (this.mode === 'ptt' && this.pttActive) this.lastVoiceAt = now;
    this.setGate(open);
    const level = Math.max(0, Math.min(1, (db + 70) / 60));
    this.onLevel(level, open && db > threshold - 6);
  }

  /** Nível atual (0–1) e limiar efetivo, para o medidor das configurações. */
  get thresholdLevel() {
    const t = this.vadAuto ? Math.max(-60, Math.min(-30, this.noiseFloor + 14)) : this.vadThresholdDb;
    return (t + 70) / 60;
  }

  addRemote(id: string, userId: string, track: MediaStreamTrack) {
    this.removeRemote(id);
    const stream = new MediaStream([track]);
    // Chromium só "puxa" áudio WebRTC para o WebAudio se houver um elemento de mídia ativo.
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    void el.play().catch(() => {});
    const src = this.ctx.createMediaStreamSource(stream);
    const gain = this.ctx.createGain();
    gain.gain.value = this.effectiveVolume(userId);
    src.connect(gain).connect(this.master);
    this.remotes.set(id, { el, src, gain, userId });
  }

  removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.src.disconnect();
    r.gain.disconnect();
    r.el.srcObject = null;
    this.remotes.delete(id);
  }

  private effectiveVolume(userId: string) {
    if (this.localMutes.has(userId)) return 0;
    return this.userVolumes.get(userId) ?? 1;
  }

  setUserVolume(userId: string, v: number) {
    this.userVolumes.set(userId, v);
    this.applyUser(userId);
  }

  setLocalMute(userId: string, muted: boolean) {
    if (muted) this.localMutes.add(userId);
    else this.localMutes.delete(userId);
    this.applyUser(userId);
  }

  private applyUser(userId: string) {
    for (const r of this.remotes.values()) if (r.userId === userId) r.gain.gain.setTargetAtTime(this.effectiveVolume(userId), this.ctx.currentTime, 0.02);
  }

  /** Nível do mic sem o portão, para o teste de microfone. */
  async destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopMic();
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    await this.ctx.close().catch(() => {});
  }
}
