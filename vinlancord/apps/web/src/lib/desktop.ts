/** Ponte para o app desktop (Electron). No navegador, `desktop` é null e usamos alternativas web. */
export interface DesktopSource {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnail: string;
  appIcon: string | null;
}

export interface DesktopSettings {
  openAtLogin: boolean;
  minimizeToTray: boolean;
  hardwareAcceleration: boolean;
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error' | 'disabled';
  version?: string;
  progress?: number;
  message?: string;
}

export interface DesktopAPI {
  platform: 'win32' | 'darwin' | 'linux';
  version: string;
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximizeChange(cb: (maximized: boolean) => void): () => void;
    focus(): void;
  };
  secure: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  screen: {
    getSources(): Promise<DesktopSource[]>;
    select(id: string, audio: boolean): Promise<void>;
    systemAudioSupported: boolean;
  };
  notify: {
    setBadge(count: number): void;
    flash(): void;
  };
  shortcuts: {
    register(binds: Record<string, string>): Promise<Record<string, boolean>>;
    onTrigger(cb: (action: string) => void): () => void;
  };
  activity: {
    detect(custom: { process: string; name: string }[]): Promise<{ name: string; process: string }[]>;
    listProcesses(): Promise<string[]>;
  };
  idle: { getIdleSeconds(): Promise<number> };
  settings: {
    get(): Promise<DesktopSettings>;
    set(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  };
  updates: {
    check(): Promise<UpdateStatus>;
    install(): void;
    onStatus(cb: (s: UpdateStatus) => void): () => void;
  };
  openExternal(url: string): void;
  onDeepLink(cb: (url: string) => void): () => void;
  host: {
    available(): Promise<boolean>;
    status(): Promise<HostStatus>;
    start(opts: { network?: string; upnp?: boolean }): Promise<HostStatus>;
    stop(): Promise<void>;
    onStatus(cb: (s: HostStatus) => void): () => void;
  };
  servers: {
    trust(url: string, pin: string): Promise<void>;
  };
}

export interface HostStatus {
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  step?: string;
  message?: string;
  url?: string;
  localUrl?: string;
  publicIp?: string | null;
  lanIp?: string;
  port?: number;
  mediaPort?: number;
  upnp?: 'ok' | 'failed' | 'cgnat' | 'off';
  upnpError?: string;
  fingerprint?: string;
  network?: string;
  invite?: string;
  details?: string;
}

declare global {
  interface Window {
    vinlancord?: DesktopAPI;
  }
}

export const desktop: DesktopAPI | null = typeof window !== 'undefined' ? (window.vinlancord ?? null) : null;
export const isDesktop = !!desktop;

export function openExternal(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  if (desktop) desktop.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
