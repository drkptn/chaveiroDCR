import { useId } from "react";
import { SYMBOL_GROOVE, SYMBOL_PATH, SYMBOL_VIEWBOX } from "./logoPaths";
import styles from "./Logo.module.css";

export function Symbol({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox={SYMBOL_VIEWBOX} width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`c${id}`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.38" stopColor="#c9d2da" />
          <stop offset="0.49" stopColor="#4a5560" />
          <stop offset="0.53" stopColor="#1b2128" />
          <stop offset="0.62" stopColor="#7b8792" />
          <stop offset="1" stopColor="#eef2f5" />
        </linearGradient>
        <linearGradient id={`e${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#3a434d" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d={SYMBOL_PATH} fill={`url(#c${id})`} fillRule="evenodd" stroke={`url(#e${id})`} strokeWidth="0.6" />
      <path d={SYMBOL_GROOVE} stroke="#0b0f14" strokeWidth="1.4" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`${styles.logo} ${compact ? styles.compact : ""}`}>
      <Symbol size={compact ? 32 : 38} className={styles.symbol} />
      <span className={styles.word}>
        <span className={styles.small}>Chaveiro</span>
        <span className={styles.big}>DCR</span>
      </span>
    </span>
  );
}
