/** Painel inferior: perfil, status, microfone, áudio e configurações. */
import { Mic, MicOff, Headphones, HeadphoneOff, Settings, Copy, Smile, Moon, MinusCircle, Circle, EyeOff } from 'lucide-react';
import type { UserStatus } from '@vinlancord/shared';
import { useStore } from '../../store';
import { ui } from '../../store/ui';
import { setStatus } from '../../store/actions';
import { voice, useVoice } from '../../lib/voice/engine';
import { api } from '../../lib/api';
import { Avatar, IconButton, STATUS_LABEL, usePresenceStatus } from '../ui';

export function UserPanel() {
  const me = useStore((s) => s.me);
  const status = usePresenceStatus(me?.id);
  const selfMute = useVoice((s) => s.selfMute);
  const selfDeaf = useVoice((s) => s.selfDeaf);
  const noMic = useVoice((s) => s.noMic);
  if (!me) return null;

  const statusMenu = (e: React.MouseEvent) => {
    const opt = (s: Exclude<UserStatus, 'offline'>, icon: React.ReactNode, hint?: string) => ({
      label: STATUS_LABEL[s],
      icon,
      hint,
      checked: me.status === s,
      onClick: () => void setStatus(s),
    });
    const r = e.currentTarget.getBoundingClientRect();
    ui.menu({ clientX: r.left, clientY: r.top - 250 }, [
      opt('online', <Circle size={14} className="fill-online text-online" />),
      opt('idle', <Moon size={14} className="fill-idle text-idle" />),
      opt('dnd', <MinusCircle size={14} className="text-dnd" />, 'sem notificações'),
      opt('invisible', <EyeOff size={14} />, 'aparecer offline'),
      { separator: true },
      { label: me.customStatus ? 'Editar status personalizado' : 'Definir status personalizado', icon: <Smile size={14} />, onClick: () => ui.open({ type: 'customStatus' }) },
      ...(me.customStatus ? [{ label: 'Limpar status personalizado', onClick: () => void api.put('/users/@me/custom-status', null) }] : []),
      { separator: true },
      { label: 'Copiar ID de usuário', icon: <Copy size={14} />, onClick: () => void navigator.clipboard.writeText(me.id) },
    ]);
  };

  return (
    <div className="flex h-[54px] shrink-0 items-center gap-1 border-t border-line bg-bg-0/60 px-2">
      <button onClick={statusMenu} className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left transition hover:bg-bg-4">
        <Avatar userId={me.id} size={34} status={status} ring="var(--vl-bg-1)" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13.5px] font-semibold text-fg">{me.displayName}</div>
          <div className="truncate text-[11.5px] text-fg-2">
            {me.customStatus ? `${me.customStatus.emoji ?? ''} ${me.customStatus.text ?? ''}`.trim() : status === 'offline' && me.status !== 'invisible' ? 'Conectando…' : STATUS_LABEL[me.status === 'invisible' ? 'invisible' : status]}
          </div>
        </div>
      </button>
      <IconButton
        label={noMic ? 'Microfone indisponível' : selfMute ? 'Ativar microfone' : 'Silenciar microfone'}
        onClick={() => void voice.setMute(!selfMute)}
        className={selfMute || noMic ? 'text-danger' : ''}
      >
        {selfMute || noMic ? <MicOff size={18} /> : <Mic size={18} />}
      </IconButton>
      <IconButton label={selfDeaf ? 'Ativar áudio' : 'Desativar áudio'} onClick={() => void voice.setDeaf(!selfDeaf)} className={selfDeaf ? 'text-danger' : ''}>
        {selfDeaf ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
      </IconButton>
      <IconButton label="Configurações" onClick={() => ui.open({ type: 'userSettings' })}>
        <Settings size={18} />
      </IconButton>
    </div>
  );
}
