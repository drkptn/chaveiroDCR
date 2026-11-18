/** Decide quando e como notificar (som, notificação do sistema, toast, barra de tarefas). */
import type { Message } from '@vinlancord/shared';
import { S, displayName, isMuted } from '../store';
import { ui, useUI } from '../store/ui';
import { playSound } from './sounds';
import { desktop } from './desktop';
import { nav } from './nav';

function plainPreview(m: Message) {
  let t = m.content
    .replace(/<@!?(\d+)>/g, (_, id) => '@' + displayName(id, m.guildId))
    .replace(/<@&\d+>/g, '@cargo')
    .replace(/<#(\d+)>/g, (_, id) => '#' + (S().channels[id]?.name ?? 'canal'))
    .replace(/<a?:(\w+):\d+>/g, ':$1:')
    .replace(/[*_~`|]/g, '');
  if (!t && m.attachments.length) t = `📎 ${m.attachments.length > 1 ? `${m.attachments.length} anexos` : m.attachments[0]!.filename}`;
  if (!t && m.sticker) t = `Figurinha: ${m.sticker.name}`;
  return t.length > 140 ? t.slice(0, 137) + '…' : t;
}

export function isMentioned(m: Message): boolean {
  const s = S();
  const me = s.me;
  if (!me) return false;
  if (m.mentions.includes(me.id)) return true;
  if (m.guildId) {
    const n = s.notif[m.guildId];
    if (m.mentionEveryone && !n?.suppressEveryone) return true;
    const myRoles = s.myMembers[m.guildId]?.roles ?? [];
    if (m.mentionRoles.some((r) => myRoles.includes(r))) return true;
  }
  return false;
}

export function handleNotifications(m: Message) {
  const s = S();
  const me = s.me;
  if (!me || m.author.id === me.id) return;
  if (s.relationships[m.author.id]?.type === 'blocked') return;
  const ch = s.channels[m.channelId];
  if (!ch) return;
  const u = useUI.getState();
  const viewing = u.currentChannelId === m.channelId && u.focused;
  const mentioned = isMentioned(m);
  const isDM = !ch.guildId;

  let level: 'all' | 'mentions' | 'nothing';
  if (isDM) level = s.settings.notifications.dmLevel === 'nothing' ? 'nothing' : 'all';
  else level = s.notif[ch.id]?.level ?? s.notif[ch.guildId!]?.level ?? 'all';

  const muted = isMuted(s, ch.id) || (ch.guildId ? isMuted(s, ch.guildId) : false);
  const notify = !muted && (level === 'all' || (level === 'mentions' && mentioned));
  if (!notify || viewing) return;

  const dnd = me.status === 'dnd';
  const prefs = s.settings.notifications;
  const author = displayName(m.author.id, m.guildId);
  const where = isDM
    ? ch.type === 'group_dm'
      ? ch.name || 'Grupo'
      : author
    : `${author} (#${ch.name}, ${s.guilds[ch.guildId!]?.name ?? ''})`;
  const body = plainPreview(m);
  const go = () => nav(ch.guildId ? `/channels/${ch.guildId}/${ch.id}` : `/channels/@me/${ch.id}`);

  if (!dnd && prefs.sounds) {
    if (mentioned && prefs.mentionSound) playSound('mention');
    else if (prefs.messageSound) playSound('message');
  }

  if (!u.focused) {
    if (!dnd && prefs.desktop && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(where, { body: isDM && ch.type === 'dm' ? body : `${author}: ${body}`, icon: m.author.avatar ?? undefined, silent: true, tag: ch.id });
      n.onclick = () => {
        desktop?.window.focus();
        window.focus();
        go();
        n.close();
      };
    }
    if (prefs.flashTaskbar && (mentioned || isDM)) desktop?.notify.flash();
  } else if (!dnd) {
    ui.toast({ kind: 'message', title: where, body, avatar: { userId: m.author.id }, onClick: go });
  }
}

/** Contagem para o ícone/badge do app: menções + DMs não lidas. */
export function badgeCount() {
  const s = S();
  let n = 0;
  for (const rs of Object.values(s.readStates)) n += rs.mentions;
  return n;
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}
