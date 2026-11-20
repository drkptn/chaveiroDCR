/**
 * Motor de partículas do fundo (canvas 2D). Cada efeito é desenhado à mão com
 * formas próprias — penas, gotas de tinta, brasas, cinzas, sigilos geométricos,
 * neve, chuva, pétalas, estrelas e a maré (ondas + luzes do mar). Limita o FPS e pausa com a janela oculta.
 */
import type { AmbientEffect } from '@vinlancord/shared';
import { isLowPower } from './perf';

export interface Palette {
  accent: string;
  accent2: string;
  text: string;
  dim: string;
  dark: boolean;
}

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  seed: number;
  kind: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function hexA(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

/** Densidade base por efeito (partículas em 1920×1080 com intensidade 1). */
const DENSITY: Record<Exclude<AmbientEffect, 'none'>, number> = {
  feathers: 16,
  ink: 7,
  embers: 70,
  ash: 60,
  sigils: 4,
  snow: 110,
  rain: 140,
  petals: 26,
  stars: 160,
  tide: 46,
};

const FPS: Record<Exclude<AmbientEffect, 'none'>, number> = {
  feathers: 40,
  ink: 30,
  embers: 45,
  ash: 30,
  sigils: 30,
  snow: 40,
  rain: 50,
  petals: 40,
  stars: 24,
  tide: 30,
};

export class ParticleField {
  private ctx: CanvasRenderingContext2D;
  private ps: P[] = [];
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private running = false;
  private focused = true;
  private shooting: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
  private low = isLowPower();

  constructor(
    private canvas: HTMLCanvasElement,
    private effect: Exclude<AmbientEffect, 'none'>,
    private intensity: number,
    private pal: Palette,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.resize();
  }

  private target() {
    const area = (this.w * this.h) / (1920 * 1080);
    return Math.round(DENSITY[this.effect] * this.intensity * Math.max(0.35, Math.min(1.6, area)) * (this.low ? 0.45 : 1));
  }

  resize() {
    this.dpr = this.low ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const n = this.target();
    while (this.ps.length < n) this.ps.push(this.spawn(true));
    this.ps.length = Math.min(this.ps.length, n);
  }

  setPalette(p: Palette) {
    this.pal = p;
  }

  setFocused(f: boolean) {
    this.focused = f;
  }

  /** Modo leve: menos partículas, menor resolução e FPS limitado. */
  setLowPower(low: boolean) {
    if (low === this.low) return;
    this.low = low;
    this.resize();
  }

  private spawn(initial = false): P {
    const { w, h } = this;
    const p: P = { x: rand(0, w), y: rand(0, h), vx: 0, vy: 0, r: 1, a: 1, rot: rand(0, TAU), vr: 0, life: 0, max: Infinity, seed: Math.random() * 1000, kind: Math.random() };
    switch (this.effect) {
      case 'feathers':
        p.y = initial ? rand(-h, h) : rand(-120, -40);
        p.vy = rand(14, 30);
        p.vx = rand(-6, 6);
        p.r = rand(16, 38);
        p.vr = rand(-0.4, 0.4);
        p.a = rand(0.25, 0.6);
        break;
      case 'ink':
        p.max = rand(7, 13);
        p.life = initial ? rand(0, p.max) : 0;
        p.r = rand(40, 150);
        p.a = rand(0.05, 0.12);
        break;
      case 'embers':
        p.y = initial ? rand(0, h) : h + rand(5, 40);
        p.vy = -rand(18, 60);
        p.vx = rand(-8, 8);
        p.r = rand(0.8, 2.6);
        p.a = rand(0.4, 1);
        break;
      case 'ash':
        p.y = initial ? rand(0, h) : -10;
        p.vy = rand(8, 22);
        p.vx = rand(-10, 4);
        p.r = rand(1, 3.2);
        p.vr = rand(-2, 2);
        p.a = rand(0.15, 0.45);
        break;
      case 'sigils':
        p.max = rand(14, 24);
        p.life = initial ? rand(0, p.max) : 0;
        p.r = rand(70, 210);
        p.vr = rand(-0.08, 0.08) || 0.03;
        p.a = rand(0.05, 0.13);
        p.kind = Math.floor(rand(0, 4));
        break;
      case 'snow':
        p.y = initial ? rand(0, h) : -8;
        p.vy = rand(14, 40);
        p.r = rand(0.8, 2.8);
        p.a = rand(0.3, 0.85);
        break;
      case 'rain':
        p.y = initial ? rand(0, h) : rand(-200, -10);
        p.vy = rand(700, 1100);
        p.vx = -p.vy * 0.18;
        p.r = rand(10, 26);
        p.a = rand(0.08, 0.25);
        break;
      case 'petals':
        p.y = initial ? rand(-h, h) : rand(-60, -20);
        p.vy = rand(18, 40);
        p.vx = rand(-10, 18);
        p.r = rand(5, 10);
        p.vr = rand(-1.6, 1.6);
        p.a = rand(0.45, 0.85);
        break;
      case 'stars':
        p.r = rand(0.4, 1.6);
        p.a = rand(0.2, 0.9);
        p.vr = rand(0.5, 2.2);
        break;
      case 'tide':
        // luzes do mar: sobem devagar da metade de baixo e somem
        p.y = rand(h * 0.5, h);
        p.vy = -rand(4, 16);
        p.vx = rand(-7, 7);
        p.r = rand(0.6, 2.2);
        p.a = rand(0.25, 0.75);
        p.max = rand(6, 14);
        p.life = initial ? rand(0, p.max) : 0;
        break;
    }
    return p;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (document.hidden) {
        this.last = t;
        return;
      }
      const fps = !this.focused ? 15 : this.low ? Math.min(24, FPS[this.effect]) : FPS[this.effect];
      if (t - this.last < 1000 / fps - 2) return;
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.frame(dt, t / 1000);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  private frame(dt: number, time: number) {
    const { ctx, w, h, pal } = this;
    ctx.clearRect(0, 0, w, h);
    if (this.effect === 'tide') this.waves(time);
    ctx.globalCompositeOperation = this.effect === 'embers' || ((this.effect === 'stars' || this.effect === 'tide') && pal.dark) ? 'lighter' : 'source-over';
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i]!;
      p.life += dt;
      p.rot += p.vr * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      let dead = false;
      switch (this.effect) {
        case 'feathers':
          p.x += Math.sin(time * 0.8 + p.seed) * 22 * dt;
          p.rot = Math.sin(time * 0.6 + p.seed) * 0.9 + p.seed;
          this.feather(p);
          dead = p.y > h + 80;
          break;
        case 'ink':
          this.ink(p);
          dead = p.life > p.max;
          break;
        case 'embers':
          p.x += Math.sin(time * 2 + p.seed) * 14 * dt;
          this.ember(p, time);
          dead = p.y < -20;
          break;
        case 'ash':
          p.x += Math.sin(time + p.seed) * 10 * dt;
          ctx.fillStyle = hexA(pal.dim, p.a);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
          ctx.restore();
          dead = p.y > h + 10;
          break;
        case 'sigils':
          this.sigil(p);
          dead = p.life > p.max;
          break;
        case 'snow':
          p.x += Math.sin(time * 0.9 + p.seed) * 16 * dt;
          ctx.fillStyle = hexA(pal.dark ? '#ffffff' : pal.dim, p.a);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fill();
          dead = p.y > h + 10;
          break;
        case 'rain': {
          ctx.strokeStyle = hexA(pal.accent2, p.a);
          ctx.lineWidth = 1;
          ctx.beginPath();
          const k = p.r / p.vy;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k);
          ctx.stroke();
          dead = p.y > h + 30;
          break;
        }
        case 'petals':
          p.x += Math.sin(time * 1.3 + p.seed) * 30 * dt;
          this.petal(p);
          dead = p.y > h + 30 || p.x > w + 40;
          break;
        case 'tide': {
          p.x += Math.sin(time * 0.7 + p.seed) * 6 * dt;
          const fade = Math.sin(Math.PI * Math.min(1, p.life / p.max));
          const c = pal.dark ? pal.accent2 : pal.accent;
          ctx.fillStyle = hexA(c, p.a * fade * 0.18);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 4, 0, TAU);
          ctx.fill();
          ctx.fillStyle = hexA(c, p.a * fade);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fill();
          dead = p.life > p.max || p.y < h * 0.25;
          break;
        }
        case 'stars': {
          const tw = 0.5 + 0.5 * Math.sin(time * p.vr + p.seed);
          ctx.fillStyle = hexA(pal.dark ? '#ffffff' : pal.dim, p.a * (0.35 + tw * 0.65));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fill();
          break;
        }
      }
      if (dead) this.ps[i] = this.spawn();
    }
    if (this.effect === 'stars') this.shootingStar(dt);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Três camadas de onda no pé da tela, cada uma no seu ritmo, com a crista iluminada. */
  private waves(time: number) {
    const { ctx, w, h, pal } = this;
    const k = Math.min(1.4, this.intensity);
    const layers = [
      { base: 0.83, amp: 16, len: 620, speed: 0.22, fill: 0.05, crest: 0.16 },
      { base: 0.9, amp: 13, len: 460, speed: -0.3, fill: 0.07, crest: 0.2 },
      { base: 0.96, amp: 10, len: 340, speed: 0.4, fill: 0.1, crest: 0.24 },
    ];
    const step = this.low ? 24 : 14;
    for (const [i, L] of layers.entries()) {
      const y0 = h * L.base;
      const yAt = (x: number) =>
        y0 + Math.sin((x / L.len) * TAU + time * L.speed + i * 1.7) * L.amp + Math.sin((x / (L.len * 0.43)) * TAU - time * L.speed * 1.6 + i) * L.amp * 0.35;
      ctx.beginPath();
      ctx.moveTo(0, yAt(0));
      for (let x = step; x <= w + step; x += step) ctx.lineTo(x, yAt(x));
      ctx.strokeStyle = hexA(pal.dark ? pal.accent2 : pal.accent, L.crest * k);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.lineTo(w + step, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, y0 - L.amp, 0, h);
      g.addColorStop(0, hexA(pal.accent, L.fill * k));
      g.addColorStop(1, hexA(pal.dark ? '#000814' : pal.accent, L.fill * k * 1.6));
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  private feather(p: P) {
    const { ctx, pal } = this;
    const len = p.r;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.a;
    // palheta (vexilo) em duas metades levemente assimétricas
    const body = pal.dark ? '#0b0b0d' : '#1a1410';
    const edge = pal.dark ? pal.dim : pal.text;
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.bezierCurveTo(len * 0.34, -len * 0.55, len * 0.3, len * 0.35, 0, len * 0.62);
    ctx.bezierCurveTo(-len * 0.24, len * 0.3, -len * 0.3, -len * 0.5, 0, -len);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = hexA(edge, 0.55);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // barbas
    ctx.strokeStyle = hexA(edge, 0.28);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = -0.8; i < 0.55; i += 0.16) {
      const y = len * i;
      const span = Math.cos(i * 1.2) * len * 0.27;
      ctx.moveTo(0, y);
      ctx.lineTo(span, y - len * 0.12);
      ctx.moveTo(0, y);
      ctx.lineTo(-span * 0.85, y - len * 0.1);
    }
    ctx.stroke();
    // raque (haste)
    ctx.strokeStyle = hexA(edge, 0.8);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -len * 0.95);
    ctx.quadraticCurveTo(len * 0.04, 0, 0, len);
    ctx.stroke();
    ctx.restore();
  }

  private ink(p: P) {
    const { ctx, pal } = this;
    const t = p.life / p.max;
    const grow = 1 - Math.pow(1 - Math.min(1, t * 1.6), 3);
    const fade = t < 0.15 ? t / 0.15 : t > 0.6 ? Math.max(0, 1 - (t - 0.6) / 0.4) : 1;
    const color = pal.dark ? pal.accent : '#140d08';
    const r = p.r * grow;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const ang = (i / n) * TAU;
      const wob = 1 + 0.18 * Math.sin(ang * 3 + p.seed) + 0.1 * Math.sin(ang * 7 + p.seed * 2);
      const x = Math.cos(ang) * r * wob;
      const y = Math.sin(ang) * r * wob;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.15);
    g.addColorStop(0, hexA(color, p.a * fade));
    g.addColorStop(0.7, hexA(color, p.a * fade * 0.6));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  private ember(p: P, time: number) {
    const { ctx, pal } = this;
    const flick = 0.6 + 0.4 * Math.sin(time * 9 + p.seed * 3);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
    g.addColorStop(0, hexA('#ffe2a8', p.a * flick));
    g.addColorStop(0.25, hexA(pal.accent, p.a * flick * 0.8));
    g.addColorStop(1, hexA(pal.accent, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 5, 0, TAU);
    ctx.fill();
  }

  /** Sigilos geométricos originais: anéis, polígonos inscritos e marcações. */
  private sigil(p: P) {
    const { ctx, pal } = this;
    const t = p.life / p.max;
    const fade = Math.sin(Math.PI * Math.min(1, t));
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.strokeStyle = hexA(p.seed > 500 ? pal.accent : pal.accent2, p.a * fade);
    ctx.lineWidth = 1;
    const R = p.r;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.moveTo(R * 0.86, 0);
    ctx.arc(0, 0, R * 0.86, 0, TAU);
    ctx.stroke();
    // marcações no anel
    ctx.beginPath();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      const l = i % 3 === 0 ? 0.08 : 0.04;
      ctx.moveTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86);
      ctx.lineTo(Math.cos(a) * R * (0.86 + l), Math.sin(a) * R * (0.86 + l));
    }
    ctx.stroke();
    // polígono inscrito (varia por sigilo)
    const sides = [3, 4, 5, 6][p.kind % 4]!;
    const poly = (r: number, off: number) => {
      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = off + (i / sides) * TAU;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    poly(R * 0.82, -Math.PI / 2);
    poly(R * 0.82, -Math.PI / 2 + Math.PI / sides);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.3, 0, TAU);
    ctx.stroke();
    // pontos nos vértices
    ctx.fillStyle = hexA(pal.accent, p.a * fade * 1.6);
    for (let i = 0; i < sides * 2; i++) {
      const a = -Math.PI / 2 + (i / (sides * 2)) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82, 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private petal(p: P) {
    const { ctx, pal } = this;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.rot * 1.7)));
    ctx.beginPath();
    ctx.moveTo(0, -p.r);
    ctx.bezierCurveTo(p.r * 0.9, -p.r * 0.6, p.r * 0.7, p.r * 0.8, 0, p.r);
    ctx.bezierCurveTo(-p.r * 0.7, p.r * 0.8, -p.r * 0.9, -p.r * 0.6, 0, -p.r);
    const g = ctx.createLinearGradient(0, -p.r, 0, p.r);
    g.addColorStop(0, hexA(pal.accent2, p.a));
    g.addColorStop(1, hexA(pal.accent, p.a));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  private shootingStar(dt: number) {
    const { ctx, w, h } = this;
    if (!this.shooting && Math.random() < dt * 0.06) {
      this.shooting = { x: rand(w * 0.2, w), y: rand(0, h * 0.4), vx: -rand(500, 800), vy: rand(150, 260), life: 0 };
    }
    const s = this.shooting;
    if (!s) return;
    s.life += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const a = Math.max(0, 1 - s.life / 1.1);
    const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.12, s.y - s.vy * 0.12);
    g.addColorStop(0, hexA('#ffffff', a));
    g.addColorStop(1, hexA(this.pal.accent2, 0));
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12);
    ctx.stroke();
    if (a <= 0) this.shooting = null;
  }
}

