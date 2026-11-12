"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevron, IconClose } from "@/components/ui/Icons";
import { SectionMark } from "@/components/ui/SectionMark";
import { galleryPhotos, type GalleryPhoto } from "@/config/content";
import { asset } from "@/lib/asset";
import { gsap, useGSAP } from "@/lib/gsap";
import styles from "./Gallery.module.css";

type Item = GalleryPhoto & { illustration?: boolean };

/** Enquanto não houver fotos reais, mostramos ilustrações 3D — sempre identificadas. */
const ILLUSTRATIONS: Item[] = [
  { src: "/renders/gal-cilindro.webp", alt: "Ilustração 3D de um cilindro de fechadura com a chave inserida", caption: "Cilindro e chave", illustration: true },
  { src: "/renders/gal-tetra.webp", alt: "Ilustração 3D de uma chave tetra", caption: "Chave tetra", illustration: true },
  { src: "/renders/gal-embutir.webp", alt: "Ilustração 3D de uma fechadura de embutir em corte", caption: "Fechadura de embutir", illustration: true },
  { src: "/renders/gal-gorje.webp", alt: "Ilustração 3D de uma chave gorje", caption: "Chave gorje", illustration: true },
  { src: "/renders/gal-digital.webp", alt: "Ilustração 3D de uma fechadura digital", caption: "Fechadura digital", illustration: true },
  { src: "/renders/gal-chaves.webp", alt: "Ilustração 3D de um conjunto de chaves", caption: "Conjunto de chaves", illustration: true },
];

export function Gallery() {
  const items: Item[] = galleryPhotos.length ? galleryPhotos : ILLUSTRATIONS;
  const real = galleryPhotos.length > 0;
  const [open, setOpen] = useState<number | null>(null);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.utils.toArray<HTMLElement>("[data-shot]").forEach((el, i) => {
        const img = el.querySelector("[data-img]");
        const scan = el.querySelector("[data-scan]");
        const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 85%", once: true }, delay: (i % 3) * 0.08 });
        tl.fromTo(img, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 1.2, ease: "power2.inOut" })
          .fromTo(scan, { top: "0%", opacity: 1 }, { top: "100%", duration: 1.2, ease: "power2.inOut" }, 0)
          .to(scan, { opacity: 0, duration: 0.3 }, 1.1);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="trabalhos" className={styles.gallery} aria-labelledby="galeria-title">
      <div className="wrap">
        <SectionMark letter="G" label="Trabalhos" sheet="Folha 07 / 09" />
        <div className={styles.head}>
          <h2 id="galeria-title" className={styles.title}>
            <span className="display chrome">Trabalho real,</span>{" "}
            <span className="serif">confiança real.</span>
          </h2>
          <p className={styles.lead}>
            {real
              ? "Registros de atendimentos realizados. Passe a lupa sobre os detalhes ou toque para ampliar."
              : "Em breve, fotos reais dos atendimentos. Por enquanto, ilustrações 3D dos mecanismos com que o Chaveiro DCR trabalha — passe a lupa ou toque para ampliar."}
          </p>
        </div>

        <ul className={styles.grid}>
          {items.map((it, i) => (
            <li key={it.src} className={styles[`g${(i % 6) + 1}`]} data-shot>
              <Shot
                item={it}
                index={i}
                onOpen={(x, y) => {
                  setOrigin({ x, y });
                  setOpen(i);
                }}
              />
            </li>
          ))}
        </ul>
      </div>
      {open !== null && <Viewer items={items} index={open} origin={origin} onClose={() => setOpen(null)} onIndex={setOpen} />}
    </section>
  );
}

function Shot({ item, index, onOpen }: { item: Item; index: number; onOpen: (x: number, y: number) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const lens = useRef<HTMLSpanElement>(null);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    const l = lens.current;
    if (!el || !l) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const Z = 2.4;
    l.style.transform = `translate(${x}px, ${y}px)`;
    l.style.backgroundSize = `${r.width * Z}px ${r.height * Z}px`;
    l.style.backgroundPosition = `${-(x * Z - 90)}px ${-(y * Z - 90)}px`;
  };

  return (
    <figure className={styles.figure}>
      <button
        ref={ref}
        className={styles.frame}
        onPointerMove={onMove}
        onClick={(e) => onOpen((e.clientX / window.innerWidth) * 100, (e.clientY / window.innerHeight) * 100)}
        aria-label={`Ampliar: ${item.alt}`}
        data-cursor="rotate"
      >
        <span className={styles.inner}>
          <img data-img src={asset(item.src)} alt={item.alt} loading="lazy" decoding="async" width={item.width ?? 1200} height={item.height ?? 900} />
          <span data-scan className={styles.scan} aria-hidden="true" />
          <span ref={lens} className={styles.lens} style={{ backgroundImage: `url(${asset(item.src)})` }} aria-hidden="true" />
          {item.illustration && <span className={`mono ${styles.tag}`}>Ilustração 3D</span>}
          <span className={`mono ${styles.idx}`}>{String(index + 1).padStart(2, "0")}</span>
        </span>
      </button>
      {item.caption && <figcaption className="mono">{item.caption}</figcaption>}
    </figure>
  );
}

function Viewer({ items, index, origin, onClose, onIndex }: { items: Item[]; index: number; origin: { x: number; y: number }; onClose: () => void; onIndex: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const touch = useRef(0);
  const [closing, setClosing] = useState(false);
  const it = items[index];
  const go = useCallback((d: number) => onIndex((index + d + items.length) % items.length), [index, items.length, onIndex]);
  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 380);
  }, [onClose]);

  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>("[data-close]")?.focus();
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      prevFocus.current?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>("button");
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, close]);

  return (
    <div
      ref={ref}
      className={`${styles.viewer} ${closing ? styles.closing : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Visualização ampliada"
      style={{ ["--ox" as string]: `${origin.x}%`, ["--oy" as string]: `${origin.y}%` }}
      onPointerDown={(e) => (touch.current = e.clientX)}
      onPointerUp={(e) => {
        const dx = e.clientX - touch.current;
        if (Math.abs(dx) > 60 && e.pointerType !== "mouse") go(dx < 0 ? 1 : -1);
      }}
    >
      <div className={styles.vTop}>
        <span className="mono">
          {String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
        </span>
        <button data-close className={styles.vBtn} onClick={close} aria-label="Fechar">
          <IconClose size={22} />
        </button>
      </div>
      <figure className={styles.vFig} key={it.src}>
        <img src={asset(it.src)} alt={it.alt} />
        <figcaption>
          {it.caption && <b>{it.caption}</b>}
          {it.illustration && <span className="mono">Ilustração 3D — não é foto de atendimento</span>}
        </figcaption>
      </figure>
      <button className={`${styles.vBtn} ${styles.vPrev}`} onClick={() => go(-1)} aria-label="Imagem anterior">
        <IconChevron dir="left" size={24} />
      </button>
      <button className={`${styles.vBtn} ${styles.vNext}`} onClick={() => go(1)} aria-label="Próxima imagem">
        <IconChevron size={24} />
      </button>
      <div className={styles.strip}>
        {items.map((x, i) => (
          <button key={x.src} onClick={() => onIndex(i)} aria-label={`Ver imagem ${i + 1}`} aria-current={i === index} className={i === index ? styles.sOn : ""}>
            <img src={asset(x.src)} alt="" />
          </button>
        ))}
      </div>
    </div>
  );
}
