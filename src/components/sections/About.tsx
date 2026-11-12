"use client";

import { useRef } from "react";
import { LaserText } from "@/components/ui/LaserText";
import { Screw } from "@/components/ui/Screw";
import { SectionMark } from "@/components/ui/SectionMark";
import { Turntable } from "@/components/ui/Turntable";
import { about } from "@/config/content";
import { asset } from "@/lib/asset";
import { gsap, useGSAP } from "@/lib/gsap";
import styles from "./About.module.css";

export function About() {
  const root = useRef<HTMLElement>(null);

  // a moldura se monta: quatro barras chegam de fora e os parafusos apertam
  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const tl = gsap.timeline({ scrollTrigger: { trigger: "[data-frame]", start: "top 78%", once: true } });
      tl.from("[data-bar='t']", { yPercent: -260, opacity: 0, duration: 0.9, ease: "expo.out" })
        .from("[data-bar='b']", { yPercent: 260, opacity: 0, duration: 0.9, ease: "expo.out" }, 0.05)
        .from("[data-bar='l']", { xPercent: -260, opacity: 0, duration: 0.9, ease: "expo.out" }, 0.1)
        .from("[data-bar='r']", { xPercent: 260, opacity: 0, duration: 0.9, ease: "expo.out" }, 0.15)
        .from("[data-photo]", { clipPath: "inset(50% 0 50% 0)", duration: 1, ease: "power3.inOut" }, 0.5)
        .from("[data-frame] [data-screw] svg", { rotate: -450, duration: 0.8, stagger: 0.05, ease: "power3.out" }, 0.7)
        .from("[data-cota]", { scaleX: 0, opacity: 0, duration: 0.8, stagger: 0.1, ease: "expo.out" }, 0.9);
    },
    { scope: root },
  );

  return (
    <section ref={root} id="sobre" className={styles.about} aria-labelledby="sobre-title">
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.portraitCol}>
          <div className={styles.cotaTop} data-cota aria-hidden="true">
            <span className="mono">Atenção</span>
          </div>
          <div className={styles.frame} data-frame>
            <span className={styles.barT} data-bar="t" aria-hidden="true" />
            <span className={styles.barB} data-bar="b" aria-hidden="true" />
            <span className={styles.barL} data-bar="l" aria-hidden="true" />
            <span className={styles.barR} data-bar="r" aria-hidden="true" />
            <Screw className={styles.s1} size={14} angle={20} />
            <Screw className={styles.s2} size={14} angle={65} />
            <Screw className={styles.s3} size={14} angle={110} />
            <Screw className={styles.s4} size={14} angle={155} />
            <div className={styles.photo} data-photo>
              {about.photo ? (
                <img src={asset(about.photo)} alt={about.photoAlt} loading="lazy" decoding="async" />
              ) : (
                <div className={styles.slot}>
                  <Turntable name="emblema" alt="Símbolo do Chaveiro DCR em 3D" className={styles.emblem} />
                  <p className="mono">Espaço reservado para a fotografia do profissional</p>
                </div>
              )}
            </div>
          </div>
          <div className={styles.cotaSide} data-cota aria-hidden="true">
            <span className="mono">Responsabilidade</span>
          </div>
        </div>

        <div className={styles.copy}>
          <SectionMark letter="H" label="Sobre" sheet="Folha 08 / 09" />
          <h2 id="sobre-title" className={styles.title}>
            <span className="display chrome">Experiência, conhecimento</span>{" "}
            <span className="serif">e dedicação em cada atendimento.</span>
          </h2>
          <LaserText as="p" className={styles.text}>
            {about.text}
          </LaserText>
          <div className={styles.sign}>
            <span className={styles.signLine} aria-hidden="true" />
            <div>
              <p className={styles.signName}>{about.name || "Chaveiro DCR"}</p>
              <p className="mono">{about.role}</p>
            </div>
          </div>
          <ul className={styles.values}>
            {["Atenção", "Responsabilidade", "Cuidado com o mecanismo"].map((v, i) => (
              <li key={v}>
                <span className="mono">{String(i + 1).padStart(2, "0")}</span>
                {v}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
