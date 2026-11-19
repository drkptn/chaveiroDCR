import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';
import { useMobile } from '../../lib/mobile';
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
  const mobile = useMobile((s) => s.mobile);
  // celular: primeiro a lista de abas, depois a aba escolhida (com voltar)
  const [showContent, setShowContent] = useState(false);
  let lastSection: string | undefined;
  return createPortal(
    <div className="fixed inset-0 z-50 flex bg-bg-0/75 backdrop-blur-2xl animate-fade-in" style={{ top: window.vinlancord ? 32 : 0 }}>
      <nav
        className={cx(
          'vl-subpanel scroll-thin flex justify-end overflow-y-auto border-r border-line py-14 pr-2',
          mobile ? (showContent ? 'hidden' : 'w-full justify-start px-4 py-6') : 'w-[34%] min-w-[220px]',
        )}
      >
        <div className={cx('vl-stagger', mobile ? 'w-full' : 'w-[210px]')}>
          {tabs
            .filter((t) => !t.hidden)
            .map((t, i) => {
              const header = t.section && t.section !== lastSection ? t.section : null;
              lastSection = t.section ?? lastSection;
              return (
                <div key={t.id}>
                  {header && <div className={cx('mb-1 px-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-accent/80', i > 0 && 'mt-5 border-t border-line pt-4')}>{header.trim()}</div>}
                  <button
                    onClick={() => {
                      if (t.onClick) return t.onClick();
                      onTab(t.id);
                      setShowContent(true);
                    }}
                    className={cx(
                      'mb-0.5 flex h-8 w-full items-center rounded-md px-2.5 text-left text-[14.5px] font-medium transition-all',
                      active === t.id
                        ? 'bg-gradient-to-r from-accent/25 to-bg-4/60 text-fg shadow-[inset_2px_0_0_var(--vl-accent)]'
                        : t.danger
                          ? 'text-danger hover:bg-danger/10'
                          : 'text-fg-1 hover:translate-x-0.5 hover:bg-bg-3/70 hover:text-fg',
                    )}
                  >
                    {t.label}
                  </button>
                </div>
              );
            })}
        </div>
      </nav>
      <div className={cx('scroll-thin relative flex-1 overflow-y-auto', mobile && !showContent && 'hidden')}>
        {mobile && (
          <button onClick={() => setShowContent(false)} className="sticky top-0 z-10 flex w-full items-center gap-2 bg-bg-1/90 px-4 py-3 text-sm font-medium text-fg-1 backdrop-blur" aria-label="Voltar para as configurações">
            <ArrowLeft size={18} /> Configurações
          </button>
        )}
        <div className={cx('vl-route max-w-[820px]', mobile ? 'px-4 py-5' : 'px-10 py-14')} key={active}>
          {children}
        </div>
        <button onClick={onClose} className="group fixed right-4 top-[calc(12px+env(safe-area-inset-top))] z-20 flex md:right-10 md:top-14 flex-col items-center gap-1 text-[11px] font-semibold text-fg-2 hover:text-accent" aria-label="Fechar">
          <span className="grid size-9 place-items-center rounded-full border-2 border-current transition-transform duration-300 group-hover:rotate-90"><X size={18} /></span>
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
      <h2 className="font-display text-3xl text-fg text-glow">{children}</h2>
      <div className="vl-rule mt-2 h-px w-40 bg-line" />
      {sub && <p className="mt-2 text-sm text-fg-2">{sub}</p>}
    </div>
  );
}

export function Card({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('vl-cut mb-6 rounded-2xl border border-line bg-bg-1/70 p-5 backdrop-blur-sm', className)}>
      {title && <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-fg-2">{title}</h3>}
      {children}
    </section>
  );
}
