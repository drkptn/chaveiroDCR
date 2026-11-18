import { useMemo, type ReactNode } from 'react';
import { MarkdownContext, type MarkdownResolvers } from '../lib/markdown';
import { S, displayName, memberColor } from '../store';
import { ui, useUI } from '../store/ui';
import { api } from '../lib/api';
import { nav } from '../lib/nav';

/** Resolve menções, cargos, canais e emojis personalizados dentro do Markdown. */
export function MarkdownProvider({ children }: { children: ReactNode }) {
  const guildId = useUI((s) => s.currentGuildId);
  const value = useMemo<MarkdownResolvers>(
    () => ({
      user: (id) => {
        const s = S();
        if (!s.users[id] && !s.members[guildId ?? '']?.[id]) return null;
        return { name: displayName(id, guildId), color: memberColor(s, guildId, id) };
      },
      role: (id) => {
        const s = S();
        for (const roles of Object.values(s.roles)) if (roles[id]) return { name: roles[id]!.name, color: roles[id]!.color };
        return null;
      },
      channel: (id) => {
        const c = S().channels[id];
        return c ? { name: c.name || 'conversa' } : null;
      },
      emojiUrl: (id) => `${api.server}/files/public/emojis/${id}.webp`,
      onUserClick: (id, el) => ui.profile(id, guildId, el),
      onChannelClick: (id) => {
        const c = S().channels[id];
        if (c?.guildId) nav(`/channels/${c.guildId}/${c.id}`);
      },
      onLinkClick: (url) => ui.open({ type: 'externalLink', url }),
      meId: S().me?.id,
    }),
    [guildId],
  );
  return <MarkdownContext.Provider value={value}>{children}</MarkdownContext.Provider>;
}
