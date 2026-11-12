"use client";

import { useEffect, useRef } from "react";
import { light, startLight } from "@/lib/light";
import styles from "./Lamp.module.css";

/**
 * O cursor é uma lanterna de chaveiro: um núcleo luminoso com um anel de bezel
 * (marcas de 15°) que ROLA conforme o movimento. Sobre botões e links o anel
 * vira um buraco de fechadura. Deixa um rastro de luz bem discreto.
 * Também liga a "luz global" (--lx/--ly) que ilumina as superfícies metálicas.
 */
export function Lamp() {
  const core = useRef<HTMLDivElement>(null);
  const bezel = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    startLight();
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine) return;
    document.documentElement.classList.add("has-lamp");

    let x = -100;
    let y = -100;
    let bx = x;
    let by = y;
    let roll = 0;
    let shown = false;
    let mode = "";
    const pts: { x: number; y: number; t: number }[] = [];
    const cv = trail.current!;
    const ctx = cv.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      if (!shown) {
        shown = true;
        bx = x;
        by = y;
        document.documentElement.classList.add("lamp-on");
      }
      pts.push({ x, y, t: performance.now() });
      const t = e.target as Element | null;
      let next = "";
      if (t?.closest?.("input, textarea, [contenteditable]")) next = "text";
      else if (t?.closest?.("[data-cursor='rotate']")) next = "rotate";
      else if (t?.closest?.("a, button, [role='button'], [role='radio'], label, summary")) next = "key";
      if (next !== mode) {
        mode = next;
        bezel.current?.setAttribute("data-mode", mode);
        core.current?.setAttribute("data-mode", mode);
      }
    };
    const onLeave = () => {
      shown = false;
      document.documentElement.classList.remove("lamp-on");
    };
    const onDown = () => bezel.current?.classList.add(styles.press);
    const onUp = () => bezel.current?.classList.remove(styles.press);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    let raf = 0;
    const tick = () => {
      const dx = x - bx;
      const dy = y - by;
      bx += dx * 0.2;
      by += dy * 0.2;
      // o anel rola: distância percorrida → rotação
      roll += (Math.abs(dx) + Math.abs(dy)) * 0.9 * Math.sign(dx || 1) * 0.2;
      if (core.current) core.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (bezel.current) {
        bezel.current.style.transform = `translate3d(${bx}px, ${by}px, 0)`;
        bezel.current.style.setProperty("--roll", `${roll.toFixed(1)}deg`);
      }
      // rastro
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!reduce) {
        const now = performance.now();
        while (pts.length && now - pts[0].t > 220) pts.shift();
        if (pts.length > 2) {
          ctx.lineCap = "round";
          for (let i = 1; i < pts.length; i++) {
            const a = 1 - (now - pts[i].t) / 220;
            ctx.strokeStyle = `rgba(121, 233, 255, ${(a * 0.35).toFixed(3)})`;
            ctx.lineWidth = a * 2.2 * dpr;
            ctx.beginPath();
            ctx.moveTo(pts[i - 1].x * dpr, pts[i - 1].y * dpr);
            ctx.lineTo(pts[i].x * dpr, pts[i].y * dpr);
            ctx.stroke();
          }
        }
      }
      void light;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", resize);
      document.documentElement.classList.remove("has-lamp", "lamp-on");
    };
  }, []);

  return (
    <div className={styles.lamp} aria-hidden="true">
      <canvas ref={trail} className={styles.trail} />
      <div ref={bezel} className={styles.bezel}>
        <svg viewBox="0 0 60 60" className={styles.ring}>
          <defs>
            <linearGradient id="lampg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.5" stopColor="#727d89" />
              <stop offset="1" stopColor="#dce3e9" />
            </linearGradient>
          </defs>
          <circle cx="30" cy="30" r="22" fill="none" stroke="url(#lampg)" strokeWidth="1.2" />
          {Array.from({ length: 24 }, (_, i) => (
            <line key={i} x1="30" y1={i % 6 === 0 ? 4 : 6} x2="30" y2="9.5" stroke="#a7b1bc" strokeWidth={i % 6 === 0 ? 1.4 : 0.8} transform={`rotate(${i * 15} 30 30)`} />
          ))}
        </svg>
        <svg viewBox="0 0 60 60" className={styles.keyhole}>
          <path d="M30 14a8 8 0 0 1 4.6 14.6L37 46H23l2.4-17.4A8 8 0 0 1 30 14Z" fill="none" stroke="#79e9ff" strokeWidth="1.4" />
        </svg>
      </div>
      <div ref={core} className={styles.core} />
    </div>
  );
}
