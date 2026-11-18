/**
 * Ponte segura entre o renderer e o processo principal.
 * Expõe apenas funções específicas (sem acesso a Node.js no renderer).
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

function on<T>(channel: string, cb: (v: T) => void) {
  const handler = (_e: IpcRendererEvent, v: T) => cb(v);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  platform: process.platform as 'win32' | 'darwin' | 'linux',
  version: process.argv.find((a) => a.startsWith('--vl-version='))?.split('=')[1] ?? '1.0.0',
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    onMaximizeChange: (cb: (m: boolean) => void) => on('maximize-change', cb),
    focus: () => ipcRenderer.send('window:focus'),
  },
  secure: {
    get: (key: string) => ipcRenderer.invoke('secure:get', key) as Promise<string | null>,
    set: (key: string, value: string) => ipcRenderer.invoke('secure:set', key, value) as Promise<void>,
    delete: (key: string) => ipcRenderer.invoke('secure:delete', key) as Promise<void>,
  },
  screen: {
    getSources: () => ipcRenderer.invoke('screen:getSources'),
    select: (id: string, audio: boolean) => ipcRenderer.invoke('screen:select', id, audio) as Promise<void>,
    systemAudioSupported: process.platform === 'win32',
  },
  notify: {
    setBadge: (count: number) => ipcRenderer.send('notify:badge', count),
    flash: () => ipcRenderer.send('notify:flash'),
  },
  shortcuts: {
    register: (binds: Record<string, string>) => ipcRenderer.invoke('shortcuts:register', binds) as Promise<Record<string, boolean>>,
    onTrigger: (cb: (action: string) => void) => on('shortcut', cb),
  },
  activity: {
    detect: (custom: { process: string; name: string }[]) => ipcRenderer.invoke('activity:detect', custom),
    listProcesses: () => ipcRenderer.invoke('activity:listProcesses') as Promise<string[]>,
  },
  idle: { getIdleSeconds: () => ipcRenderer.invoke('idle:get') as Promise<number> },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch),
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.send('updates:install'),
    onStatus: (cb: (s: unknown) => void) => on('update-status', cb),
  },
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  onDeepLink: (cb: (url: string) => void) => on('deep-link', cb),
};

contextBridge.exposeInMainWorld('vinlancord', api);
