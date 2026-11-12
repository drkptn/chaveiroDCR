"use client";

/**
 * "Lanterna" — a posição do cursor vira uma fonte de luz.
 *
 * Desempenho: nada é escrito no :root. O 3D e o shader leem o objeto `light`
 * (só números, sem tocar no DOM). As superfícies metálicas marcadas com
 * [data-lit] recebem --mx/--my LOCAIS, apenas a que está sob o cursor e apenas
 * quando o mouse se move — sem recálculo de estilo da página inteira.
 */
export const light = {
  /** posição normalizada -1..1 (suavizada) */
  x: 0.35,
  y: -0.2,
  /** px na viewport (suavizado) */
  px: 0,
  py: 0,
  active: false,
};

let started = false;

export function startLight() {
  if (started || typeof window === "undefined") return;
  started = true;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tx = window.innerWidth * 0.68;
  let ty = window.innerHeight * 0.3;
  let lx = tx;
  let ly = ty;
  light.px = tx;
  light.py = ty;
  let lastMove = -1e9;

  // ---------- luz local nas superfícies [data-lit] ----------
  let litEl: HTMLElement | null = null;
  let pending: PointerEvent | null = null;
  const applyLit = () => {
    const e = pending;
    pending = null;
    if (!e) return;
    const el = (e.target as Element | null)?.closest?.<HTMLElement>("[data-lit]") ?? null;
    if (el !== litEl) {
      litEl?.removeAttribute("data-lit-on");
      litEl = el;
      el?.setAttribute("data-lit-on", "");
    }
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${(e.clientX - r.left).toFixed(0)}px`);
    el.style.setProperty("--my", `${(e.clientY - r.top).toFixed(0)}px`);
  };

  if (fine) {
    window.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType !== "mouse") return;
        tx = e.clientX;
        ty = e.clientY;
        lastMove = performance.now();
        light.active = true;
        if (!pending) requestAnimationFrame(applyLit);
        pending = e;
      },
      { passive: true },
    );
  }

  // ---------- luz numérica para o 3D (sem DOM) ----------
  const tick = (t: number) => {
    const idle = t - lastMove > 4000;
    if (idle && !reduce) {
      // passeio lento em lemniscata quando ninguém mexe o mouse (e no toque)
      const s = t * 0.00018;
      tx = window.innerWidth * (0.5 + Math.sin(s) * 0.34);
      ty = window.innerHeight * (0.38 + Math.sin(s * 2) * 0.2);
    }
    const k = idle ? 0.04 : 0.16;
    lx += (tx - lx) * k;
    ly += (ty - ly) * k;
    light.px = lx;
    light.py = ly;
    light.x = (lx / window.innerWidth) * 2 - 1;
    light.y = -((ly / window.innerHeight) * 2 - 1);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
