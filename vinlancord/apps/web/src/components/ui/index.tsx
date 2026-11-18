/** Componentes base do design system do Vinlancord. */
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import type { VisibleStatus } from '@vinlancord/shared';
import { colorFromId, initials, staticImage } from '../../lib/format';
import { useStore } from '../../store';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* ─────────────── Logo ─────────────── */

export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const id = useRef(`g${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" className={className} aria-label="Vinlancord">
      <defs>
        <linearGradient id={`${id}a`} x1="10" y1="6" x2="118" y2="122" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9b6bff" />
          <stop offset=".5" stopColor="#5b5cf6" />
          <stop offset="1" stopColor="#1fc8e6" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="64" y1="4" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M64 4c38 0 60 4 60 60s-22 60-60 60S4 120 4 64 26 4 64 4z" fill={`url(#${id}a)`} />
      <path d="M64 4c38 0 60 4 60 60H4C4 8 26 4 64 4z" fill={`url(#${id}b)`} />
      <path d="M33 38 L58 91 Q64 102 70 91 L86 57" fill="none" stroke="#fff" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="95" cy="38" r="9.5" fill="#fff" />
      <path d="M106 22a22 22 0 0 1 6 18" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={cx('font-display font-bold tracking-tight', className)}>
      Vinlan<span className="gradient-text">cord</span>
    </span>
  );
}

/* ─────────────── Botões ─────────────── */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'link';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }>(
  function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
    const base = 'focus-ring inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap';
    const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]' };
    const variants: Record<BtnVariant, string> = {
      primary: 'gradient-accent text-accent-fg shadow-[0_6px_20px_-8px_var(--vl-accent)] hover:brightness-110',
      secondary: 'bg-bg-4 text-fg hover:bg-bg-5 border border-line',
      ghost: 'text-fg-1 hover:bg-bg-4 hover:text-fg',
      danger: 'bg-danger text-white hover:brightness-110',
      success: 'bg-success text-white hover:brightness-110',
      link: 'text-accent-2 hover:underline h-auto px-0',
    };
    return (
      <button ref={ref} className={cx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
        {children}
      </button>
    );
  },
);

export function IconButton({
  label,
  active,
  danger,
  className,
  children,
  tooltipSide = 'top',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; danger?: boolean; tooltipSide?: TooltipSide }) {
  return (
    <Tooltip label={label} side={tooltipSide}>
      <button
        aria-label={label}
        className={cx(
          'focus-ring grid size-8 place-items-center rounded-lg transition-colors duration-150',
          danger ? 'text-danger hover:bg-danger/15' : active ? 'bg-bg-4 text-fg' : 'text-fg-1 hover:bg-bg-4 hover:text-fg',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/* ─────────────── Tooltip ─────────────── */

type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export function Tooltip({ label, side = 'top', children, delay = 300 }: { label: ReactNode; side?: TooltipSide; children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    timer.current = setTimeout(() => {
      const el = ref.current?.firstElementChild ?? ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p =
        side === 'top' ? { x: r.left + r.width / 2, y: r.top - 8 } : side === 'bottom' ? { x: r.left + r.width / 2, y: r.bottom + 8 } : side === 'left' ? { x: r.left - 8, y: r.top + r.height / 2 } : { x: r.right + 10, y: r.top + r.height / 2 };
      setPos(p);
    }, delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setPos(null);
  };
  useEffect(() => hide, []);
  const transform = { top: 'translate(-50%, -100%)', bottom: 'translate(-50%, 0)', left: 'translate(-100%, -50%)', right: 'translate(0, -50%)' }[side];
  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} className="contents">
      {children}
      {pos &&
        label &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] max-w-xs animate-pop-in rounded-lg border border-line-strong bg-bg-1 px-2.5 py-1.5 text-[13px] font-medium text-fg shadow-[var(--vl-shadow)]"
            style={{ left: pos.x, top: pos.y, transform }}
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}

/* ─────────────── Campos ─────────────── */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        'h-10 w-full rounded-lg border bg-bg-1 px-3 text-sm text-fg outline-none transition placeholder:text-fg-2 focus:border-accent focus:ring-2 focus:ring-accent/25',
        invalid ? 'border-danger' : 'border-line',
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx('w-full resize-none rounded-lg border border-line bg-bg-1 px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-2 focus:border-accent focus:ring-2 focus:ring-accent/25', className)}
      {...rest}
    />
  );
});

