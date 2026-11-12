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
    // medidas das seções em cache: nada de getBoundingClientRect a cada quadro
    let tops: { t: number; h: number }[] = [];
    let W = 1;
    let spin = 0;
    let lastY = window.scrollY;
    let queued = false;
    const top = 3;
    const bottom = 11;
    const n = sectionsOrder.length;

    const measure = () => {
      W = svg.current?.clientWidth || 1;
      tops = sectionsOrder.map((id) => {
        const s = document.getElementById(id);
        if (!s) return { t: 0, h: 1 };
        const r = s.getBoundingClientRect();
        return { t: r.top + window.scrollY, h: Math.max(1, r.height) };
      });
    };

    const draw = () => {
      queued = false;
      const y = window.scrollY;
      const mid = y + window.innerHeight * 0.5;
      let cursorX = 0;
      const pts: string[] = [`M0 ${top}`];
      tops.forEach(({ t, h }, i) => {
        const prog = Math.min(1, Math.max(0, (mid - t) / h));
        if (mid >= t && mid < t + h) cursorX = ((i + prog) / n) * W;
        if (i === n - 1 && mid >= t + h) cursorX = W;
        const c = ((i + 0.5) / n) * W;
        const d = BITTING[i % BITTING.length] * 1.4 * Math.min(1, prog * 2.2);
        const w = 3;
        pts.push(`L${(c - w - d).toFixed(1)} ${top}`, `L${(c - w).toFixed(1)} ${(top + d).toFixed(2)}`, `L${(c + w).toFixed(1)} ${(top + d).toFixed(2)}`, `L${(c + w + d).toFixed(1)} ${top}`);
      });
      pts.push(`L${W - 10} ${top}`, `L${W} ${(top + bottom) / 2}`, `L${W - 10} ${bottom}`, `L0 ${bottom}`, "Z");
      path.current?.setAttribute("d", pts.join(" "));
      // a fresa só gira quando há rolagem
      spin += (y - lastY) * 0.8;
      lastY = y;
      cutter.current?.setAttribute("transform", `translate(${cursorX.toFixed(1)} ${top}) rotate(${(spin % 360).toFixed(1)})`);
    };
    const schedule = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(draw);
      }
    };
    const remeasure = () => {
      measure();
      schedule();
    };

    measure();
    draw();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", remeasure);
    // gavetas abrindo etc. mudam a altura da página
    const ro = new ResizeObserver(() => remeasure());
    ro.observe(document.body);
    const late = window.setTimeout(remeasure, 1500);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", remeasure);
      ro.disconnect();
      window.clearTimeout(late);
    };
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
