/** Configurações locais do dispositivo (áudio, vídeo, atalhos…), persistidas no localStorage. */
import { create } from 'zustand';
import type { ThemeDef } from '../lib/themes';

export type KeybindAction =
  | 'toggleMute'
  | 'toggleDeafen'
  | 'toggleCamera'
  | 'toggleScreen'
  | 'disconnectVoice'
  | 'openSettings'
  | 'quickSwitcher'
  | 'search'
  | 'prevChannel'
  | 'nextChannel'
  | 'prevServer'
  | 'nextServer'
  | 'markRead'
  | 'pushToTalk';

export const KEYBIND_LABELS: Record<KeybindAction, { label: string; global?: boolean }> = {
  toggleMute: { label: 'Ativar/desativar microfone', global: true },
  toggleDeafen: { label: 'Ativar/desativar áudio', global: true },
  toggleCamera: { label: 'Ativar/desativar câmera', global: true },
  toggleScreen: { label: 'Compartilhar tela / parar' },
  disconnectVoice: { label: 'Sair da chamada' },
  pushToTalk: { label: 'Aperte para falar (segure)' },
  openSettings: { label: 'Abrir configurações' },
  quickSwitcher: { label: 'Busca rápida (canais e conversas)' },
  search: { label: 'Pesquisar mensagens' },
  prevChannel: { label: 'Canal anterior' },
  nextChannel: { label: 'Próximo canal' },
  prevServer: { label: 'Servidor anterior' },
  nextServer: { label: 'Próximo servidor' },
  markRead: { label: 'Marcar canal como lido' },
};

export const DEFAULT_KEYBINDS: Record<KeybindAction, string> = {
  toggleMute: 'Ctrl+Shift+M',
  toggleDeafen: 'Ctrl+Shift+D',
  toggleCamera: 'Ctrl+Shift+V',
  toggleScreen: 'Ctrl+Shift+S',
  disconnectVoice: 'Ctrl+Shift+E',
  pushToTalk: '',
  openSettings: 'Ctrl+,',
  quickSwitcher: 'Ctrl+K',
  search: 'Ctrl+F',
  prevChannel: 'Alt+ArrowUp',
  nextChannel: 'Alt+ArrowDown',
  prevServer: 'Ctrl+Alt+ArrowUp',
  nextServer: 'Ctrl+Alt+ArrowDown',
  markRead: 'Escape',
};

export type ScreenQuality = '720p30' | '1080p30' | '1080p60' | '1440p60' | 'source';
export type ScreenCodec = 'auto' | 'h264' | 'vp9' | 'vp8';

export interface LocalSettings {
  inputDeviceId: string;
  outputDeviceId: string;
  videoDeviceId: string;
  inputVolume: number;
  outputVolume: number;
  inputMode: 'vad' | 'ptt';
  vadAuto: boolean;
  vadThreshold: number;
  pttReleaseDelay: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  cameraQuality: '480p' | '720p' | '1080p';
  mirrorCamera: boolean;
  screenQuality: ScreenQuality;
  screenCodec: ScreenCodec;
  screenContent: 'detail' | 'motion';
  screenAudio: boolean;
  forceRelay: boolean;
  autoWatchStreams: boolean;
  userVolumes: Record<string, number>;
  localMutes: Record<string, boolean>;
  keybinds: Record<KeybindAction, string>;
  soundVolume: number;
  customThemes: ThemeDef[];
  collapsedCategories: Record<string, boolean>;
  memberListOpen: boolean;
  recentEmojis: string[];
  lastChannel: Record<string, string>;
  closeToTray: boolean;
  dismissedVerifyBanner: boolean;
}

const DEFAULTS: LocalSettings = {
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  videoDeviceId: '',
  inputVolume: 1,
  outputVolume: 1,
  inputMode: 'vad',
  vadAuto: true,
  vadThreshold: -55,
  pttReleaseDelay: 200,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  cameraQuality: '720p',
  mirrorCamera: true,
  screenQuality: '1080p30',
  screenCodec: 'auto',
  screenContent: 'detail',
  screenAudio: true,
  forceRelay: false,
  autoWatchStreams: true,
  userVolumes: {},
  localMutes: {},
  keybinds: DEFAULT_KEYBINDS,
  soundVolume: 0.6,
  customThemes: [],
  collapsedCategories: {},
  memberListOpen: true,
  recentEmojis: ['👍', '😂', '❤️', '🔥', '😭', '🎉', '👀', '💜'],
  lastChannel: {},
  closeToTray: true,
  dismissedVerifyBanner: false,
};

const KEY = 'vl:local-settings';

function load(): LocalSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { ...DEFAULTS, ...raw, keybinds: { ...DEFAULT_KEYBINDS, ...(raw.keybinds ?? {}) } };
  } catch {
    return DEFAULTS;
  }
}

interface LocalStore extends LocalSettings {
  set: (patch: Partial<LocalSettings>) => void;
  reset: () => void;
}

export const useLocal = create<LocalStore>()((set) => ({
  ...load(),
  set: (patch) =>
    set((s) => {
      const next = { ...s, ...patch };
      const { set: _s, reset: _r, ...data } = next;
      localStorage.setItem(KEY, JSON.stringify(data));
      return next;
    }),
  reset: () => {
    localStorage.removeItem(KEY);
    set({ ...DEFAULTS });
  },
}));

export const local = () => useLocal.getState();
