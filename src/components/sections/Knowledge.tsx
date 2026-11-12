"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { IconXray } from "@/components/ui/Icons";
import { SectionMark } from "@/components/ui/SectionMark";
import { cylinderParts } from "@/config/content";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { supportsWebGL, useMedia, useNearScreen, useReducedMotion } from "@/lib/hooks";
import { asset } from "@/lib/asset";
import { explodedState } from "@/three/scenes/sceneState";
import styles from "./Knowledge.module.css";

const ExplodedScene = dynamic(() => import("@/three/scenes/ExplodedScene"), { ssr: false });

const HEADLINE = "Por trás de cada fechadura, existe um mecanismo. E cada mecanismo exige conhecimento.";
const TEXT =
  "Cada chave possui características próprias. Cada fechadura apresenta mecanismos diferentes. Por isso, um bom serviço exige atenção, conhecimento técnico e cuidado em cada etapa. No Chaveiro DCR, cada atendimento é tratado com responsabilidade, buscando oferecer soluções adequadas para cada necessidade.";

const FOCUS_START = 0.3;
const FOCUS_END = 0.88;

export function Knowledge() {
  const intro = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const overlay = useRef<SVGSVGElement>(null);
  const balloons = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(-1);
  const [phase, setPhase] = useState("Montado");
  const [xray, setXray] = useState(false);
  const reduce = useReducedMotion();
  const compact = useMedia("(max-width: 767px)");
  const near = useNearScreen(track, "300px");
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setWebgl(supportsWebGL()), []);
  useEffect(() => {
    if (near) setMounted(true);
  }, [near]);
  useEffect(() => {
    explodedState.xray = xray;
  }, [xray]);

  useGSAP(
    () => {
      // manchete: palavras acendem conforme a rolagem
      const words = gsap.utils.toArray<HTMLElement>("[data-w]");
      if (!reduce) {
        gsap.fromTo(
          words,
          { opacity: 0.12, color: "#727d89" },
          {
            opacity: 1,
            color: "#f3f6f8",
            stagger: 0.08,
            ease: "none",
            scrollTrigger: { trigger: intro.current, start: "top 75%", end: "bottom 45%", scrub: true },
          },
        );
      }

      if (reduce) {
        explodedState.p = 0.25;
        explodedState.focus = -1;
        return;
      }

      const st = ScrollTrigger.create({
        trigger: track.current,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => {
          const p = self.progress;
          explodedState.p = p;
          let f = -1;
          if (p >= FOCUS_START && p < FOCUS_END) f = Math.min(cylinderParts.length - 1, Math.floor(((p - FOCUS_START) / (FOCUS_END - FOCUS_START)) * cylinderParts.length));
          explodedState.focus = f;
          setFocus(f);
          setPhase(p < 0.06 ? "Montado" : p < FOCUS_START ? "Vista explodida" : p < FOCUS_END ? "Leitura das peças" : "Remontagem");
        },
      });
      return () => st.kill();
    },
    { dependencies: [reduce], revertOnUpdate: true },
  );

  // cotas: balões e linha de chamada seguem as peças projetadas do 3D
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const vis = explodedState.p > 0.12 && explodedState.p < 0.95;
      const bs = balloons.current?.children;
      explodedState.anchors.forEach((a, i) => {
        const b = bs?.[i] as HTMLElement | undefined;
        if (!b) return;
        b.style.translate = `${a.x.toFixed(1)}px ${a.y.toFixed(1)}px`;
        b.style.opacity = vis ? (explodedState.focus === i ? "1" : explodedState.focus < 0 ? "0.9" : "0.45") : "0";
      });
      const f = explodedState.focus;
      const path = overlay.current?.querySelector("path");
      if (path && label.current) {
        if (f >= 0) {
          const a = explodedState.anchors[f];
          const w = explodedState.w;
          const right = a.x < w * 0.62;
          const lx = Math.min(w - 20, Math.max(20, a.x + (right ? 1 : -1) * (compact ? 50 : 120)));
          const ly = Math.max(70, a.y - (compact ? 70 : 90));
          path.setAttribute("d", `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${(a.x + (right ? 1 : -1) * 28).toFixed(1)} ${ly.toFixed(1)} L${lx.toFixed(1)} ${ly.toFixed(1)}`);
          path.style.opacity = "1";
          label.current.style.opacity = "1";
          label.current.style.transform = `translate(${right ? lx + 8 : lx - 8}px, ${ly}px) translate(${right ? "0" : "-100%"}, -50%)`;
        } else {
          path.style.opacity = "0";
          label.current.style.opacity = "0";
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [compact]);

  const active = focus >= 0 ? cylinderParts[focus] : null;

  return (
    <section id="mecanismo" className={styles.knowledge} aria-labelledby="mecanismo-title">
      <div ref={intro} className={`wrap ${styles.intro}`}>
        <SectionMark letter="D" label="Mecanismo" sheet="Folha 04 / 09" />
        <h2 id="mecanismo-title" className={`display ${styles.headline}`}>
          {HEADLINE.split(" ").map((w, i) => (
            <span key={i} data-w>
              {w}{" "}
            </span>
          ))}
        </h2>
        <p className={styles.text}>{TEXT}</p>
      </div>

      <div ref={track} className={`${styles.track} ${reduce ? styles.static : ""}`}>
        <div className={styles.stage}>
          <div className={`${styles.canvas} blueprint`} aria-hidden="true">
            {mounted && webgl && <ExplodedScene active={near} compact={compact} />}
            {webgl === false && <img className={styles.fallback} src={asset("/renders/gal-cilindro.webp")} alt="" />}
          </div>

          <svg ref={overlay} className={styles.overlay} aria-hidden="true">
            <path />
          </svg>
          <div ref={balloons} className={styles.balloons} aria-hidden="true">
            {cylinderParts.map((p, i) => (
              <span key={p.id} className={`${styles.balloon} ${focus === i ? styles.bOn : ""}`}>
                {i + 1}
              </span>
            ))}
          </div>
          <div ref={label} className={styles.flyLabel} aria-hidden="true">
            {active && (
              <>
                <span className="mono">Peça {String(focus + 1).padStart(2, "0")}</span>
                <b>{active.name}</b>
              </>
            )}
          </div>

          <div className={`wrap ${styles.hudTop}`}>
            <span className="mono">
              Corte A-A · <span className={styles.phase}>{phase}</span>
            </span>
            <button className={`${styles.xray} ${xray ? styles.xrayOn : ""}`} onClick={() => setXray((x) => !x)} aria-pressed={xray}>
              <IconXray size={18} />
              <span className="mono">Raio-X</span>
            </button>
          </div>

          <div className={`wrap ${styles.legendWrap}`}>
            <ol className={styles.legend} aria-label="Componentes do cilindro">
              {cylinderParts.map((p, i) => (
                <li key={p.id} className={focus === i ? styles.on : ""} aria-current={focus === i ? "step" : undefined}>
                  <span className={styles.num}>{i + 1}</span>
                  <span className={styles.lname}>{p.name}</span>
                  <span className={styles.ltext}>{p.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
