/**
 * Conversão entre o texto que a pessoa digita (@nome, #canal, :emoji:) e o
 * formato enviado ao servidor (<@id>, <#id>, <:nome:id>).
 */
import { S, displayName } from '../../store';

function membersOf(guildId: string | null, channelId: string) {
  const s = S();
  if (guildId) {
    const ids = Object.keys(s.members[guildId] ?? {});
    if (s.me && !ids.includes(s.me.id)) ids.push(s.me.id);
    return ids;
  }
  return s.channels[channelId]?.recipients ?? [];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function toWire(text: string, guildId: string | null, channelId: string): string {
  const s = S();
  let out = text;
  // emojis personalizados :nome:
  const emojis = Object.values(s.emojis).flat();
  out = out.replace(/(^|[^<a-zA-Z0-9_]):([a-zA-Z0-9_]{2,32}):/g, (all, pre, name) => {
    const e = emojis.find((x) => x.guildId === guildId && x.name === name) ?? emojis.find((x) => x.name === name);
    return e ? `${pre}<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` : all;
  });
  // @usuário (nome de usuário ou nome exibido) — maiores primeiro para evitar colisões
  const people = membersOf(guildId, channelId)
    .map((id) => ({ id, names: [s.users[id]?.username, displayName(id, guildId)].filter(Boolean) as string[] }))
    .flatMap((p) => p.names.map((n) => ({ id: p.id, n })))
    .sort((a, b) => b.n.length - a.n.length);
  for (const p of people) {
    const re = new RegExp(`(^|\\s)@${escapeRe(p.n)}(?=$|\\s|[.,!?:;])`, 'g');
    out = out.replace(re, `$1<@${p.id}>`);
  }
  if (guildId) {
    for (const r of Object.values(s.roles[guildId] ?? {}).sort((a, b) => b.name.length - a.name.length)) {
      if (r.id === guildId) continue;
      const re = new RegExp(`(^|\\s)@${escapeRe(r.name)}(?=$|\\s|[.,!?:;])`, 'g');
      out = out.replace(re, `$1<@&${r.id}>`);
    }
    for (const c of Object.values(s.channels).filter((c) => c.guildId === guildId && c.type !== 'category').sort((a, b) => b.name.length - a.name.length)) {
      const re = new RegExp(`(^|\\s)#${escapeRe(c.name)}(?=$|\\s|[.,!?:;])`, 'g');
      out = out.replace(re, `$1<#${c.id}>`);
    }
  }
  return out;
}

export function fromWire(text: string, guildId: string | null): string {
  const s = S();
  return text
    .replace(/<@!?(\d+)>/g, (_, id) => '@' + (s.users[id]?.username ?? displayName(id, guildId)))
    .replace(/<@&(\d+)>/g, (_, id) => '@' + (guildId ? s.roles[guildId]?.[id]?.name ?? 'cargo' : 'cargo'))
    .replace(/<#(\d+)>/g, (_, id) => '#' + (s.channels[id]?.name ?? 'canal'))
    .replace(/<a?:(\w+):\d+>/g, ':$1:');
}
