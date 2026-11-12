"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { IconClock, IconInstagram, IconPhone, IconPin, IconWhatsapp } from "@/components/ui/Icons";
import { LaserText } from "@/components/ui/LaserText";
import { PressButton } from "@/components/ui/PressButton";
import { SectionMark } from "@/components/ui/SectionMark";
import { site } from "@/config/site";
import { SELECT_EVENT, type ContactOptionId } from "@/lib/events";
import { gsap } from "@/lib/gsap";
import { useMedia } from "@/lib/hooks";
import { formatPhone, whatsappLink } from "@/lib/whatsapp";
import styles from "./Contact.module.css";

const OPTIONS: { id: ContactOptionId; label: string; phrase: string; code: string }[] = [
  { id: "copia", label: "Preciso fazer uma cópia de chave", phrase: "uma cópia de chave", code: "CP" },
  { id: "fechadura", label: "Estou com problemas na fechadura", phrase: "um problema na fechadura", code: "FC" },
  { id: "abertura", label: "Preciso de uma abertura de porta", phrase: "uma abertura de porta", code: "AB" },
  { id: "automotiva", label: "Preciso de uma chave automotiva", phrase: "uma chave automotiva", code: "AU" },
  { id: "instalacao", label: "Quero instalar uma fechadura", phrase: "a instalação de uma fechadura", code: "IN" },
  { id: "outra", label: "Tenho outra necessidade", phrase: "outra necessidade", code: "OT" },
];

/** ângulos (graus, 0 = topo, horário) para onde o ponteiro do dial aponta */
const ANGLES = [-62, -34, -8, 18, 44, 70];
const MAX = 500;

export function buildMessage(opt: (typeof OPTIONS)[number] | undefined, details: string) {
  let msg = site.whatsappGreeting;
  if (opt) msg += opt.id === "outra" ? " Tenho outra necessidade e gostaria de uma orientação." : ` Preciso de ajuda com ${opt.phrase}.`;
  const d = details.trim();
  if (d) msg += `\n\nDetalhes: ${d}`;
  return msg;
}

