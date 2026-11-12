"use client";

import { useEffect, useRef, useState } from "react";
import { asset } from "@/lib/asset";
import styles from "./Turntable.module.css";

const FRAMES = 24;
const COLS = 8;
const ROWS = 3;

type Props = {
  name: string;
  alt: string;
  className?: string;
  /** gira sozinho quando visível */
  auto?: boolean;
  /** começa a carregar a folha 360° */
  eager?: boolean;
  /** quadro controlado externamente (0..1) — ex.: posição do mouse no rodapé */
  progress?: number;
};

/**
 * Visor 360° de produto: uma folha de 24 fotos do estúdio 3D.
 * Mouse: a posição horizontal escolhe o ângulo. Toque: arraste. Parado: gira devagar.
 * Sem WebGL — leve e idêntico em qualquer aparelho.
 */
export function Turntable({ name, alt, className, auto = true, eager = false, progress }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState(false);
  const [frame, setFrame] = useState(0);
  const state = useRef({ hover: false, drag: false, startX: 0, startF: 0, visible: false, f: 0 });

  // carrega a folha quando chega perto da tela
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        state.current.visible = e.isIntersecting;
        if (e.isIntersecting || eager) {
          const img = new Image();
          img.src = asset(`/renders/${name}-360.webp`);
          img.decode().then(() => setSheet(true)).catch(() => {});
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [name, eager]);

  // giro automático (8 quadros/s) quando visível e sem interação
  useEffect(() => {
    if (!auto || !sheet || progress !== undefined) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      const s = state.current;
      if (!s.visible || s.hover || s.drag) return;
      s.f = (s.f + 1) % FRAMES;
      setFrame(s.f);
    }, 125);
    return () => window.clearInterval(id);
  }, [auto, sheet, progress]);

  useEffect(() => {
    if (progress === undefined) return;
    const f = Math.round(progress * (FRAMES - 1));
    state.current.f = f;
    setFrame(f);
  }, [progress]);

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const s = state.current;
    const r = el.getBoundingClientRect();
    if (e.pointerType === "mouse" && !s.drag) {
      s.hover = true;
      const f = Math.min(FRAMES - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * FRAMES)));
      s.f = f;
      setFrame(f);
    } else if (s.drag) {
      const dx = e.clientX - s.startX;
      const f = (((s.startF - Math.round(dx / 14)) % FRAMES) + FRAMES) % FRAMES;
      s.f = f;
      setFrame(f);
    }
  };

  const col = frame % COLS;
  const row = Math.floor(frame / COLS);

  return (
    <div
      ref={ref}
      className={`${styles.tt} ${className ?? ""}`}
      role="img"
      aria-label={alt}
      onPointerMove={onMove}
      onPointerLeave={() => (state.current.hover = false)}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        state.current.drag = true;
        state.current.startX = e.clientX;
        state.current.startF = state.current.f;
      }}
      onPointerUp={() => (state.current.drag = false)}
      onPointerCancel={() => (state.current.drag = false)}
      data-cursor="rotate"
    >
      <img className={styles.poster} src={asset(`/renders/${name}.webp`)} alt="" loading="lazy" decoding="async" style={{ opacity: sheet ? 0 : 1 }} />
      {sheet && (
        <div
          className={styles.sheet}
          style={{
            backgroundImage: `url(${asset(`/renders/${name}-360.webp`)})`,
            backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
            backgroundPosition: `${(col / (COLS - 1)) * 100}% ${(row / (ROWS - 1)) * 100}%`,
          }}
        />
      )}
      <span className={styles.ring} aria-hidden="true">
        <span style={{ transform: `rotate(${(frame / FRAMES) * 360}deg)` }} />
      </span>
      <span className={`mono ${styles.deg}`} aria-hidden="true">
        {String(Math.round((frame / FRAMES) * 360)).padStart(3, "0")}°
      </span>
    </div>
  );
}