/** Rastro do cursor: respingos de tinta/faíscas que somem rápido. Só anima enquanto há partículas. */
export class CursorTrail {
  private ctx: CanvasRenderingContext2D;
  private ps: { x: number; y: number; vx: number; vy: number; r: number; life: number }[] = [];
  private raf = 0;
  private lastX = -1;
  private lastY = -1;
  private dpr = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private color: string,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  setColor(c: string) {
    this.color = c;
  }

  resize() {
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(window.innerWidth * this.dpr);
    this.canvas.height = Math.round(window.innerHeight * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  move(x: number, y: number) {
    if (this.lastX >= 0) {
      const d = Math.hypot(x - this.lastX, y - this.lastY);
      const n = Math.min(4, Math.floor(d / 10));
      for (let i = 0; i < n && this.ps.length < 120; i++) {
        this.ps.push({ x: x + rand(-2, 2), y: y + rand(-2, 2), vx: rand(-20, 20), vy: rand(-10, 30), r: rand(1, 2.6), life: 1 });
      }
    }
    this.lastX = x;
    this.lastY = y;
    if (!this.raf && this.ps.length) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const p of this.ps) {
      p.life -= 0.035;
      p.x += p.vx / 60;
      p.y += p.vy / 60;
      ctx.fillStyle = hexA(this.color, p.life * 0.8);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + p.life * 0.6), 0, TAU);
      ctx.fill();
    }
    this.ps = this.ps.filter((p) => p.life > 0);
    this.raf = this.ps.length ? requestAnimationFrame(this.tick) : 0;
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
