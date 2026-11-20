/** Componentes base do design system do Além-Mar. */
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
import logoUrl from '../../assets/logo.svg';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* ─────────────── Logo ─────────────── */

/**
 * Logo do Além-Mar: o horizonte visto pela brecha de uma muralha rompida, com a luz
 * atravessando e o mar escuro embaixo. Arquivo único (src/assets/logo.svg), igual ao ícone do app.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <img src={logoUrl} width={size} height={size} alt="Além-Mar" draggable={false} className={cx('shrink-0 select-none', className)} style={{ width: size, height: size }} />;
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={cx('font-display font-bold tracking-tight', className)}>
      Além-<span className="gradient-text">Mar</span>
    </span>
  );
}

/* ─────────────── Botões ─────────────── */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'link';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }>(
  function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
    const base = 'vl-btn focus-ring inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap';
    const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]' };
    const variants: Record<BtnVariant, string> = {
      primary: 'vl-btn-primary gradient-accent text-accent-fg shadow-[0_6px_20px_-8px_var(--vl-accent)] hover:brightness-110',
      secondary: 'bg-bg-4/80 text-fg hover:bg-bg-5 border border-line-strong hover:border-accent/50',
      ghost: 'text-fg-1 hover:bg-bg-4 hover:text-fg',
      danger: 'bg-danger text-white hover:brightness-110',
      success: 'bg-success text-white hover:brightness-110',
      link: 'vl-btn-link text-accent-2 hover:underline h-auto px-0',
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
          'focus-ring grid size-8 place-items-center rounded-lg transition-all hover:-translate-y-px active:translate-y-0',
          danger ? 'text-danger hover:bg-danger/15' : active ? 'bg-bg-4 text-accent shadow-[0_0_14px_-6px_var(--vl-glow-color)]' : 'text-fg-1 hover:bg-bg-4 hover:text-fg',
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
            className="vl-pop pointer-events-none fixed z-[100] max-w-xs animate-pop-in rounded-lg border border-line-strong bg-bg-1/95 px-2.5 py-1.5 text-[13px] font-medium text-fg shadow-[var(--vl-shadow)] backdrop-blur-md"
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
        'vl-input h-10 w-full rounded-lg border bg-bg-1/80 px-3 text-sm text-fg outline-none placeholder:text-fg-2',
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
      className={cx('vl-input w-full resize-none rounded-lg border border-line bg-bg-1/80 px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-2', className)}
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
      className={cx('focus-ring relative h-6 w-10 shrink-0 rounded-full transition-all disabled:opacity-50', checked ? 'bg-accent shadow-[0_0_16px_-4px_var(--vl-glow-color)]' : 'bg-bg-5')}
    >
      <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all [transition-timing-function:var(--vl-ease-back)]', checked ? 'left-[18px] scale-100' : 'left-0.5 scale-90')} />
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
        <div className="gradient-accent absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full shadow-[0_0_12px_-2px_var(--vl-glow-color)]" style={{ width: `${pct}%` }} />
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
      className={cx('vl-input h-10 w-full cursor-pointer rounded-lg border border-line bg-bg-1/80 px-3 text-sm text-fg outline-none', className)}
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
    <div className="inline-flex flex-wrap rounded-lg border border-line bg-bg-1/80 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx('rounded-md px-3 py-1.5 text-[13px] font-medium transition-all', value === o.value ? 'bg-accent text-accent-fg shadow-[0_0_14px_-4px_var(--vl-glow-color)]' : 'text-fg-2 hover:bg-bg-4 hover:text-fg')}
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
      className={cx('relative inline-block shrink-0', speaking && 'vl-speaking', className)}
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
          className="vl-avatar size-full object-cover transition-shadow"
          style={{ background: 'var(--vl-bg-4)' }}
        />
      ) : (
        <span
          className="vl-avatar grid size-full place-items-center font-semibold text-white transition-shadow"
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
    <span className={cx('grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_10px_-2px_var(--vl-danger)] animate-pop-in', className)}>
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
  if (!label) return <div className="vl-rule my-2 h-px bg-line" />;
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
      <div className="vl-cut mb-4 grid size-16 place-items-center rounded-2xl border border-line-strong bg-bg-3/70 text-accent shadow-[0_0_30px_-10px_var(--vl-glow-color)] animate-pop-in">{icon}</div>
      <div className="font-heading text-xl text-fg">{title}</div>
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
    <div className="vl-backdrop fixed inset-0 z-50 grid place-items-center p-4 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx('vl-dialog relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-line-strong bg-bg-2', className)}
        style={{ maxWidth: width }}
      >
        {!bare && (
          <>
            <button onClick={onClose} className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-lg text-fg-2 transition hover:bg-bg-4 hover:text-fg" aria-label="Fechar">
              <X size={18} />
            </button>
            {title && (
              <div className="px-6 pb-2 pt-6">
                <h2 className="font-heading text-2xl font-semibold text-fg">{title}</h2>
                {subtitle && <p className="mt-1 text-sm text-fg-2">{subtitle}</p>}
              </div>
            )}
          </>
        )}
        <div className={cx('scroll-thin min-h-0 flex-1 overflow-y-auto', !bare && 'px-6 py-3')}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-bg-1/70 px-6 py-4">{footer}</div>}
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
    <div ref={ref} className={cx('vl-pop fixed z-[60] animate-pop-in', className)} style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}>
      {children}
    </div>,
    document.body,
  );
}
