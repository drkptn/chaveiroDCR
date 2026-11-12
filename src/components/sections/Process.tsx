"use client";

import { useMemo, useRef } from "react";
import { IconChat, IconCheck, IconSearch, IconWrench } from "@/components/ui/Icons";
import { LaserText } from "@/components/ui/LaserText";
import { SectionMark } from "@/components/ui/SectionMark";
import { processSteps } from "@/config/content";
import { ScrollTrigger, useGSAP } from "@/lib/gsap";
import { useMedia } from "@/lib/hooks";
import styles from "./Process.module.css";

const MODULE = 9; // passo do dente (px no viewBox)
/** arredonda (evita diferença de hidratação entre Node e navegador em sen/cos) */
const r2 = (n: number) => Math.round(n * 100) / 100;
const TEETH = [20, 13, 17, 11];
const ICONS = [IconChat, IconSearch, IconWrench, IconCheck];

function gearPath(z: number) {
  const rp = (MODULE * z) / 2;
  const ra = rp + MODULE * 0.9;
  const rf = rp - MODULE * 1.1;
  const step = (Math.PI * 2) / z;
  let d = "";
  for (let i = 0; i < z; i++) {
    const a = i * step;
    const pts = [
      [a - step * 0.5, rf],
      [a - step * 0.27, rf],
      [a - step * 0.15, ra],
      [a + step * 0.15, ra],
      [a + step * 0.27, rf],
    ];
    pts.forEach(([ang, r], k) => {
      const x = (Math.cos(ang) * r).toFixed(2);
      const y = (Math.sin(ang) * r).toFixed(2);
      d += `${i === 0 && k === 0 ? "M" : "L"}${x} ${y} `;
    });
  }
  return d + "Z";
}

type Gear = { z: number; r: number; x: number; y: number; phase: number; ratio: number };

/** Posiciona as engrenagens engrenadas e calcula fase e relação de cada uma. */
function layoutGears(vertical: boolean): { gears: Gear[]; w: number; h: number } {
  const gears: Gear[] = [];
  const angles = vertical ? [Math.PI / 2 - 0.42, Math.PI / 2 + 0.42, Math.PI / 2 - 0.42] : [0.36, -0.36, 0.36];
  let x = 0;
  let y = 0;
  TEETH.forEach((z, i) => {
    const r = (MODULE * z) / 2;
    if (i === 0) {
      gears.push({ z, r, x, y, phase: 0, ratio: 1 });
      return;
    }
    const prev = gears[i - 1];
    const phi = angles[i - 1];
    const dist = prev.r + r;
    x = prev.x + Math.cos(phi) * dist;
    y = prev.y + Math.sin(phi) * dist;
    // fase para o dente de uma cair no vão da outra
    const ratio = -prev.ratio * (prev.z / z);
    const phase = -(prev.z / z) * (prev.phase - phi) + (phi + Math.PI - Math.PI / z);
    gears.push({ z, r, x, y, phase, ratio });
  });
  const pad = MODULE * 2;
  const minX = Math.min(...gears.map((g) => g.x - g.r)) - pad;
  const maxX = Math.max(...gears.map((g) => g.x + g.r)) + pad;
  const minY = Math.min(...gears.map((g) => g.y - g.r)) - pad;
  const maxY = Math.max(...gears.map((g) => g.y + g.r)) + pad;
  gears.forEach((g) => {
    g.x = r2(g.x - minX);
    g.y = r2(g.y - minY);
    g.phase = Math.round(g.phase * 1e5) / 1e5;
  });
  return { gears, w: r2(maxX - minX), h: r2(maxY - minY) };
}

