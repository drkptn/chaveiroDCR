/**
 * Sons do Além-Mar sintetizados com WebAudio (sem arquivos externos).
 * Cada som é curto, suave e reconhecível.
 */
type SoundName = 'message' | 'mention' | 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'ring' | 'outgoing' | 'notify' | 'stream' | 'disconnect';

let ctx: AudioContext | null = null;
let volume = 0.6;
let sinkId = '';

function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    const c = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (sinkId && sinkId !== 'default' && c.setSinkId) void c.setSinkId(sinkId).catch(() => {});
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setSoundVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}

/** Define o dispositivo de saída; o contexto de áudio só é criado no primeiro som (evita aviso de autoplay). */
export async function setSoundOutput(deviceId: string) {
  sinkId = deviceId;
  const c = ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
  if (c?.setSinkId) await c.setSinkId(deviceId === 'default' ? '' : deviceId).catch(() => {});
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, endFreq?: number) {
  const c = ac();
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain * volume, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

const SOUNDS: Record<SoundName, () => void> = {
  message: () => {
    tone(880, 0, 0.12, 'sine', 0.14);
    tone(1320, 0.06, 0.16, 'sine', 0.1);
  },
  mention: () => {
    tone(988, 0, 0.12, 'triangle', 0.16);
    tone(1319, 0.08, 0.12, 'triangle', 0.14);
    tone(1760, 0.16, 0.22, 'sine', 0.1);
  },
  notify: () => tone(740, 0, 0.18, 'sine', 0.14, 1100),
  join: () => {
    tone(523, 0, 0.12, 'sine', 0.14);
    tone(784, 0.08, 0.18, 'sine', 0.14);
  },
  leave: () => {
    tone(784, 0, 0.12, 'sine', 0.14);
    tone(523, 0.08, 0.2, 'sine', 0.12);
  },
  mute: () => tone(600, 0, 0.09, 'triangle', 0.12, 380),
  unmute: () => tone(420, 0, 0.09, 'triangle', 0.12, 680),
  deafen: () => {
    tone(500, 0, 0.08, 'triangle', 0.12, 300);
    tone(400, 0.07, 0.1, 'triangle', 0.1, 220);
  },
  undeafen: () => {
    tone(300, 0, 0.08, 'triangle', 0.12, 500);
    tone(420, 0.07, 0.1, 'triangle', 0.1, 700);
  },
  ring: () => {
    for (let i = 0; i < 2; i++) {
      tone(660, i * 0.32, 0.14, 'sine', 0.16);
      tone(880, i * 0.32 + 0.12, 0.16, 'sine', 0.14);
    }
  },
  outgoing: () => {
    tone(440, 0, 0.35, 'sine', 0.1);
    tone(554, 0, 0.35, 'sine', 0.08);
  },
  stream: () => {
    tone(660, 0, 0.1, 'sine', 0.12);
    tone(990, 0.07, 0.1, 'sine', 0.12);
    tone(1320, 0.14, 0.14, 'sine', 0.1);
  },
  disconnect: () => tone(500, 0, 0.3, 'sawtooth', 0.06, 200),
};

export function playSound(name: SoundName) {
  try {
    SOUNDS[name]();
  } catch {
    /* áudio indisponível */
  }
}

/** Toque contínuo (chamada recebida/realizada). Retorna função para parar. */
export function loopSound(name: 'ring' | 'outgoing', everyMs = 2200) {
  playSound(name);
  const t = setInterval(() => playSound(name), everyMs);
  return () => clearInterval(t);
}

export { sinkId as currentSoundSink };
