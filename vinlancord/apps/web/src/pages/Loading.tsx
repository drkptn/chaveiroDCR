import { useEffect, useState } from 'react';
import { RefreshCw, LogOut } from 'lucide-react';
import { LogoMark, Wordmark, Button } from '../components/ui';
import { TitleBar } from '../components/layout/TitleBar';
import { gateway } from '../lib/gateway';
import { logout } from '../store/actions';
import { useStore } from '../store';

const PHRASES = [
  'Afinando os microfones…',
  'Acordando os servidores…',
  'Esquentando as caixas de som…',
  'Separando os emojis favoritos…',
  'Chamando a galera…',
  'Ajustando a câmera no melhor ângulo…',
  'Desembolando os cabos…',
  'Conferindo quem está online…',
];

/** Tela de carregamento enquanto o gateway conecta e o READY chega. */
export function LoadingScreen() {
  const [i, setI] = useState(() => Math.floor(Math.random() * PHRASES.length));
  const [slow, setSlow] = useState(false);
  const conn = useStore((s) => s.conn);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % PHRASES.length), 2200);
    const s = setTimeout(() => setSlow(true), 9000);
    return () => {
      clearInterval(t);
      clearTimeout(s);
    };
  }, []);
  return (
    <div className="flex h-full flex-col bg-bg-0">
      <TitleBar />
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden">
        <div className="absolute size-[420px] rounded-full bg-[#7c5cff]/20 blur-[110px]" />
        <div className="relative flex flex-col items-center">
          <div style={{ animation: 'logo-float 2.6s ease-in-out infinite' }}>
            <LogoMark size={88} className="drop-shadow-[0_18px_40px_rgba(124,92,255,0.45)]" />
          </div>
          <Wordmark className="mt-6 text-3xl text-fg" />
          <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-bg-3">
            <div className="h-full w-1/2 rounded-full gradient-accent" style={{ animation: 'shimmer 1.2s linear infinite', backgroundSize: '200% 100%' }} />
          </div>
          <p key={i} className="mt-4 h-5 text-sm text-fg-2 animate-fade-in">
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
