"use client";

import { useRef, useState } from "react";
import { goTo } from "@/components/layout/Navbar";
import { categoryIcon } from "@/components/ui/Icons";
import { LaserText } from "@/components/ui/LaserText";
import { PressButton } from "@/components/ui/PressButton";
import { Screw } from "@/components/ui/Screw";
import { SectionMark } from "@/components/ui/SectionMark";
import { Turntable } from "@/components/ui/Turntable";
import { activeCategories, type ServiceCategory } from "@/config/services";
import { preselect, type ContactOptionId } from "@/lib/events";
import { gsap, useGSAP } from "@/lib/gsap";
import styles from "./Services.module.css";

const toContact: Record<string, ContactOptionId> = {
  copias: "copia",
  automotivas: "automotiva",
  fechaduras: "fechadura",
  abertura: "abertura",
  seguranca: "instalacao",
};

export function Services() {
  const cats = activeCategories();
  const [open, setOpen] = useState<string>(cats[0]?.id ?? "");
  const root = useRef<HTMLElement>(null);

  // gavetas entram no gaveteiro, uma a uma, e "travam"
  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-drawer]", {
        x: 90,
        opacity: 0,
        duration: 1,
        ease: "back.out(1.4)",
        stagger: 0.09,
        scrollTrigger: { trigger: "[data-cabinet]", start: "top 82%", once: true },
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="servicos" className={styles.services} aria-labelledby="servicos-title">
      <div className={styles.bgLines} aria-hidden="true" />
      <header className={`wrap ${styles.head}`}>
        <SectionMark letter="B" label="Serviços" sheet="Folha 02 / 09" />
        <h2 id="servicos-title" className={`display chrome ${styles.title}`}>
          Serviços
        </h2>
        <div className={styles.intro}>
          <LaserText as="p" className={`serif ${styles.lead}`}>
            Cada coisa no seu lugar.
          </LaserText>
          <p className={styles.leadText}>
            Chaves, fechaduras e soluções de segurança organizadas como o gaveteiro de uma oficina. Abra uma gaveta para ver o que
            cada especialidade resolve.
          </p>
        </div>
      </header>

      <div className={`wrap ${styles.cabinet}`} data-cabinet>
        <div className={styles.cabinetHead} aria-hidden="true">
          <span className="mono">Gaveteiro DCR</span>
          <span className="mono">{String(cats.length).padStart(2, "0")} gavetas</span>
        </div>
        {cats.map((c, i) => (
          <Drawer key={c.id} cat={c} index={i} open={open === c.id} onToggle={() => setOpen((o) => (o === c.id ? "" : c.id))} />
        ))}
      </div>
    </section>
  );
}

function Drawer({ cat, index, open, onToggle }: { cat: ServiceCategory; index: number; open: boolean; onToggle: () => void }) {
  const body = useRef<HTMLDivElement>(null);
  const tray = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const Icon = categoryIcon[cat.icon];
  const consult = cat.items.every((i) => i.status === "consultar");

  useGSAP(
    () => {
      const el = body.current;
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (first.current) {
        first.current = false;
        gsap.set(el, { height: open ? "auto" : 0 });
        return;
      }
      if (open) {
        gsap.fromTo(el, { height: 0 }, { height: "auto", duration: reduce ? 0 : 0.75, ease: "expo.out" });
        if (!reduce)
          gsap.fromTo(
            tray.current,
            { rotateX: -16, y: -30, opacity: 0.2 },
            { rotateX: 0, y: 0, opacity: 1, duration: 0.9, ease: "back.out(1.6)" },
          );
      } else {
        gsap.to(el, { height: 0, duration: reduce ? 0 : 0.5, ease: "power3.inOut" });
      }
    },
    { dependencies: [open] },
  );

  const peek = cat.items.slice(0, 3);

  return (
    <article className={`${styles.drawer} ${open ? styles.isOpen : ""}`} data-drawer>
      <h3 className={styles.h3}>
        <button className={styles.front} aria-expanded={open} aria-controls={`gaveta-${cat.id}`} id={`gaveta-btn-${cat.id}`} onClick={onToggle}>
          <span className={styles.frontInner}>
            <Screw className={styles.sa} angle={index * 37} />
            <Screw className={styles.sb} angle={index * 53 + 20} />
            <span className={styles.holder} aria-hidden="true">
              <span className={styles.card}>
                <b>{cat.code}</b>
                <span className="mono">Gav. {String(index + 1).padStart(2, "0")}</span>
              </span>
            </span>
            <span className={styles.titles}>
              <span className={styles.catTitle}>
                <Icon size={20} className={styles.catIcon} />
                {cat.title}
                {consult && <em className={styles.consultTag}>sob consulta</em>}
              </span>
              <span className={styles.catDesc}>{cat.description}</span>
            </span>
            <span className={styles.peek} aria-hidden="true">
              {peek.map((p) => (
                <span key={p.name}>{p.name}</span>
              ))}
              {cat.items.length > 3 && <span className={styles.more}>+{cat.items.length - 3} serviços</span>}
            </span>
            <span className={styles.handle} aria-hidden="true">
              <span className={styles.bar} />
              <span className="mono">{open ? "Fechar" : "Abrir"}</span>
            </span>
          </span>
        </button>
      </h3>

      <div ref={body} id={`gaveta-${cat.id}`} role="region" aria-labelledby={`gaveta-btn-${cat.id}`} className={styles.body} inert={!open}>
        <div ref={tray} className={styles.tray}>
          <div className={styles.vitrine}>
            <span className={styles.corner} aria-hidden="true" />
            <Turntable name={cat.render} alt={`Ilustração 3D: ${cat.title}`} eager={open} className={styles.tt} />
            <span className={`mono ${styles.vitLabel}`}>Vista 360° · arraste</span>
          </div>
          <div className={styles.list}>
            <p className={`mono ${styles.listHead}`}>
              <span>Ref.</span>
              <span>Serviço</span>
              <span>Status</span>
            </p>
            <ul>
              {cat.items.map((it, n) => (
                <li key={it.name}>
                  <span className={`mono ${styles.ref}`}>
                    {cat.code}-{String(n + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.itemName}>
                    {it.name}
                    {it.note && <small> ({it.note})</small>}
                  </span>
                  <span className={`${styles.status} ${it.status === "consultar" ? styles.consult : ""}`}>
                    {it.status === "consultar" ? "Sob consulta" : "Disponível"}
                  </span>
                </li>
              ))}
            </ul>
            {cat.footnote && <p className={styles.footnote}>{cat.footnote}</p>}
            <PressButton
              href="#contato"
              variant="steel"
              onClick={(e) => {
                e.preventDefault();
                preselect(toContact[cat.id] ?? "outra");
                goTo("contato");
              }}
            >
              Solicitar este serviço
            </PressButton>
          </div>
        </div>
      </div>
    </article>
  );
}
