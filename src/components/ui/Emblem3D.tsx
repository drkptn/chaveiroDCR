import type { CSSProperties } from "react";
import { SYMBOL_PATH } from "@/components/brand/logoPaths";
import styles from "./Emblem3D.module.css";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill-rule="evenodd" d="${SYMBOL_PATH}"/></svg>`;
const MASK = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
const LAYERS = 16;

/**
 * Símbolo DCR "extrudado" em camadas CSS 3D: gira no compositor do navegador
 * (60 fps, sem WebGL, sem repintura). Faces cromadas com reflexo que desliza;
 * laterais em aço escuro dão a espessura.
 */
export function Emblem3D({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={`${styles.scene} ${className ?? ""}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <div className={styles.tilt} data-emblem-tilt>
        <div className={styles.spin}>
          {Array.from({ length: LAYERS }, (_, i) => {
            const face = i === 0 || i === LAYERS - 1;
            const shade = 0.42 + 0.2 * Math.sin((i / (LAYERS - 1)) * Math.PI);
            return (
              <span
                key={i}
                className={`${styles.layer} ${face ? styles.face : ""}`}
                style={
                  {
                    WebkitMaskImage: MASK,
                    maskImage: MASK,
                    transform: `translateZ(${((i - (LAYERS - 1) / 2) * 1.15).toFixed(2)}px)${i === 0 ? " rotateY(180deg)" : ""}`,
                    ["--shade" as string]: shade.toFixed(2),
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
      </div>
      <span className={styles.floor} aria-hidden="true" />
    </div>
  );
}
