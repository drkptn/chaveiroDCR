"use client";

import { createElement, useRef, type ReactNode } from "react";
import { gsap, SplitText, useGSAP } from "@/lib/gsap";
import styles from "./LaserText.module.css";

type Props = {
  as?: "h1" | "h2" | "h3" | "p" | "div" | "span";
  className?: string;
  children: ReactNode;
  id?: string;
  /** atraso extra (s) */
  delay?: number;
  /** dispara ao montar em vez de ao entrar na tela */
  immediate?: boolean;
};

/**
 * Gravação a laser: cada linha é "usinada" da esquerda para a direita por um
 * cabeçote luminoso; o texto nasce quente (ciano) e esfria até o cromo.
 */
export function LaserText({ as = "h2", className, children, id, delay = 0, immediate = false }: Props) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const split = SplitText.create(el, { type: "lines", linesClass: styles.line, aria: "none" });
      const heads: HTMLElement[] = [];
      split.lines.forEach((line) => {
        const h = document.createElement("span");
        h.className = styles.head;
        h.setAttribute("aria-hidden", "true");
        line.appendChild(h);
        heads.push(h);
      });
      gsap.set(split.lines, { clipPath: "inset(-20% 100% -20% 0%)" });
      gsap.set(heads, { left: "0%", opacity: 0 });
      const tl = gsap.timeline({
        delay,
        paused: !immediate,
        onComplete: () => {
          heads.forEach((h) => h.remove());
          split.revert();
        },
      });
      split.lines.forEach((line, i) => {
        const at = i * 0.16;
        tl.to(heads[i], { opacity: 1, duration: 0.08 }, at)
          .to(line, { clipPath: "inset(-20% 0% -20% 0%)", duration: 0.85, ease: "power2.inOut" }, at)
          .to(heads[i], { left: "100%", duration: 0.85, ease: "power2.inOut" }, at)
          .to(heads[i], { opacity: 0, duration: 0.25 }, at + 0.8)
          .fromTo(line, { filter: "brightness(2.2) drop-shadow(0 0 10px rgb(0 217 255 / 0.85))" }, { filter: "brightness(1) drop-shadow(0 0 0px rgb(0 217 255 / 0))", duration: 1.1, ease: "power1.out" }, at + 0.15);
      });
      if (!immediate) {
        gsap.timeline({ scrollTrigger: { trigger: el, start: "top 86%", once: true, onEnter: () => tl.play() } });
      }
    },
    { scope: ref },
  );

  return createElement(as, { ref, className: `${styles.text} ${className ?? ""}`, id }, children);
}
