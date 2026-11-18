import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '@vinlancord/shared';
import type { ClientMessage } from '../../store';
import { useUI, ui } from '../../store/ui';
import { editMessage } from '../../store/actions';
import { fromWire, toWire } from './mentions';

/** Edição inline (Enter salva, Esc cancela). */
export function MessageEditor({ m }: { m: ClientMessage }) {
  const [value, setValue] = useState(() => fromWire(m.content, m.guildId));
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 300) + 'px';
  }, []);
  const close = () => useUI.setState({ editing: null });
  const save = async () => {
    const content = toWire(value.trim(), m.guildId, m.channelId);
    close();
    if (content === m.content) return;
    try {
      await editMessage(m.channelId, m.id, content);
    } catch (e) {
      ui.error(e, 'Não foi possível editar');
    }
  };
  return (
    <div className="mt-1">
      <textarea
        ref={ref}
        value={value}
        maxLength={LIMITS.MESSAGE_MAX}
        onChange={(e) => {
          setValue(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
        className="scroll-thin w-full resize-none rounded-lg border border-line bg-bg-3 px-3 py-2 text-[15px] text-fg outline-none focus:border-accent"
        rows={1}
      />
      <div className="mt-1 text-xs text-fg-2">
        esc para <button className="text-accent-2 hover:underline" onClick={close}>cancelar</button> • enter para{' '}
        <button className="text-accent-2 hover:underline" onClick={() => void save()}>salvar</button>
      </div>
    </div>
  );
}
