/** Peças de identidade animadas: sigilo giratório e nome com letras reveladas. */
import { useRef } from 'react';
import { LogoMark, cx } from './ui';

/** Sigilo do Além-Mar: anéis com marcações, losango e o logo no centro. */
export function Sigil({ size = 220, className, children }: { size?: number; className?: string; children?: React.ReactNode }) {
  const id = useRef(`s${Math.random().toString(36).slice(2, 8)}`).current;
  const ticks = Array.from({ length: 48 }, (_, i) => i);
  return (
    <div className={cx('relative grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg viewBox="-100 -100 200 200" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`${id}g`} x1="-100" y1="-100" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--vl-accent)' }} />
            <stop offset="1" style={{ stopColor: 'var(--vl-accent-2)' }} />
          </linearGradient>
        </defs>
        <g style={{ animation: 'vl-spin calc(28s * var(--vl-dur-mult)) linear infinite', transformOrigin: '0px 0px' }}>
          <circle r="96" fill="none" stroke={`url(#${id}g)`} strokeWidth="0.8" pathLength={1} className="vl-draw" opacity="0.8" />
          {ticks.map((i) => {
            const a = (i / ticks.length) * Math.PI * 2;
            const long = i % 4 === 0;
            return (
              <line
                key={i}
                x1={Math.cos(a) * 88}
                y1={Math.sin(a) * 88}
                x2={Math.cos(a) * (long ? 80 : 84)}
                y2={Math.sin(a) * (long ? 80 : 84)}
                stroke="var(--vl-accent)"
                strokeWidth={long ? 1.2 : 0.6}
                opacity={0.7}
                className="animate-fade-in"
                style={{ animationDelay: `${0.3 + i * 0.012}s`, animationFillMode: 'both' }}
              />
            );
          })}
        </g>
        <g style={{ animation: 'vl-spin-rev calc(18s * var(--vl-dur-mult)) linear infinite', transformOrigin: '0px 0px' }}>
          <circle r="72" fill="none" stroke="var(--vl-accent-2)" strokeWidth="0.6" strokeDasharray="2 6" opacity="0.6" />
          <path d="M0 -70 L70 0 L0 70 L-70 0 Z" fill="none" stroke={`url(#${id}g)`} strokeWidth="0.9" pathLength={1} className="vl-draw" style={{ animationDelay: '0.25s' }} />
          <path d="M0 -70 L70 0 L0 70 L-70 0 Z" fill="none" stroke="var(--vl-accent)" strokeWidth="0.5" pathLength={1} className="vl-draw" style={{ transform: 'rotate(45deg)', animationDelay: '0.45s' }} />
          {[0, 1, 2, 3].map((i) => (
            <circle key={i} cx={Math.cos((i * Math.PI) / 2 - Math.PI / 2) * 70} cy={Math.sin((i * Math.PI) / 2 - Math.PI / 2) * 70} r="2.4" fill="var(--vl-accent)" />
          ))}
        </g>
        <circle r="50" fill="none" stroke="var(--vl-accent)" strokeWidth="0.5" opacity="0.5" style={{ animation: 'vl-breathe 3s ease-in-out infinite', transformOrigin: '0px 0px' }} />
      </svg>
      <div className="relative">{children ?? <LogoMark size={size * 0.34} className="vl-glow-pulse" />}</div>
    </div>
  );
}

/** "Além-Mar" com letras surgindo uma a uma ("Mar" em destaque). */
export function AnimatedWordmark({ className, delay = 0.35 }: { className?: string; delay?: number }) {
  const letters = 'Além-Mar'.split('');
  return (
    <span className={cx('inline-flex font-display tracking-wide [perspective:400px]', className)} aria-label="Além-Mar">
      {letters.map((l, i) => (
        <span key={i} className={cx('vl-letter', i >= 5 && 'text-accent text-glow')} style={{ animationDelay: `${delay + i * 0.06}s` }} aria-hidden>
          {l}
        </span>
      ))}
    </span>
  );
}
