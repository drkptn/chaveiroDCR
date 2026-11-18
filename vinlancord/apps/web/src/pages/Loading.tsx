import { useEffect, useState } from 'react';
import { RefreshCw, LogOut } from 'lucide-react';
import { Button } from '../components/ui';
import { Sigil, AnimatedWordmark } from '../components/brand';
import { TitleBar } from '../components/layout/TitleBar';
import { gateway } from '../lib/gateway';
import { logout } from '../store/actions';
import { useStore } from '../store';

const PHRASES = [
  'Molhando a pena no tinteiro…',
  'Acendendo as tochas da muralha…',
  'Movendo as peças no tabuleiro…',
  'Afinando os microfones…',
  'Acordando os servidores…',
  'Conferindo quem está online…',
  'Separando os emojis favoritos…',
  'Desembolando os cabos…',
];

/** Tela de carregamento cinematográfica enquanto o gateway conecta e o READY chega. */
export function LoadingScreen() {
  const [i, setI] = useState(() => Math.floor(Math.random() * PHRASES.length));
  const [slow, setSlow] = useState(false);
  const conn = useStore((s) => s.conn);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % PHRASES.length), 2400);
    const s = setTimeout(() => setSlow(true), 9000);
    return () => {
      clearInterval(t);
      clearTimeout(s);
    };
  }, []);
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden">
        {/* barras de cinema que se abrem */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[14vh] origin-top bg-black" style={{ animation: 'vl-letterbox calc(1.1s * var(--vl-dur-mult)) var(--vl-ease) 0.2s both' }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[14vh] origin-bottom bg-black" style={{ animation: 'vl-letterbox calc(1.1s * var(--vl-dur-mult)) var(--vl-ease) 0.2s both' }} />
        <div className="relative flex flex-col items-center">
          <Sigil size={240} />
          <AnimatedWordmark className="mt-4 text-5xl text-fg" delay={0.5} />
          <div className="vl-rule mt-5 h-px w-56 bg-line" />
          <p key={i} className="mt-4 h-5 font-heading text-[15px] tracking-wide text-fg-1 animate-fade-in">
            {conn === 'reconnecting' || conn === 'offline' ? 'Tentando conectar ao servidor…' : PHRASES[i]}
          </p>
          {slow && (
            <div className="mt-8 flex flex-col items-center gap-3 animate-fade-in">
              <p className="max-w-xs text-center text-xs text-fg-2">Está demorando mais que o normal. Verifique sua conexão ou se o servidor está no ar.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => gateway.reconnectNow()}>Tentar de novo</Button>
                <Button size="sm" variant="ghost" icon={<LogOut size={14} />} onClick={() => void logout()}>Sair</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
