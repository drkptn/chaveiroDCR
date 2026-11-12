"use client";

import { useEffect, useRef } from "react";
import { sectionsOrder } from "@/config/site";
import styles from "./KeyProgress.module.css";

/** Profundidade de cada corte (segredo da "chave do site"). */
const BITTING = [3, 1, 4, 2, 5, 2, 4, 1, 3];

/**
 * Indicador de rolagem em forma de chave virgem: cada seção visitada
 * "corta" um dente na lâmina. Uma fresa (disco) acompanha a posição atual.
 */
export function KeyProgress() {
  const path = useRef<SVGPathElement>(null);
  const cutter = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let raf = 0;
    let spin = 0;
    const tick = () => {
      const el = svg.current;
      if (!el) return;
      const W = el.clientWidth || 1;
      const H = 14;
      const top = 3;
      const bottom = 11;
      const n = sectionsOrder.length;
      const vh = window.innerHeight;
      const mid = window.scrollY + vh * 0.5;
      let cursorX = 0;
      const pts: string[] = [`M0 ${top}`];
      sectionsOrder.forEach((id, i) => {
        const s = document.getElementById(id);
        let prog = 0;
        if (s) {
          const r = s.getBoundingClientRect();
          const t = r.top + window.scrollY;
          prog = Math.min(1, Math.max(0, (mid - t) / Math.max(1, r.height)));
          if (mid >= t && mid < t + r.height) cursorX = ((i + prog) / n) * W;
          if (i === n - 1 && mid >= t + r.height) cursorX = W;
        }
        const c = ((i + 0.5) / n) * W;
        const d = BITTING[i % BITTING.length] * 1.4 * Math.min(1, prog * 2.2);
        const w = 3;
        pts.push(`L${(c - w - d).toFixed(1)} ${top}`, `L${(c - w).toFixed(1)} ${(top + d).toFixed(2)}`, `L${(c + w).toFixed(1)} ${(top + d).toFixed(2)}`, `L${(c + w + d).toFixed(1)} ${top}`);
      });
      pts.push(`L${W - 10} ${top}`, `L${W} ${(top + bottom) / 2}`, `L${W - 10} ${bottom}`, `L0 ${bottom}`, "Z");
      path.current?.setAttribute("d", pts.join(" "));
      spin += 18;
      cutter.current?.setAttribute("transform", `translate(${cursorX.toFixed(1)} ${top}) rotate(${spin % 360})`);
      void H;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg ref={svg} className={styles.bar} height="14" aria-hidden="true">
      <defs>
        <linearGradient id="kp-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3f6f8" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#727d89" stopOpacity="0.7" />
          <stop offset="1" stopColor="#252b33" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <path ref={path} fill="url(#kp-steel)" />
      <g ref={cutter} className={styles.cutter}>
        <circle r="4.5" fill="none" stroke="#79e9ff" strokeWidth="1" strokeDasharray="1.5 1.3" />
        <circle r="1.2" fill="#ffffff" />
      </g>
    </svg>
  );
}