export function Process() {
  const vertical = useMedia("(max-width: 767px)");
  const { gears, w, h } = useMemo(() => layoutGears(vertical), [vertical]);
  const root = useRef<HTMLElement>(null);
  const gearEls = useRef<(SVGGElement | null)[]>([]);
  const steps = useRef<(HTMLLIElement | null)[]>([]);
  const fill = useRef<SVGPathElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const apply = (p: number) => {
        const theta = p * Math.PI * 2 * 1.35;
        gears.forEach((g, i) => {
          const el = gearEls.current[i];
          if (el) el.setAttribute("transform", `translate(${g.x} ${g.y}) rotate(${(((g.phase + theta * g.ratio) * 180) / Math.PI).toFixed(2)})`);
        });
        const active = Math.min(3, Math.floor(p * 4.4));
        steps.current.forEach((s, i) => s?.toggleAttribute("data-on", i <= active && p > 0.04));
        gearEls.current.forEach((g, i) => g?.toggleAttribute("data-on", i <= active && p > 0.04));
        if (fill.current) {
          const len = fill.current.getTotalLength();
          fill.current.style.strokeDasharray = `${len}`;
          fill.current.style.strokeDashoffset = `${len * (1 - Math.min(1, p * 1.15))}`;
        }
      };
      apply(reduce ? 1 : 0);
      if (reduce) return;
      const st = ScrollTrigger.create({
        trigger: root.current,
        start: "top 70%",
        end: "bottom 60%",
        scrub: 0.8,
        onUpdate: (self) => apply(self.progress),
      });
      return () => st.kill();
    },
    { scope: root, dependencies: [gears], revertOnUpdate: true },
  );

  const shaft = gears.map((g, i) => `${i === 0 ? "M" : "L"}${g.x.toFixed(1)} ${g.y.toFixed(1)}`).join(" ");

  return (
    <section ref={root} id="atendimento" className={styles.process} aria-labelledby="processo-title">
      <div className="wrap">
        <SectionMark letter="E" label="Atendimento" sheet="Folha 05 / 09" />
        <div className={styles.head}>
          <h2 id="processo-title" className={styles.title}>
            <span className="display">Como funciona</span>{" "}
            <span className="serif">o atendimento</span>
          </h2>
          <LaserText as="p" className={styles.lead}>
            Um processo simples, em quatro etapas engrenadas — para você saber exatamente o que acontece do primeiro contato à
            finalização.
          </LaserText>
        </div>

        <div className={`${styles.machine} ${vertical ? styles.vertical : ""}`}>
          <svg className={styles.train} viewBox={`0 0 ${w.toFixed(0)} ${h.toFixed(0)}`} aria-hidden="true">
            <defs>
              <linearGradient id="gearMetal" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#eef2f5" />
                <stop offset="0.35" stopColor="#8d98a4" />
                <stop offset="0.55" stopColor="#3a434d" />
                <stop offset="0.8" stopColor="#b9c2ca" />
                <stop offset="1" stopColor="#5a6570" />
              </linearGradient>
              <linearGradient id="gearBrass" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff1c8" />
                <stop offset="0.4" stopColor="#c4a062" />
                <stop offset="0.6" stopColor="#5e4b43" />
                <stop offset="1" stopColor="#e7c98a" />
              </linearGradient>
              <radialGradient id="gearShadow">
                <stop offset="0.55" stopColor="#000" stopOpacity="0.55" />
                <stop offset="1" stopColor="#000" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hubDark">
                <stop offset="0" stopColor="#1a2027" />
                <stop offset="1" stopColor="#07090c" />
              </radialGradient>
            </defs>
            <path d={shaft} className={styles.shaft} />
            <path ref={fill} d={shaft} className={styles.shaftFill} />
            {gears.map((g, i) => {
              const Icon = ICONS[i];
              const rIn = g.r - MODULE * 2.6;
              return (
                <g key={i} className={styles.gearWrap}>
                  {/* sombra estática (não gira → não é recalculada a cada quadro) */}
                  <circle cx={g.x} cy={r2(g.y + 12)} r={r2(g.r * 1.08)} className={styles.shadow} />
                  <g ref={(el) => void (gearEls.current[i] = el)} transform={`translate(${g.x} ${g.y}) rotate(${((g.phase * 180) / Math.PI).toFixed(2)})`}>
                    <path d={gearPath(g.z)} fill={i % 2 ? "url(#gearBrass)" : "url(#gearMetal)"} className={styles.gear} />
                    <circle r={r2(rIn)} className={styles.web} />
                    {Array.from({ length: i % 2 ? 4 : 6 }, (_, k) => {
                      const a = (k / (i % 2 ? 4 : 6)) * Math.PI * 2;
                      return <circle key={k} cx={r2(Math.cos(a) * rIn * 0.62)} cy={r2(Math.sin(a) * rIn * 0.62)} r={r2(rIn * 0.17)} className={styles.hole} />;
                    })}
                  </g>
                  <circle cx={g.x} cy={g.y} r={r2(MODULE * 2.9)} fill="url(#hubDark)" className={styles.hub} />
                  <foreignObject x={r2(g.x - 13)} y={r2(g.y - 13)} width="26" height="26">
                    <div className={styles.hubIcon}>
                      <Icon size={22} />
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>

          <ol className={styles.steps}>
            {processSteps.map((s, i) => (
              <li
                key={s.title}
                ref={(el) => void (steps.current[i] = el)}
                style={
                  vertical
                    ? { top: `${((gears[i].y / h) * 100).toFixed(2)}%` }
                    : { left: `${((gears[i].x / w) * 100).toFixed(2)}%`, top: `${(((gears[i].y + gears[i].r + MODULE * 2.5) / h) * 100).toFixed(2)}%` }
                }
              >
                <span className={styles.no}>{String(i + 1).padStart(2, "0")}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
