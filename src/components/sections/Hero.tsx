"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { goTo } from "@/components/layout/Navbar";
import { IconWhatsapp } from "@/components/ui/Icons";
import { PressButton } from "@/components/ui/PressButton";
import { hero } from "@/config/content";
import { asset } from "@/lib/asset";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { supportsWebGL, useMedia, useReducedMotion } from "@/lib/hooks";
import { KEYHOLE_CENTER, keyholeDataUri, keyholePath, KEYHOLE_BOX } from "@/lib/keyhole";
import { whatsappLink } from "@/lib/whatsapp";
import { heroState, smooth } from "@/three/scenes/heroState";
import styles from "./Hero.module.css";

const HeroScene = dynamic(() => import("@/three/scenes/HeroScene"), { ssr: false });

/** Fases do portal (rolagem do hero, 0→1). */
const PORTAL_START = 0.84;

export function Hero() {
  const track = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const rim = useRef<SVGSVGElement>(null);
  const reduce = useReducedMotion();
  const compact = useMedia("(max-width: 767px)");
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [mount3d, setMount3d] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    // apenas em desenvolvimento: ?freeze congela a cena (screenshots de QA)
    if (process.env.NODE_ENV !== "production" && location.search.includes("freeze")) {
      heroState.frozen = true;
      gsap.ticker.lagSmoothing(0);
    }
    const ok = supportsWebGL();
    setWebgl(ok);
    if (!ok) return;
    // monta o 3D depois da primeira pintura — o conteúdo nunca espera
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(() => setMount3d(true), { timeout: 600 });
    else window.setTimeout(() => setMount3d(true), 120);
  }, []);

  // pausa o render quando o hero sai de cena
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useGSAP(
    () => {
      const services = document.getElementById("servicos");
      // ---------- entrada: linhas chegam com motion blur horizontal ----------
      if (!reduce) {
        const blurs = gsap.utils.toArray<SVGFEGaussianBlurElement>("[data-mblur]");
        // a entrada anima o miolo ([data-in]); a saída por rolagem anima a linha — sem conflito
        const lines = ["0", "1", "2"].map((n) => root.current!.querySelector<HTMLElement>(`[data-line="${n}"] [data-in]`)!);
        const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
        lines.forEach((ln, i) => {
          const blur = blurs[i];
          const from = i % 2 === 0 ? -1 : 1;
          const proxy = { b: 60 };
          intro.fromTo(ln, { x: from * 220, opacity: 0 }, { x: 0, opacity: 1, duration: 1.3 }, 0.12 + i * 0.12);
          if (blur)
            intro.to(
              proxy,
              {
                b: 0,
                duration: 1.1,
                onUpdate: () => blur.setAttribute("stdDeviation", `${proxy.b.toFixed(1)} 0`),
                onComplete: () => ln.style.removeProperty("filter"),
              },
              0.12 + i * 0.12,
            );
        });
        intro.from("[data-fade]", { y: 18, opacity: 0, duration: 1, stagger: 0.08 }, 0.5);
        intro.from("[data-block] > *", { y: 24, opacity: 0, duration: 0.9, stagger: 0.06 }, 0.7);
      }

      if (reduce) return;

      // ---------- rolagem: a chave entra, gira e o site "destrava" ----------
      const exit = gsap.timeline({
        scrollTrigger: { trigger: track.current, start: "top top", end: "bottom bottom", scrub: 0.6 },
        defaults: { ease: "none" },
      });
      exit
        .to("[data-line='0']", { xPercent: -18, opacity: 0, filter: "blur(10px)", duration: 0.2 }, 0)
        .to("[data-line='1']", { xPercent: 14, opacity: 0, filter: "blur(10px)", duration: 0.2 }, 0.02)
        .to("[data-line='2']", { xPercent: -12, opacity: 0, filter: "blur(10px)", duration: 0.2 }, 0.04)
        .to("[data-fade]", { y: -30, opacity: 0, duration: 0.14, stagger: 0.01 }, 0)
        .to("[data-block]", { yPercent: 120, opacity: 0, duration: 0.14 }, 0)
        .fromTo("[data-hud]", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.06 }, 0.16)
        .to("[data-hud]", { opacity: 0, x: -24, duration: 0.06 }, 0.78)
        .fromTo("[data-unlock]", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.05 }, 0.66)
        .to("[data-unlock]", { opacity: 0, duration: 0.05 }, 0.82)
        .to({}, { duration: 0.0001 }, 1);

      const mask = keyholeDataUri();
      let shown = false;
      const st = ScrollTrigger.create({
        trigger: track.current,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          const p = self.progress;
          heroState.p = p;
          if (!services) return;
          const range = self.end - self.start;
          if (p < PORTAL_START || p >= 0.999) {
            if (shown) {
              shown = false;
              services.style.removeProperty("transform");
              services.style.removeProperty("-webkit-mask-image");
              services.style.removeProperty("mask-image");
              services.removeAttribute("data-portal");
            }
            services.style.visibility = p < PORTAL_START ? "hidden" : "";
            if (rim.current) rim.current.style.opacity = "0";
            return;
          }
          // portal aberto: serviços ficam presos no topo e aparecem pelo "buraco"
          shown = true;
          services.setAttribute("data-portal", "");
          services.style.visibility = "";
          services.style.transform = `translate3d(0, ${(-range * (1 - p)).toFixed(1)}px, 0)`;
          const k = smooth(PORTAL_START, 0.995, p);
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const cx = heroState.faceR > 0 ? heroState.faceX : vw / 2;
          const cy = heroState.faceR > 0 ? heroState.faceY : vh / 2;
          const s0 = Math.max(24, heroState.faceR > 0 ? heroState.faceR / 0.85 : vh * 0.14);
          const sEnd = (Math.hypot(Math.max(cx, vw - cx), Math.max(cy, vh - cy)) * 1.15) / 0.85;
          const s = s0 * Math.pow(sEnd / s0, k * k * (3 - 2 * k));
          const mw = s * KEYHOLE_BOX.w;
          const mh = s * KEYHOLE_BOX.h;
          const mx = cx - mw / 2;
          const my = cy - KEYHOLE_CENTER * mh;
          services.style.setProperty("-webkit-mask-image", mask);
          services.style.setProperty("mask-image", mask);
          services.style.setProperty("--mx", `${mx.toFixed(1)}px`);
          services.style.setProperty("--my", `${my.toFixed(1)}px`);
          services.style.setProperty("--mw", `${mw.toFixed(1)}px`);
          services.style.setProperty("--mh", `${mh.toFixed(1)}px`);
          if (rim.current) {
            rim.current.style.opacity = String(Math.min(1, k * 6));
            rim.current.style.transform = `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px)`;
            rim.current.style.width = `${mw.toFixed(1)}px`;
            rim.current.style.height = `${mh.toFixed(1)}px`;
          }
        },
      });
      if (services) services.style.visibility = "hidden";

      // ---------- HUD: leitura dos pinos em tempo real ----------
      let raf = 0;
      const bars = hud.current ? Array.from(hud.current.querySelectorAll<HTMLElement>("[data-gap]")) : [];
      const ins = hud.current?.querySelector<HTMLElement>("[data-insert]");
      const turn = hud.current?.querySelector<HTMLElement>("[data-turn]");
      const status = hud.current?.querySelector<HTMLElement>("[data-status]");
      const loop = () => {
        heroState.gaps.forEach((g, i) => {
          const b = bars[i];
          if (!b) return;
          const v = Math.max(-1, Math.min(1, g / 0.45));
          b.style.setProperty("--g", v.toFixed(3));
          b.toggleAttribute("data-ok", Math.abs(g) < 0.012);
        });
        if (ins) ins.textContent = `${String(Math.round(heroState.insert * 100)).padStart(3, "0")}%`;
        const deg = Math.round((heroState.turn / (Math.PI / 2)) * 90);
        if (turn) turn.textContent = `${String(deg).padStart(2, "0")}°`;
        if (status) {
          const open = deg >= 88;
          status.textContent = open ? "Liberado" : heroState.gaps.every((g) => Math.abs(g) < 0.012) ? "Alinhado" : "Travado";
          status.toggleAttribute("data-open", open);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(raf);
        st.kill();
        if (services) {
          services.style.removeProperty("transform");
          services.style.removeProperty("visibility");
          services.style.removeProperty("mask-image");
          services.style.removeProperty("-webkit-mask-image");
          services.removeAttribute("data-portal");
        }
      };
    },
    { scope: root, dependencies: [reduce], revertOnUpdate: true },
  );

  const poster = webgl === false || !ready;

  return (
    <div ref={track} className={`${styles.track} ${reduce ? styles.static : ""}`}>
      <section ref={root} id="inicio" className={styles.hero} aria-labelledby="hero-title">
        {/* ---------- prancha técnica (fundo) ---------- */}
        <div className={`${styles.sheet} blueprint`} aria-hidden="true">
          <div className={styles.glow} />
          <svg className={styles.drawing} viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
            <g fill="none" stroke="currentColor" strokeWidth="0.6">
              <circle cx="720" cy="330" r="210" strokeDasharray="4 6" />
              <circle cx="720" cy="330" r="150" />
              <circle cx="720" cy="330" r="104" strokeDasharray="2 4" />
              <path d="M450 330h560M720 80v520" strokeDasharray="18 6 2 6" />
              <path d="M140 120h260M140 120v40M400 120v40" />
              <path d="M600 540l240-410" strokeDasharray="1 5" />
            </g>
          </svg>
          <div className={styles.zonesTop}>
            {["1", "2", "3", "4", "5", "6", "7", "8"].map((z) => (
              <span key={z}>{z}</span>
            ))}
          </div>
          <div className={styles.zonesSide}>
            {["A", "B", "C", "D"].map((z) => (
              <span key={z}>{z}</span>
            ))}
          </div>
        </div>

        <h1 id="hero-title" className="sr-only">
          {hero.headline.join(" ")} — Chaveiro DCR, especialista em chaves e fechaduras.
        </h1>

        <svg className={styles.filters} aria-hidden="true" width="0" height="0">
          {[0, 1, 2].map((i) => (
            <filter key={i} id={`mblur${i}`} x="-20%" y="-10%" width="140%" height="120%">
              <feGaussianBlur data-mblur stdDeviation="0 0" />
            </filter>
          ))}
        </svg>

        {/* ---------- camada de trás (o 3D passa na frente) ---------- */}
        <div className={styles.back} aria-hidden="true">
          <p data-line="0" className={`display ${styles.l1}`}>
            <span data-in className="chrome" style={{ filter: reduce ? undefined : "url(#mblur0)" }}>
              {hero.headline[0]}
            </span>
          </p>
          <p data-line="2" className={`display ${styles.l3}`}>
            <span data-in style={{ filter: reduce ? undefined : "url(#mblur2)" }}>
              {hero.headline[2]}
            </span>
          </p>
        </div>

        {/* ---------- 3D ---------- */}
        <div className={styles.stage} aria-hidden="true">
          {poster && (
            <picture>
              <source media="(max-aspect-ratio: 19/20)" srcSet={asset("/renders/hero-tall.webp")} />
              <img className={styles.poster} src={asset("/renders/hero-wide.webp")} alt="" fetchPriority="high" decoding="async" />
            </picture>
          )}
          {mount3d && (
            <div className={`${styles.canvas} ${ready ? styles.ready : ""}`}>
              <HeroScene compact={compact} active={active} onReady={() => setReady(true)} />
            </div>
          )}
        </div>

        {/* ---------- camada da frente ---------- */}
        <div className={styles.front}>
          <div className={`wrap ${styles.topline}`} data-fade>
            <span className={styles.code}>DCR-01</span>
            <span className="mono">{hero.label}</span>
          </div>

          <p data-line="1" className={`serif ${styles.l2}`} aria-hidden="true">
            <span data-in style={{ filter: reduce ? undefined : "url(#mblur1)" }}>
              {hero.headline[1]}
            </span>
          </p>

          <div className={`wrap ${styles.lower}`}>
            <p className={styles.sub} data-fade>
              {hero.sub}
            </p>
            <div className={styles.actions} data-fade>
              <PressButton href={whatsappLink()} external size="lg" icon={<IconWhatsapp size={18} />}>
                Solicitar atendimento
              </PressButton>
              <PressButton
                href="#servicos"
                variant="steel"
                size="lg"
                onClick={(e) => {
                  e.preventDefault();
                  goTo("servicos");
                }}
              >
                Conhecer serviços
              </PressButton>
            </div>
          </div>

          {/* legenda técnica (title block) com os indicadores */}
          <div className={styles.block} data-block>
            {hero.indicators.map((t, i) => (
              <div key={t} className={styles.cell}>
                <span className="mono">{String.fromCharCode(65 + i)}.0{i + 1}</span>
                <b>{t}</b>
              </div>
            ))}
            <div className={`${styles.cell} ${styles.scrollCell}`}>
              <span className={styles.spring} aria-hidden="true">
                <i />
              </span>
              <span className="mono">Role para destravar</span>
            </div>
          </div>

          {/* HUD: leitura do segredo */}
          <div ref={hud} className={styles.hud} data-hud aria-hidden="true">
            <p className="mono">Leitura do segredo</p>
            <div className={styles.gauges}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className={styles.gauge} data-gap>
                  <span className={styles.track2} />
                  <span className={styles.marker} />
                  <span className="mono">P{i + 1}</span>
                </div>
              ))}
            </div>
            <dl>
              <div>
                <dt className="mono">Inserção</dt>
                <dd data-insert>000%</dd>
              </div>
              <div>
                <dt className="mono">Giro</dt>
                <dd data-turn>00°</dd>
              </div>
              <div>
                <dt className="mono">Status</dt>
                <dd data-status>Travado</dd>
              </div>
            </dl>
          </div>

          <p className={`display ${styles.unlock}`} data-unlock aria-hidden="true">
            Destravado
          </p>
        </div>

        {/* aro do portal */}
        <svg ref={rim} className={styles.rim} viewBox={`${KEYHOLE_BOX.x} ${KEYHOLE_BOX.y} ${KEYHOLE_BOX.w} ${KEYHOLE_BOX.h}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={keyholePath()} vectorEffect="non-scaling-stroke" />
        </svg>
      </section>
    </div>
  );
}