export function Contact() {
  const [sel, setSel] = useState<number>(-1);
  const [details, setDetails] = useState("");
  const knob = useRef<HTMLDivElement>(null);
  const core = useRef<HTMLDivElement>(null);
  const dial = useRef<HTMLDivElement>(null);
  const angle = useRef({ v: -90 });
  const vertical = useMedia("(max-width: 1023px)");
  const descId = useId();

  const rotateTo = useCallback((deg: number, snappy = true) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.to(angle.current, {
      v: deg,
      duration: reduce ? 0 : snappy ? 0.9 : 0.2,
      ease: snappy ? "back.out(2.4)" : "power2.out",
      onUpdate: () => knob.current?.style.setProperty("--a", `${angle.current.v}deg`),
    });
  }, []);

  const choose = useCallback(
    (i: number) => {
      setSel(i);
      rotateTo(vertical ? -150 + i * 60 : ANGLES[i] + 90);
      if (core.current) {
        core.current.classList.remove(styles.pulse);
        void core.current.offsetWidth;
        core.current.classList.add(styles.pulse);
      }
    },
    [rotateTo, vertical],
  );

  // pré-seleção vinda das gavetas de serviço
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<ContactOptionId>).detail;
      const i = OPTIONS.findIndex((o) => o.id === id);
      if (i >= 0) window.setTimeout(() => choose(i), 700);
    };
    window.addEventListener(SELECT_EVENT, on);
    return () => window.removeEventListener(SELECT_EVENT, on);
  }, [choose]);

  // girar o dial com o dedo/mouse e soltar no serviço mais próximo
  useEffect(() => {
    const el = dial.current;
    if (!el) return;
    let dragging = false;
    const angleAt = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 90;
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const a = angleAt(e);
      angle.current.v = a;
      knob.current?.style.setProperty("--a", `${a}deg`);
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const a = angleAt(e);
      const targets = vertical ? OPTIONS.map((_, i) => -150 + i * 60) : ANGLES.map((x) => x + 90);
      let best = 0;
      let bestD = Infinity;
      targets.forEach((t, i) => {
        const d = Math.abs(((((a - t) % 360) + 540) % 360) - 180);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      choose(best);
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
  }, [choose, vertical]);

  const opt = sel >= 0 ? OPTIONS[sel] : undefined;
  const message = buildMessage(opt, details);
  const c = site.contact;
  const slots = [
    { k: "WhatsApp", v: c.whatsapp ? formatPhone(c.whatsapp) : "", href: c.whatsapp ? whatsappLink() : "", Icon: IconWhatsapp },
    { k: "Telefone", v: c.phoneDisplay || (c.phone ? formatPhone(c.phone) : ""), href: c.phone ? `tel:+${c.phone.replace(/\D/g, "")}` : "", Icon: IconPhone },
    { k: "Região de atendimento", v: c.area, href: "", Icon: IconPin },
    { k: "Horário", v: c.hours.map((h) => `${h.days}: ${h.hours}`).join(" · "), href: "", Icon: IconClock },
    { k: "Instagram", v: c.instagram ? `@${c.instagram}` : "", href: c.instagram ? `https://instagram.com/${c.instagram}` : "", Icon: IconInstagram },
  ].filter((s) => s.v || site.showPendingSlots);

  return (
    <section id="contato" className={styles.contact} aria-labelledby="contato-title">
      <div className={styles.rings} aria-hidden="true" />
      <div className="wrap">
        <SectionMark letter="I" label="Contato" sheet="Folha 09 / 09" />
        <header className={styles.head}>
          <h2 id="contato-title" className={styles.title}>
            <span className="display chrome">Precisa de uma solução?</span>{" "}
            <span className="serif">Vamos resolver.</span>
          </h2>
          <LaserText as="p" className={styles.lead}>
            Conte o que aconteceu. Estamos prontos para entender sua necessidade e orientar você.
          </LaserText>
        </header>

        <div className={styles.panel}>
          {/* ---------- dial de cofre ---------- */}
          <div className={styles.dialCol}>
            <div ref={dial} className={styles.dial} data-cursor="rotate" aria-hidden="true">
              <div className={styles.bezel}>
                <svg viewBox="0 0 200 200">
                  {Array.from({ length: 100 }, (_, i) => (
                    <line key={i} x1="100" y1={i % 10 === 0 ? 7 : 10} x2="100" y2="15" transform={`rotate(${i * 3.6} 100 100)`} className={i % 10 === 0 ? styles.major : ""} />
                  ))}
                  {Array.from({ length: 10 }, (_, i) => (
                    <text key={i} x="100" y="26" transform={`rotate(${i * 36} 100 100)`}>
                      {i * 10}
                    </text>
                  ))}
                </svg>
              </div>
              <div ref={knob} className={styles.knob}>
                <span className={styles.pointer} />
              </div>
              <div ref={core} className={`${styles.core} ${opt ? styles.coreOn : ""}`}>
                <span className={styles.keyway} />
              </div>
              <span className={`${styles.led} ${opt ? styles.ledOn : ""}`} />
            </div>
            <p className={`mono ${styles.dialHint}`}>Gire o dial ou escolha ao lado</p>
          </div>

          {/* ---------- seleção + console ---------- */}
          <div className={styles.side}>
            <fieldset className={styles.options}>
              <legend className="mono">1 · Qual é a sua necessidade?</legend>
              <div role="radiogroup" aria-label="Tipo de atendimento" className={styles.optList}>
                {OPTIONS.map((o, i) => (
                  <button
                    key={o.id}
                    role="radio"
                    aria-checked={sel === i}
                    tabIndex={sel === i || (sel < 0 && i === 0) ? 0 : -1}
                    className={`${styles.opt} ${sel === i ? styles.optOn : ""}`}
                    onClick={() => choose(i)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                        e.preventDefault();
                        const n = (i + 1) % OPTIONS.length;
                        choose(n);
                        (e.currentTarget.parentElement?.children[n] as HTMLElement)?.focus();
                      }
                      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                        e.preventDefault();
                        const n = (i - 1 + OPTIONS.length) % OPTIONS.length;
                        choose(n);
                        (e.currentTarget.parentElement?.children[n] as HTMLElement)?.focus();
                      }
                    }}
                  >
                    <span className={`mono ${styles.optCode}`}>{o.code}</span>
                    <span>{o.label}</span>
                    <span className={styles.optPin} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </fieldset>

            <div className={styles.console}>
              <div className={styles.status}>
                <span className={`${styles.dot} ${opt ? styles.dotOn : ""}`} />
                <span className="mono">{opt ? `Pronto · ${opt.code}` : "Aguardando seleção"}</span>
              </div>
              <label htmlFor={descId} className="mono">
                2 · Descreva o problema <span className={styles.opt2}>(opcional)</span>
              </label>
              <textarea
                id={descId}
                value={details}
                maxLength={MAX}
                rows={3}
                placeholder="Ex.: a chave entra mas não gira; perdi a chave do portão…"
                onChange={(e) => setDetails(e.target.value)}
                aria-describedby={`${descId}-count`}
              />
              <p id={`${descId}-count`} className={`mono ${styles.count}`}>
                {details.length}/{MAX}
              </p>
              <div className={styles.ticket} aria-live="polite">
                <span className="mono">Mensagem que será enviada</span>
                <p>{message}</p>
              </div>
              <PressButton href={whatsappLink(message)} external size="lg" icon={<IconWhatsapp size={18} />} className={`${styles.go} ${opt ? styles.goOn : ""}`}>
                Iniciar atendimento
              </PressButton>
            </div>
          </div>
        </div>

        {slots.length > 0 && (
          <ul className={styles.slots}>
            {slots.map((s) => (
              <li key={s.k}>
                <s.Icon size={20} />
                <span className="mono">{s.k}</span>
                {s.v ? (
                  s.href ? (
                    <a href={s.href} target={s.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                      {s.v}
                    </a>
                  ) : (
                    <b>{s.v}</b>
                  )
                ) : (
                  <em>a definir</em>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