export function Field({ label, error, hint, children, className }: { label: ReactNode; error?: string | null; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className={cx('mb-1.5 block text-xs font-semibold uppercase tracking-wide', error ? 'text-danger' : 'text-fg-1')}>
        {label}
        {error && <span className="ml-1 font-normal normal-case tracking-normal italic">— {error}</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-fg-2">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('focus-ring relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50', checked ? 'bg-accent' : 'bg-bg-5')}
    >
      <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all duration-200', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

export function SettingRow({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{title}</div>
        {description && <div className="mt-0.5 text-[13px] text-fg-2">{description}</div>}
      </div>
      {children}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  className,
  marker,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  className?: string;
  marker?: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <div className="relative h-5 flex-1">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-bg-5" />
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
        {marker !== undefined && <div className="absolute top-0 h-5 w-0.5 bg-warning" style={{ left: `${Math.max(0, Math.min(100, marker * 100))}%` }} />}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
        <div className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-white shadow" style={{ left: `${pct}%` }} />
      </div>
      {format && <span className="w-12 text-right text-xs tabular-nums text-fg-1">{format(value)}</span>}
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cx('h-10 w-full cursor-pointer rounded-lg border border-line bg-bg-1 px-3 text-sm text-fg outline-none focus:border-accent', className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-bg-1 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx('rounded-md px-3 py-1.5 text-[13px] font-medium transition', value === o.value ? 'bg-bg-4 text-fg shadow-sm' : 'text-fg-2 hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────── Avatar e status ─────────────── */

export const STATUS_LABEL: Record<VisibleStatus | 'invisible', string> = {
  online: 'Disponível',
  idle: 'Ausente',
  dnd: 'Não perturbe',
  offline: 'Offline',
  invisible: 'Invisível',
};

export function StatusDot({ status, size = 10, ring = 'var(--vl-bg-1)', className }: { status: VisibleStatus | 'invisible'; size?: number; ring?: string; className?: string }) {
  const color = { online: 'var(--vl-online)', idle: 'var(--vl-idle)', dnd: 'var(--vl-dnd)', offline: 'var(--vl-offline)', invisible: 'var(--vl-offline)' }[status];
  return (
    <span
      className={cx('relative inline-block shrink-0 rounded-full', className)}
      style={{ width: size, height: size, background: color, boxShadow: `0 0 0 ${Math.max(2, size / 4)}px ${ring}` }}
      title={STATUS_LABEL[status]}
    >
      {status === 'idle' && <span className="absolute rounded-full" style={{ width: size * 0.55, height: size * 0.55, left: -1, top: -1, background: ring }} />}
      {status === 'dnd' && <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--vl-bg-1)]" style={{ width: size * 0.6, height: Math.max(2, size * 0.2), background: ring }} />}
      {(status === 'offline' || status === 'invisible') && <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: size * 0.45, height: size * 0.45, background: ring }} />}
    </span>
  );
}

export function usePresenceStatus(userId: string | undefined): VisibleStatus {
  return useStore((s) => {
    if (!userId) return 'offline';
    if (userId === s.me?.id) {
      if (s.conn !== 'ready') return 'offline';
      return s.me.status === 'invisible' ? 'offline' : (s.me.status as VisibleStatus);
    }
    return s.presences[userId]?.status ?? 'offline';
  });
}

export function Avatar({
  userId,
  src,
  name,
  size = 40,
  status,
  ring,
  animate = false,
  speaking,
  className,
}: {
  userId: string;
  src?: string | null;
  name?: string;
  size?: number;
  status?: VisibleStatus | null;
  ring?: string;
  animate?: boolean;
  speaking?: boolean;
  className?: string;
}) {
  const user = useStore((s) => s.users[userId]);
  const url = src !== undefined ? src : user?.avatar;
  const label = name ?? user?.displayName ?? '?';
  const [hover, setHover] = useState(false);
  const [broken, setBroken] = useState(false);
  const shown = url && !broken ? (animate || hover ? url : staticImage(url)) : null;
  return (
    <span
      className={cx('relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {shown ? (
        <img
          src={shown}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className={cx('size-full rounded-full object-cover transition-shadow', speaking && 'speaking-ring')}
          style={{ background: 'var(--vl-bg-4)' }}
        />
      ) : (
        <span
          className={cx('grid size-full place-items-center rounded-full font-semibold text-white transition-shadow', speaking && 'speaking-ring')}
          style={{ background: user?.accentColor ?? colorFromId(userId), fontSize: size * 0.38 }}
        >
          {initials(label)}
        </span>
      )}
      {status && (
        <span className="absolute" style={{ right: -1, bottom: -1 }}>
          <StatusDot status={status} size={Math.max(8, Math.round(size * 0.3))} ring={ring} />
        </span>
      )}
    </span>
  );
}

export function GuildIcon({ guild, size = 48, className }: { guild: { id: string; name: string; icon: string | null }; size?: number; className?: string }) {
  const [hover, setHover] = useState(false);
  if (guild.icon)
    return (
      <img
        src={hover ? guild.icon : (staticImage(guild.icon) ?? undefined)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        alt=""
        draggable={false}
        className={cx('object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  return (
    <span className={cx('grid place-items-center font-semibold text-white', className)} style={{ width: size, height: size, background: colorFromId(guild.id), fontSize: size * 0.34 }}>
      {initials(guild.name)}
    </span>
  );
}

/* ─────────────── Diversos ─────────────── */

export function Badge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span className={cx('grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white', className)}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cx('animate-spin text-fg-2', className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line-strong bg-bg-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-1">{children}</kbd>;
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="my-2 h-px bg-line" />;
  return (
    <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-fg-2">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center animate-fade-in">
      <div className="mb-4 grid size-16 place-items-center rounded-2xl border border-line bg-bg-3 text-fg-2">{icon}</div>
      <div className="font-display text-lg font-semibold text-fg">{title}</div>
      {body && <div className="mt-1 max-w-sm text-sm text-fg-2">{body}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ─────────────── Modal ─────────────── */

export function Modal({
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 480,
  className,
  bare,
}: {
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  className?: string;
  bare?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px] animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx('relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-bg-2 shadow-[var(--vl-shadow)] animate-pop-in', className)}
        style={{ maxWidth: width }}
      >
        {!bare && (
          <>
            <button onClick={onClose} className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-lg text-fg-2 transition hover:bg-bg-4 hover:text-fg" aria-label="Fechar">
              <X size={18} />
            </button>
            {title && (
              <div className="px-6 pb-2 pt-6">
                <h2 className="font-display text-xl font-bold text-fg">{title}</h2>
                {subtitle && <p className="mt-1 text-sm text-fg-2">{subtitle}</p>}
              </div>
            )}
          </>
        )}
        <div className={cx('scroll-thin min-h-0 flex-1 overflow-y-auto', !bare && 'px-6 py-3')}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-bg-1 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ─────────────── Popover posicionado ─────────────── */

export function Popover({
  anchor,
  onClose,
  children,
  placement = 'right',
  offset = 8,
  className,
}: {
  anchor: { x: number; y: number; w: number; h: number };
  onClose: () => void;
  children: ReactNode;
  placement?: 'right' | 'left' | 'top' | 'bottom';
  offset?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = placement === 'right' ? anchor.x + anchor.w + offset : placement === 'left' ? anchor.x - r.width - offset : anchor.x + anchor.w / 2 - r.width / 2;
    let top = placement === 'top' ? anchor.y - r.height - offset : placement === 'bottom' ? anchor.y + anchor.h + offset : anchor.y;
    if (left + r.width > vw - 8) left = anchor.x - r.width - offset;
    if (left < 8) left = 8;
    if (top + r.height > vh - 8) top = vh - r.height - 8;
    if (top < 8) top = 8;
    setPos({ left, top });
  }, [anchor, placement, offset]);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('mousedown', down), 0);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className={cx('fixed z-[60] animate-pop-in', className)} style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}>
      {children}
    </div>,
    document.body,
  );
}
