/** Painel "Voz conectada": qualidade, canal atual e controles rápidos da chamada. */
import { useNavigate } from 'react-router';
import { canShareScreen } from '../../lib/mobile';
import { PhoneOff, Video, VideoOff, MonitorUp, MonitorX, Signal, SignalLow, SignalMedium, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { ui } from '../../store/ui';
import { voice, useVoice } from '../../lib/voice/engine';
import { IconButton, Tooltip, cx } from '../ui';

export function VoicePanel() {
  const nav = useNavigate();
  const v = useVoice();
  const ch = useStore((s) => (v.channelId ? s.channels[v.channelId] : undefined));
  const guild = useStore((s) => (ch?.guildId ? s.guilds[ch.guildId] : undefined));
  const otherName = useStore((s) => {
    if (!ch || ch.guildId) return null;
    if (ch.type === 'group_dm') return ch.name || 'Grupo';
    const other = ch.recipients?.find((r) => r !== s.me?.id);
    return other ? s.users[other]?.displayName ?? 'Chamada' : 'Chamada';
  });
  if (!v.channelId || v.status === 'idle') return null;
  const connecting = v.status === 'connecting' || v.status === 'reconnecting';
  const color = connecting ? 'text-warning' : v.status === 'failed' ? 'text-danger' : v.quality === 'bad' ? 'text-danger' : v.quality === 'ok' ? 'text-warning' : 'text-success';
  const QIcon = v.quality === 'bad' ? SignalLow : v.quality === 'ok' ? SignalMedium : Signal;
  const label = v.status === 'connecting' ? 'Conectando…' : v.status === 'reconnecting' ? 'Reconectando…' : v.status === 'failed' ? 'Falha na conexão' : 'Voz conectada';
  const open = () => nav(ch?.guildId ? `/channels/${ch.guildId}/${ch.id}` : `/channels/@me/${v.channelId}`);
  return (
    <div className="shrink-0 border-t border-line bg-bg-0/40 px-2 py-2 animate-slide-up">
      <div className="flex items-center gap-1">
        <Tooltip label={v.ping !== null ? `Ping: ${v.ping} ms • Perda: ${v.loss.toFixed(1)}%` : 'Medindo conexão…'}>
          <span className={cx('grid size-7 place-items-center', color)}>{connecting ? <Loader2 size={17} className="animate-spin" /> : <QIcon size={17} />}</span>
        </Tooltip>
        <button onClick={open} className="min-w-0 flex-1 text-left">
          <div className={cx('truncate text-[13px] font-semibold', color)}>{label}</div>
          <div className="truncate text-[11.5px] text-fg-2 hover:underline">
            {ch?.guildId ? `${ch.name} / ${guild?.name ?? ''}` : otherName}
          </div>
        </button>
        <IconButton label="Desconectar" onClick={() => void voice.leave()} className="hover:text-danger">
          <PhoneOff size={18} />
        </IconButton>
      </div>
      <div className={cx('mt-1.5 grid gap-1.5', v.screen || canShareScreen() ? 'grid-cols-2' : 'grid-cols-1')}>
        <button
          onClick={() => void voice.setCamera(!v.camera).catch((e) => ui.error(e, 'Não foi possível abrir a câmera'))}
          className={cx('flex h-8 items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium transition', v.camera ? 'bg-accent text-accent-fg' : 'bg-bg-3 text-fg-1 hover:bg-bg-4 hover:text-fg')}
        >
          {v.camera ? <VideoOff size={15} /> : <Video size={15} />} {v.camera ? 'Câmera' : 'Câmera'}
        </button>
        {(v.screen || canShareScreen()) && <button
          onClick={() => (v.screen ? void voice.stopScreen() : canShareScreen() ? ui.open({ type: 'screenShare' }) : ui.error('Compartilhar a tela ainda não funciona no celular.'))}
          className={cx('flex h-8 items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium transition', v.screen ? 'bg-accent text-accent-fg' : 'bg-bg-3 text-fg-1 hover:bg-bg-4 hover:text-fg')}
        >
          {v.screen ? <MonitorX size={15} /> : <MonitorUp size={15} />} {v.screen ? 'Parar tela' : 'Tela'}
        </button>}
      </div>
    </div>
  );
}
