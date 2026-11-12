import styles from "./SectionMark.module.css";

/**
 * Balão de cota de desenho técnico — marca cada seção com uma letra (detalhe A, B, C…)
 * e uma linha de chamada. Substitui o tradicional "01 — label".
 */
export function SectionMark({ letter, label, sheet, align = "left" }: { letter: string; label: string; sheet?: string; align?: "left" | "center" }) {
  return (
    <div className={`${styles.mark} ${align === "center" ? styles.center : ""}`} data-mark>
      <span className={styles.balloon} aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18.5" />
          <path d="M20 1.5v4M20 34.5v4M1.5 20h4M34.5 20h4" />
        </svg>
        <b>{letter}</b>
      </span>
      <span className={styles.leader} aria-hidden="true" />
      <span className={styles.label}>
        <span className="mono">Detalhe {letter}</span>
        <span className={styles.name}>{label}</span>
      </span>
      {sheet && <span className={`mono ${styles.sheet}`}>{sheet}</span>}
    </div>
  );
}
