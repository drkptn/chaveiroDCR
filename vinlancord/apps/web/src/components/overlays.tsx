/** Camadas sobrepostas globais: menu de contexto, toasts, popout de perfil e modais. */
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronRight, Info, MessageSquare, PhoneIncoming, X, XCircle } from 'lucide-react';
import { useUI, ui, type MenuItem } from '../store/ui';
import { Avatar, Popover, Spinner, cx } from './ui';

const ModalRouter = lazy(() => import('./modals/ModalRouter'));
const ProfilePopout = lazy(() => import('./profile/ProfilePopout'));

export function ContextMenu() {
  const menu = useUI((s) => s.menu);
  if (!menu) return null;
  return <MenuList x={menu.x} y={menu.y} items={menu.items} root />;
}

function MenuList({ x, y, items, root }: { x: number; y: number; items: MenuItem[]; root?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [sub, setSub] = useState<{ i: number; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, root ? x - r.width : x - r.width * 2 - 4);
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - r.height - 8);
    setPos({ left, top });
  }, [x, y, root]);
  useEffect(() => {
    if (!root) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-menu]')) ui.closeMenu();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && ui.closeMenu();
    const t = setTimeout(() => {
      window.addEventListener('mousedown', close);
      window.addEventListener('contextmenu', close);
    }, 0);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', ui.closeMenu);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', ui.closeMenu);
    };
  }, [root]);
  return createPortal(
    <div
      ref={ref}
      data-menu
      className="vl-pop fixed z-[90] min-w-[200px] max-w-[280px] animate-pop-in rounded-xl border border-line-strong bg-bg-1/95 p-1.5 shadow-[var(--vl-shadow)] backdrop-blur-xl"
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it.separator) return <div key={i} className="vl-rule mx-1 my-1 h-px bg-line" />;
        if (it.render) return <div key={i} className="px-2 py-1.5">{it.render}</div>;
        return (
          <button
            key={i}
            disabled={it.disabled}
            onMouseEnter={(e) => {
              if (it.submenu) {
                const r = e.currentTarget.getBoundingClientRect();
                setSub({ i, x: r.right + 4, y: r.top - 6 });
              } else setSub(null);
            }}
            onClick={() => {
              if (it.submenu) return;
              ui.closeMenu();
              it.onClick?.();
            }}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] font-medium transition-all hover:pl-3 disabled:opacity-40',
              it.danger ? 'text-danger hover:bg-danger hover:text-white' : 'text-fg-1 hover:bg-accent hover:text-accent-fg hover:shadow-[0_0_16px_-6px_var(--vl-glow-color)]',
            )}
          >
            {it.icon && <span className="grid size-4 place-items-center opacity-90">{it.icon}</span>}
            <span className="flex-1 truncate">{it.label}</span>
            {it.hint && <span className="text-[11px] opacity-60">{it.hint}</span>}
            {it.checked !== undefined && <span className={cx('size-3.5 rounded border', it.checked ? 'border-current bg-current' : 'border-current opacity-60')} />}
            {it.submenu && <ChevronRight size={14} />}
          </button>
        );
      })}
      {sub && items[sub.i]?.submenu && <MenuList x={sub.x} y={sub.y} items={items[sub.i]!.submenu!} />}
    </div>,
    document.body,
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[95] flex w-[340px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => {
            t.onClick?.();
            ui.dismiss(t.id);
          }}
          className={cx(
            'vl-cut pointer-events-auto relative flex animate-slide-in-right items-start gap-3 overflow-hidden rounded-xl border bg-bg-1/95 p-3 shadow-[var(--vl-shadow)] backdrop-blur-xl',
            'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
            t.kind === 'error' ? 'border-danger/40 before:bg-danger' : t.kind === 'success' ? 'border-line-strong before:bg-success' : 'border-line-strong before:bg-accent before:shadow-[0_0_12px_var(--vl-accent)]',
            t.onClick && 'cursor-pointer hover:bg-bg-3',
          )}
        >
          {t.avatar ? (
            <Avatar userId={t.avatar.userId} size={36} />
          ) : (
            <span className={cx('mt-0.5', t.kind === 'error' ? 'text-danger' : t.kind === 'success' ? 'text-success' : 'text-accent')}>
              {t.kind === 'error' ? <XCircle size={20} /> : t.kind === 'success' ? <CheckCircle2 size={20} /> : t.kind === 'message' ? <MessageSquare size={20} /> : t.kind === 'call' ? <PhoneIncoming size={20} /> : <Info size={20} />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-fg">{t.title}</div>
            {t.body && <div className="mt-0.5 line-clamp-3 break-words text-[13px] text-fg-1">{t.body}</div>}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              ui.dismiss(t.id);
            }}
            className="text-fg-2 hover:text-fg"
            aria-label="Dispensar"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function ProfilePopoutLayer() {
  const popout = useUI((s) => s.popout);
  if (!popout) return null;
  return (
    <Popover anchor={popout.rect} onClose={ui.closePopout} placement={popout.rect.x > window.innerWidth / 2 ? 'left' : 'right'}>
      <Suspense fallback={<div className="grid h-40 w-72 place-items-center rounded-2xl bg-bg-1"><Spinner /></div>}>
        <ProfilePopout userId={popout.userId} guildId={popout.guildId} />
      </Suspense>
    </Popover>
  );
}

export function Modals() {
  const modals = useUI((s) => s.modals);
  if (!modals.length) return null;
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-black/40"><Spinner size={28} /></div>}>
      {modals.map((m) => (
        <ModalRouter key={m.key} spec={m} onClose={() => ui.close(m.key)} />
      ))}
    </Suspense>
  );
}

export function Overlays() {
  return (
    <>
      <Modals />
      <ProfilePopoutLayer />
      <ContextMenu />
      <Toasts />
    </>
  );
}
