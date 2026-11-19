/** Integração com o app nativo (Capacitor: Android/iOS). No navegador e no desktop não faz nada. */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useUI } from '../store/ui';
import { showNav, useMobile } from './mobile';

interface VlPinsPlugin {
  trust(opts: { host: string; pin: string }): Promise<void>;
}
const VlPins = registerPlugin<VlPinsPlugin>('VlPins');

export const isNative = () => Capacitor.isNativePlatform();

/** Confia no certificado próprio de um servidor (pinning nativo). */
export async function trustServerNative(url: string, pin: string) {
  await VlPins.trust({ host: new URL(url).hostname, pin });
}

/** Links vinlancord:// abertos no celular e o botão "voltar" do Android. */
export function initNative(onLink: (url: string) => void) {
  if (!isNative()) return;
  void App.getLaunchUrl().then((r) => r?.url && onLink(r.url));
  void App.addListener('appUrlOpen', (e) => onLink(e.url));
  void App.addListener('backButton', () => {
    const ui = useUI.getState();
    if (ui.modals.length) return useUI.setState({ modals: ui.modals.slice(0, -1) });
    const m = useMobile.getState();
    if (m.panel) return useMobile.setState({ panel: false });
    if (m.view === 'content') return showNav();
    void App.minimizeApp();
  });
}
