"use client";

import { useRef } from "react";
import { LiquidChrome } from "@/components/effects/LiquidChrome";
import { LaserText } from "@/components/ui/LaserText";
import { Screw } from "@/components/ui/Screw";
import { SectionMark } from "@/components/ui/SectionMark";
import { differentials } from "@/config/content";
import { gsap, useGSAP } from "@/lib/gsap";
import styles from "./Differentials.module.css";

export function Differentials() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.utils.toArray<HTMLElement>("[data-plate]").forEach((plate, i) => {
        const screws = plate.querySelectorAll("[data-screw] svg");
        const tl = gsap.timeline({ scrollTrigger: { trigger: plate, start: "top 88%", once: true } });
        tl.from(plate, { y: 70, rotate: i % 2 ? 2.5 : -2.5, opacity: 0, duration: 0.9, ease: "expo.out" })
          .from(plate, { scale: 1.035, duration: 0.25, ease: "back.out(3)" }, 0.75)
          .from(screws, { rotate: -540, duration: 0.9, ease: "power3.out", stagger: 0.06 }, 0.55);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="diferenciais" className={styles.diff} aria-labelledby="diferenciais-title">
      <div className={styles.liquidWrap} aria-hidden="true">
        <LiquidChrome className={styles.liquid} />
      </div>
      <div className="wrap">
        <SectionMark letter="F" label="Diferenciais" sheet="Folha 06 / 09" />
        <h2 id="diferenciais-title" className={styles.headline}>
          <span className={`display chrome ${styles.h1}`}>Mais do que fazer uma cópia.</span>{" "}
          <LaserText as="span" className={`serif ${styles.h2}`}>
            Entender o que existe por trás dela.
          </LaserText>
        </h2>

        <div className={styles.grid}>
          {differentials.map((d, i) => (
            <article key={d.title} className={`${styles.plate} ${styles[`p${i + 1}`]}`} data-plate data-lit>
              <div className={styles.rim}>
              <div className={styles.face}>
                <Screw className={styles.s1} angle={i * 31} size={11} />
                <Screw className={styles.s2} angle={i * 47 + 12} size={11} />
                <Screw className={styles.s3} angle={i * 13 + 40} size={11} />
                <Screw className={styles.s4} angle={i * 71} size={11} />
                <span className={`mono ${styles.code}`}>DIF-{String(i + 1).padStart(2, "0")}</span>
                <h3 className={styles.title}>{d.title}</h3>
                <p className={styles.text}>{d.text}</p>
                <span className={`mono ${styles.hidden}`} aria-hidden="true">
                  {d.hidden}
                </span>
              </div>
              </div>
            </article>
          ))}
          <p className={styles.aside}>
            <span className="mono">Nota técnica</span>
            Sem promessas genéricas: cada atendimento começa entendendo o mecanismo — e termina quando ele funciona como deve.
          </p>
        </div>
      </div>
    </section>
  );
}
