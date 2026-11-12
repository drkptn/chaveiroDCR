"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { IconClose, IconWhatsapp } from "@/components/ui/Icons";
import { PressButton } from "@/components/ui/PressButton";
import { Screw } from "@/components/ui/Screw";
import { navigation, site } from "@/config/site";
import { whatsappLink } from "@/lib/whatsapp";
import { KeyProgress } from "./KeyProgress";
import styles from "./Navbar.module.css";

export function goTo(id: string) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (id === "inicio") {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    return;
  }
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("inicio");
  const panel = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const ids = ["inicio", "servicos", "especialidades", "sobre", "contato"];
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>("a, button");
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const nav = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (open) {
      setOpen(false);
      window.setTimeout(() => goTo(id), 380);
    } else goTo(id);
  };

  return (
    <header className={`${styles.nav} ${scrolled ? styles.scrolled : ""}`}>
      <div className={styles.glass} aria-hidden="true" />
      <div className={`wrap ${styles.row}`}>
        <a href="#inicio" className={styles.brand} onClick={(e) => nav(e, "inicio")} aria-label="Chaveiro DCR — início">
          <Logo compact={scrolled} />
        </a>

        <nav className={styles.links} aria-label="Navegação principal">
          {navigation.map((n) => (
            <a key={n.id} href={`#${n.id}`} onClick={(e) => nav(e, n.id)} className={active === n.id ? styles.on : ""} aria-current={active === n.id ? "true" : undefined}>
              <span className={styles.pin} aria-hidden="true" />
              {n.label}
            </a>
          ))}
        </nav>

        <div className={styles.cta}>
          <PressButton href={whatsappLink()} external variant="chrome" icon={<IconWhatsapp size={17} />} ariaLabel="Falar no WhatsApp">
            Atendimento
          </PressButton>
        </div>

        <button
          ref={toggleRef}
          className={styles.menuBtn}
          aria-expanded={open}
          aria-controls="quadro-de-chaves"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="mono">{open ? "Fechar" : "Menu"}</span>
          <span className={styles.burger} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      </div>
      <div className={`wrap ${styles.progress}`}>
        <KeyProgress />
      </div>

      {/* Menu mobile: um quadro de chaves com etiquetas penduradas */}
      <div
        id="quadro-de-chaves"
        ref={panel}
        className={`${styles.cabinet} ${open ? styles.open : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!open}
        inert={!open}
      >
        <div className={styles.door}>
          <Screw className={styles.s1} />
          <Screw className={styles.s2} />
          <Screw className={styles.s3} />
          <Screw className={styles.s4} />
          <div className={styles.cabHead}>
            <span className="mono">Quadro de chaves · DCR</span>
            <button className={styles.closeBtn} onClick={close} aria-label="Fechar menu">
              <IconClose size={20} />
            </button>
          </div>
          <ul className={styles.tags}>
            {navigation.map((n, i) => (
              <li key={n.id} style={{ ["--i" as string]: i }}>
                <span className={styles.hook} aria-hidden="true" />
                <a href={`#${n.id}`} onClick={(e) => nav(e, n.id)} className={styles.tag}>
                  <span className={styles.tagHole} aria-hidden="true" />
                  <span className={`mono ${styles.tagNo}`}>Nº {String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.tagLabel}>{n.label}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className={styles.cabFoot}>
            <PressButton href={whatsappLink()} external size="lg" icon={<IconWhatsapp size={18} />}>
              Solicitar atendimento
            </PressButton>
            <p className="mono">{site.tagline}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
