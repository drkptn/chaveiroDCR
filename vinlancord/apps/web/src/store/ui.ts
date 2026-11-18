/** Estado de interface: modais, toasts, menus de contexto, popouts e painéis. */
import { create } from 'zustand';
import type { ReactNode } from 'react';

export type ModalSpec =
  | { type: 'createServer' }
  | { type: 'joinServer'; code?: string }
  | { type: 'createChannel'; guildId: string; parentId?: string | null; kind?: 'text' | 'voice' | 'video' | 'category' }
  | { type: 'invite'; guildId: string; channelId?: string }
  | { type: 'serverSettings'; guildId: string; tab?: string }
  | { type: 'channelSettings'; channelId: string; tab?: string }
  | { type: 'userSettings'; tab?: string }
  | { type: 'profile'; userId: string; guildId?: string | null }
  | { type: 'confirm'; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; requirePassword?: boolean; onConfirm: (password?: string) => Promise<void> | void }
  | { type: 'report'; targetType: 'user' | 'message' | 'guild'; targetId: string; channelId?: string; label?: string }
  | { type: 'events'; guildId: string }
  | { type: 'image'; src: string; filename?: string; original?: string }
  | { type: 'quickSwitcher' }
  | { type: 'screenShare' }
  | { type: 'externalLink'; url: string }
  | { type: 'newGroup' }
  | { type: 'customStatus' };

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error' | 'message' | 'call';
  title: string;
  body?: string;
  avatar?: { userId: string } | null;
  onClick?: () => void;
  timeout?: number;
}

export interface MenuItem {
  label?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  hint?: string;
  onClick?: () => void;
  separator?: boolean;
  submenu?: MenuItem[];
  render?: ReactNode;
}

interface UIState {
  modals: (ModalSpec & { key: number })[];
  toasts: Toast[];
  menu: { x: number; y: number; items: MenuItem[] } | null;
  popout: { userId: string; guildId: string | null; rect: { x: number; y: number; w: number; h: number } } | null;
  rightPanel: 'members' | 'pins' | 'search' | null;
  searchQuery: { guildId: string | null; channelId: string | null; q: string; filters: Record<string, string> } | null;
  currentChannelId: string | null;
  currentGuildId: string | null;
  focused: boolean;
  replyTo: Record<string, string | null>;
  editing: string | null;
  voiceViewOpen: boolean;
}

let seq = 0;

export const useUI = create<UIState>()(() => ({
  modals: [],
  toasts: [],
  menu: null,
  popout: null,
  rightPanel: 'members',
  searchQuery: null,
  currentChannelId: null,
  currentGuildId: null,
  focused: typeof document !== 'undefined' ? document.hasFocus() : true,
  replyTo: {},
  editing: null,
  voiceViewOpen: false,
}));

export const ui = {
  open(m: ModalSpec) {
    useUI.setState((s) => ({ modals: [...s.modals, { ...m, key: ++seq }], menu: null, popout: null }));
  },
  close(key?: number) {
    useUI.setState((s) => ({ modals: key === undefined ? s.modals.slice(0, -1) : s.modals.filter((m) => m.key !== key) }));
  },
  closeAll() {
    useUI.setState({ modals: [] });
  },
  toast(t: Omit<Toast, 'id'>) {
    const id = ++seq;
    useUI.setState((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    const timeout = t.timeout ?? (t.kind === 'error' ? 6000 : 4500);
    if (timeout > 0) setTimeout(() => ui.dismiss(id), timeout);
    return id;
  },
  dismiss(id: number) {
    useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  error(e: unknown, title = 'Ops!') {
    const body = e instanceof Error ? e.message : String(e);
    ui.toast({ kind: 'error', title, body });
  },
  success(title: string, body?: string) {
    ui.toast({ kind: 'success', title, body });
  },
  menu(e: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) {
    e.preventDefault?.();
    useUI.setState({ menu: { x: e.clientX, y: e.clientY, items }, popout: null });
  },
  closeMenu() {
    useUI.setState({ menu: null });
  },
  profile(userId: string, guildId: string | null, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    useUI.setState({ popout: { userId, guildId, rect: { x: r.left, y: r.top, w: r.width, h: r.height } }, menu: null });
  },
  closePopout() {
    useUI.setState({ popout: null });
  },
  confirm(opts: Omit<Extract<ModalSpec, { type: 'confirm' }>, 'type'>) {
    ui.open({ type: 'confirm', ...opts });
  },
};
