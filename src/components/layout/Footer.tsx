"use client";

import { useRef, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { IconInstagram, IconWhatsapp } from "@/components/ui/Icons";
import { LaserText } from "@/components/ui/LaserText";
import { PressButton } from "@/components/ui/PressButton";
import { Turntable } from "@/components/ui/Turntable";
import { activeCategories } from "@/config/services";
import { navigation, site } from "@/config/site";
import { whatsappLink } from "@/lib/whatsapp";
import { goTo } from "./Navbar";
import styles from "./Footer.module.css";

export function Footer() {
  const [spin, setSpin] = useState<number | undefined>(undefined);
  const ref = useRef<HTMLElement>(null);
  const year = new Date().getFullYear();

  return (
    <footer
      ref={ref}
      className={styles.footer}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        setSpin((e.clientX - r.left) / r.width);
      }}
      onPointerLeave={() => setSpin(undefined)}
    >
      <div className={styles.lines} aria-hidden="true" />
      <div className={`wrap ${styles.top}`}>
        <LaserText as="p" className={`display ${styles.closing}`}>
          Chaveiro DCR. Precisão em cada detalhe. Confiança em cada serviço.
        </LaserText>
        <div className={styles.emblem} aria-hidden="true">
          <Turntable name="emblema" alt="" auto progress={spin} />
        </div>
      </div>

      <div className={`wrap ${styles.cols}`}>
        <div className={styles.brand}>
          <Logo />
          <p>Serviços especializados em chaves, fechaduras e soluções de segurança — com conhecimento técnico e cuidado em cada atendimento.</p>
          <PressButton href={whatsappLink()} external icon={<IconWhatsapp size={17} />}>
            Falar no WhatsApp
          </PressButton>
        </div>
        <nav aria-label="Rodapé">
          <p className="mono">Navegação</p>
          <ul>
            {navigation.map((n) => (
              <li key={n.id}>
                <a
                  href={`#${n.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(n.id);
                  }}
                >
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="mono">Serviços</p>
          <ul>
            {activeCategories().map((c) => (
              <li key={c.id}>
                <a
                  href="#servicos"
                  onClick={(e) => {
                    e.preventDefault();
                    goTo("servicos");
                  }}
                >
                  {c.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mono">Contato</p>
          <ul>
            {site.contact.whatsapp && (
              <li>
                <a href={whatsappLink()} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </li>
            )}
            {site.contact.phoneDisplay && <li>{site.contact.phoneDisplay}</li>}
            {site.contact.area && <li>{site.contact.area}</li>}
            {site.contact.instagram && (
              <li>
                <a href={`https://instagram.com/${site.contact.instagram}`} target="_blank" rel="noopener noreferrer" className={styles.insta}>
                  <IconInstagram size={16} /> @{site.contact.instagram}
                </a>
              </li>
            )}
            <li>
              <a
                href="#contato"
                onClick={(e) => {
                  e.preventDefault();
                  goTo("contato");
                }}
              >
                Solicitar atendimento
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className={styles.giant} aria-hidden="true">
        DCR
      </div>

      <div className={`wrap ${styles.bottom}`}>
        <span className="mono">© {year} Chaveiro DCR. Todos os direitos reservados.</span>
        <span className="mono">Prancha 09/09 · Escala 1:1</span>
      </div>
    </footer>
  );
}
