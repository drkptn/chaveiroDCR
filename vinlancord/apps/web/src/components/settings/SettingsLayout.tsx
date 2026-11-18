import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../ui';

export interface SettingsTab {
  id: string;
  label: string;
  section?: string;
  danger?: boolean;
  onClick?: () => void;
  hidden?: boolean;
}

/** Tela cheia de configurações com navegação lateral (padrão desktop). */
export function SettingsLayout({ tabs, active, onTab, onClose, children }: { tabs: SettingsTab[]; active: string; onTab: (id: string) => void; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  let lastSection: string | undefined;
  return createPortal(
    <div className="fixed inset-0 z-50 flex bg-bg-2 animate-fade-in" style={{ top: window.vinlancord ? 32 : 0 }}>
      <nav className="scroll-thin flex w-[34%] min-w-[220px] justify-end overflow-y-auto bg-bg-1 py-14 pr-2">
        <div className="w-[200px]">
          {tabs
            .filter((t) => !t.hidden)
            .map((t, i) => {
              const header = t.section && t.section !== lastSection ? t.section : null;
              lastSection = t.section ?? lastSection;
              return (
                <div key={t.id}>
                  {header && <div className={cx('mb-1 px-2.5 text-[11px] font-bold uppercase tracking-wider text-fg-2', i > 0 && 'mt-5 border-t border-line pt-4')}>{header.trim()}</div>}
                  <button
                    onClick={() => (t.onClick ? t.onClick() : onTab(t.id))}
                    className={cx(
                      'mb-0.5 flex h-8 w-full items-center rounded-md px-2.5 text-left text-[14.5px] font-medium transition',
                      active === t.id ? 'bg-bg-4 text-fg' : t.danger ? 'text-danger hover:bg-danger/10' : 'text-fg-1 hover:bg-bg-3 hover:text-fg',
                    )}
                  >
                    {t.label}
                  </button>
                </div>
              );
            })}
        </div>
      </nav>
      <div className="scroll-thin relative flex-1 overflow-y-auto">
        <div className="max-w-[760px] px-10 py-14 animate-slide-up" key={active}>
          {children}
        </div>
        <button onClick={onClose} className="fixed right-10 top-14 flex flex-col items-center gap-1 text-[11px] font-semibold text-fg-2 hover:text-fg" aria-label="Fechar">
          <span className="grid size-9 place-items-center rounded-full border-2 border-current"><X size={18} /></span>
          ESC
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-2xl font-bold text-fg">{children}</h2>
      {sub && <p className="mt-1 text-sm text-fg-2">{sub}</p>}
    </div>
  );
}

export function Card({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mb-6 rounded-2xl border border-line bg-bg-1 p-5', className)}>
      {title && <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-fg-2">{title}</h3>}
      {children}
    </section>
  );
}
