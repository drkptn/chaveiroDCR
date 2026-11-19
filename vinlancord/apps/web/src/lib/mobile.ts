/**
 * Layout de celular: em telas estreitas o app mostra uma coisa de cada vez —
 * a navegação (servidores + canais/conversas) ou o conteúdo (chat, chamada…).
 */
import { create } from 'zustand';

export const MOBILE_QUERY = '(max-width: 767px)';

/** Dentro do app nativo (Capacitor: Android/iOS). */
export const isNativeApp = () => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

const mq = typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY) : null;

export const useMobile = create<{ mobile: boolean; view: 'nav' | 'content'; panel: boolean }>()(() => ({
  mobile: !!mq?.matches,
  view: 'nav',
  panel: false,
}));

mq?.addEventListener('change', (e) => useMobile.setState({ mobile: e.matches }));

function apply() {
  const { mobile, view } = useMobile.getState();
  const d = document.documentElement.dataset;
  d.mobile = String(mobile);
  d.mview = view;
}
if (typeof document !== 'undefined') {
  apply();
  useMobile.subscribe(apply);
}

let keepNavUntil = 0;
/** Navegação feita pela barra de servidores: continua mostrando a lista de canais
 * (inclui o redirecionamento automático para o último canal do servidor). */
export const markRailNav = () => {
  keepNavUntil = Date.now() + 1000;
};
/** Chamado a cada mudança de rota: abrir um canal/conversa mostra o conteúdo. */
export function onRouteChange() {
  if (Date.now() < keepNavUntil) return;
  useMobile.setState({ view: 'content', panel: false });
}
export const showNav = () => useMobile.setState({ view: 'nav', panel: false });
/** Tocar num canal/conversa (mesmo o que já está aberto) mostra o conteúdo. */
export const showContent = () => useMobile.setState({ view: 'content', panel: false });
export const toggleMobilePanel = (open?: boolean) => useMobile.setState((s) => ({ panel: open ?? !s.panel }));

/** Compartilhar tela só existe onde o navegador suporta (não no Android/iOS). */
export const canShareScreen = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !isNativeApp() && !/Android|iPhone|iPad/i.test(navigator.userAgent);
