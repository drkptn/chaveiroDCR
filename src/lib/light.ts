"use client";

/**
 * "Lanterna" global — a posição do cursor vira uma fonte de luz.
 * Superfícies metálicas leem --lx/--ly (px, viewport) e o 3D lê `light`.
 * Em telas de toque, a luz passeia sozinha e acompanha a rolagem.
 */
export const light = {
  /** posição normalizada -1..1 (suavizada) */
  x: 0.35,
  y: -0.2,
  /** px na viewport (suavizado) */
  px: 0,
  py: 0,
  /** velocidade do ponteiro (px/frame, suavizada) */
  speed: 0,
  active: false,
};

let started = false;

export function startLight() {
  if (started || typeof window === "undefined") return;
  started = true;
  const root = document.documentElement;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tx = window.innerWidth * 0.68;
  let ty = window.innerHeight * 0.3;
  light.px = tx;
  light.py = ty;
  let lastMove = 0;

  if (fine) {
    window.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType !== "mouse") return;
        tx = e.clientX;
        ty = e.clientY;
        lastMove = performance.now();
        light.active = true;
      },
      { passive: true },
    );
  }

  let lx = tx;
  let ly = ty;
  const tick = (t: number) => {
    const idle = !fine || t - lastMove > 4000;
    if (idle && !reduce) {
      // passeio lento em lemniscata + leve influência da rolagem
      const s = t * 0.00018 + window.scrollY * 0.0009;
      tx = window.innerWidth * (0.5 + Math.sin(s) * 0.34);
      ty = window.innerHeight * (0.38 + Math.sin(s * 2) * 0.2);
    }
    const k = idle ? 0.04 : 0.16;
    const dx = (tx - lx) * k;
    const dy = (ty - ly) * k;
    lx += dx;
    ly += dy;
    light.speed += (Math.hypot(dx, dy) - light.speed) * 0.2;
    light.px = lx;
    light.py = ly;
    light.x = (lx / window.innerWidth) * 2 - 1;
    light.y = -((ly / window.innerHeight) * 2 - 1);
    root.style.setProperty("--lx", `${lx.toFixed(1)}px`);
    root.style.setProperty("--ly", `${ly.toFixed(1)}px`);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
