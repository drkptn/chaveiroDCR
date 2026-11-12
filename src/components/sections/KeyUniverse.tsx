"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { IconChevron } from "@/components/ui/Icons";
import { LaserText } from "@/components/ui/LaserText";
import { SectionMark } from "@/components/ui/SectionMark";
import { keyTypes } from "@/config/keys";
import { supportsWebGL, useMedia, useNearScreen } from "@/lib/hooks";
import { ringState } from "@/three/scenes/sceneState";
import { KeySchematic } from "./KeySchematic";
import styles from "./KeyUniverse.module.css";

const KeyRingScene = dynamic(() => import("@/three/scenes/KeyRingScene"), { ssr: false });

const N = keyTypes.length;
const STEP = (Math.PI * 2) / N;

export function KeyUniverse() {
  const [sel, setSel] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const near = useNearScreen(section, "400px");
  const visible = useNearScreen(section, "0px");
  const compact = useMedia("(max-width: 767px)");
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);
  const tagsRef = useRef<HTMLDivElement>(null);

  useEffect(() => setWebgl(supportsWebGL()), []);
  useEffect(() => {
    if (near) setMounted(true);
  }, [near]);

  const select = (i: number) => {
    const n = ((i % N) + N) % N;
    ringState.selected = n;
    ringState.drag = 0;
    setSel(n);
    const tag = tagsRef.current?.querySelector<HTMLElement>(`[data-i="${n}"]`);
    tag?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  };

  // arrastar a argola (mouse ou toque)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let startY = 0;
    let startX = 0;
    let dragging = false;
    const down = (e: PointerEvent) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      ringState.dragging = true;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const d = (e.clientY - startY) * -0.006 + (e.clientX - startX) * 0.002;
      ringState.drag = d;
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      ringState.dragging = false;
      const steps = Math.round(-ringState.drag / STEP);
      ringState.drag = 0;
      if (steps !== 0) select(ringState.selected + steps);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const k = keyTypes[sel];

  return (
    <section ref={section} id="especialidades" className={styles.universe} aria-labelledby="universo-title">
      <header className={`wrap ${styles.head}`}>
        <SectionMark letter="C" label="Especialidades" sheet="Folha 03 / 09" />
        <h2 id="universo-title" className={styles.title}>
          <span className="display chrome">O universo</span>{" "}
          <span className="serif">das chaves</span>
        </h2>
        <LaserText as="p" className={styles.lead}>
          Cada chave conversa com um mecanismo diferente. Conhecer essas diferenças é o que permite escolher o procedimento certo — e
          evitar danos à fechadura.
        </LaserText>
      </header>

      <div className={styles.lab}>
        <div
          ref={stage}
          className={styles.stage}
          data-cursor="rotate"
          aria-hidden="true"
        >
          {mounted && webgl && <KeyRingScene active={visible} compact={compact} />}
          {webgl === false && (
            <div className={styles.fallback}>
              <KeySchematic id={k.id} />
            </div>
          )}
          <span className={`mono ${styles.dragHint}`}>Arraste para girar a argola</span>
        </div>

        <div className={`wrap ${styles.panelWrap}`}>
          <article className={styles.panel} aria-live="polite" key={k.id}>
            <p className={`mono ${styles.count}`} style={{ ["--d" as string]: 0 }}>
              <span>Nº {String(sel + 1).padStart(2, "0")}</span>
              <span>/ {String(N).padStart(2, "0")}</span>
            </p>
            <h3 className={styles.name} style={{ ["--d" as string]: 1 }}>
              {k.name}
            </h3>
            {k.alias && (
              <p className={`serif ${styles.alias}`} style={{ ["--d" as string]: 2 }}>
                {k.alias}
              </p>
            )}
            <p className={styles.summary} style={{ ["--d" as string]: 3 }}>
              {k.summary}
            </p>
            <div className={styles.cols} style={{ ["--d" as string]: 4 }}>
              <div>
                <p className="mono">Características</p>
                <ul>
                  {k.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mono">Aplicações comuns</p>
                <ul>
                  {k.uses.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className={styles.sheet} style={{ ["--d" as string]: 5 }}>
              <KeySchematic id={k.id} />
              <dl>
                {k.spec.map((s) => (
                  <div key={s.label}>
                    <dt className="mono">{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </article>
        </div>
      </div>

      <div className={`wrap ${styles.selector}`}>
        <button className={styles.arrow} onClick={() => select(sel - 1)} aria-label="Chave anterior">
          <IconChevron dir="left" size={18} />
        </button>
        <div ref={tagsRef} className={styles.tags} role="tablist" aria-label="Tipos de chave">
          {keyTypes.map((t, i) => (
            <button
              key={t.id}
              role="tab"
              data-i={i}
              aria-selected={i === sel}
              className={i === sel ? styles.tagOn : ""}
              onClick={() => select(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  select(i + 1);
                  (tagsRef.current?.querySelector(`[data-i="${(i + 1) % N}"]`) as HTMLElement | null)?.focus();
                }
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  select(i - 1);
                  (tagsRef.current?.querySelector(`[data-i="${(i - 1 + N) % N}"]`) as HTMLElement | null)?.focus();
                }
              }}
              tabIndex={i === sel ? 0 : -1}
            >
              <span className="mono">{String(i + 1).padStart(2, "0")}</span>
              {t.name.replace("Chaves de ", "").replace("Chaves ", "").replace("Chave ", "").replace("com ", "")}
            </button>
          ))}
        </div>
        <button className={styles.arrow} onClick={() => select(sel + 1)} aria-label="Próxima chave">
          <IconChevron size={18} />
        </button>
      </div>
      <p className={`wrap ${styles.note}`}>
        Catálogo de referência técnica. Para saber se um modelo específico é atendido, consulte antes do serviço.
      </p>
    </section>
  );
}
