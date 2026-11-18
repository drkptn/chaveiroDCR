import { useEffect, useState } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { desktop } from '../../lib/desktop';
import { LogoMark, Wordmark } from '../ui';
import { useStore } from '../../store';

/** Barra de título própria (janela sem moldura no desktop). No navegador não aparece. */
export function TitleBar() {
  const [max, setMax] = useState(false);
  const conn = useStore((s) => s.conn);
  useEffect(() => {
    if (!desktop) return;
    void desktop.window.isMaximized().then(setMax);
    return desktop.window.onMaximizeChange(setMax);
  }, []);
  if (!desktop) return null;
  const mac = desktop.platform === 'darwin';
  return (
    <div className="drag-region flex h-8 shrink-0 items-center justify-between bg-bg-0 pl-3 text-fg-2" onDoubleClick={() => desktop!.window.toggleMaximize()}>
      <div className={`flex items-center gap-2 ${mac ? 'pl-16' : ''}`}>
        <LogoMark size={16} />
        <Wordmark className="text-[13px] text-fg-1" />
        {conn === 'reconnecting' && <span className="ml-2 text-[11px] text-warning">reconectando…</span>}
      </div>
      {!mac && (
        <div className="no-drag flex h-full">
          <button className="grid h-full w-11 place-items-center transition hover:bg-bg-4 hover:text-fg" onClick={() => desktop!.window.minimize()} aria-label="Minimizar">
            <Minus size={15} />
          </button>
          <button className="grid h-full w-11 place-items-center transition hover:bg-bg-4 hover:text-fg" onClick={() => desktop!.window.toggleMaximize()} aria-label="Maximizar">
            {max ? <Copy size={12} className="-scale-x-100" /> : <Square size={12} />}
          </button>
          <button className="grid h-full w-11 place-items-center transition hover:bg-danger hover:text-white" onClick={() => desktop!.window.close()} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
