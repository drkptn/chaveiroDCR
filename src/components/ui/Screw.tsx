import styles from "./Screw.module.css";

/** Parafuso Torx em SVG — a "assinatura" de fixação das placas do DCR. */
export function Screw({ className, angle = 0, size = 12 }: { className?: string; angle?: number; size?: number }) {
  return (
    <span className={`${styles.screw} ${className ?? ""}`} style={{ width: size, height: size }} aria-hidden="true" data-screw>
      <svg viewBox="0 0 20 20" style={{ transform: `rotate(${angle}deg)` }}>
        <defs>
          <radialGradient id="sh" cx="35%" cy="30%" r="80%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.35" stopColor="#c9d2da" />
            <stop offset="0.75" stopColor="#5a6570" />
            <stop offset="1" stopColor="#1a2027" />
          </radialGradient>
        </defs>
        <circle cx="10" cy="10" r="9.2" fill="url(#sh)" stroke="#0b0f14" strokeWidth="0.8" />
        <path
          d="M10 5.2l1.2 2.7 2.9-.8-.8 2.9 2.7 1.2-2.7 1.2.8 2.9-2.9-.8L10 17.2l-1.2-2.7-2.9.8.8-2.9-2.7-1.2 2.7-1.2-.8-2.9 2.9.8Z"
          transform="translate(0 -1.2) scale(1) "
          fill="#141a21"
        />
      </svg>
    </span>
  );
}
