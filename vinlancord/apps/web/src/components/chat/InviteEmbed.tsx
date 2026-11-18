import { useEffect, useState } from 'react';
import type { Invite } from '@vinlancord/shared';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import { joinInvite } from '../../store/actions';
import { ui } from '../../store/ui';
import { Button, GuildIcon } from '../ui';

const cache = new Map<string, Promise<Invite | null>>();

/** Cartão de convite exibido quando alguém compartilha um link de convite. */
export function InviteEmbed({ code }: { code: string }) {
  const [inv, setInv] = useState<Invite | null | undefined>(undefined);
  const joined = useStore((s) => (inv ? !!s.guilds[inv.guild.id] : false));
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let p = cache.get(code);
    if (!p) {
      p = api.get<Invite>(`/invites/${code}`).catch(() => null);
      cache.set(code, p);
    }
    let alive = true;
    void p.then((r) => alive && setInv(r));
    return () => {
      alive = false;
    };
  }, [code]);
  if (inv === undefined) return <div className="mt-2 h-[88px] w-[400px] max-w-full rounded-xl skeleton" />;
  return (
    <div className="mt-2 w-[400px] max-w-full rounded-xl border border-line bg-bg-1 p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-fg-2">Você recebeu um convite para entrar em um servidor</div>
      {inv ? (
        <div className="flex items-center gap-3">
          <GuildIcon guild={inv.guild} size={50} className="rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display font-semibold text-fg">{inv.guild.name}</div>
            <div className="flex items-center gap-3 text-xs text-fg-2">
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-online" />{inv.guild.onlineCount} online</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-offline" />{inv.guild.memberCount} membros</span>
            </div>
          </div>
          <Button
            variant={joined ? 'secondary' : 'success'}
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await joinInvite(code);
              } catch (e) {
                ui.error(e);
              } finally {
                setLoading(false);
              }
            }}
          >
            {joined ? 'Abrir' : 'Entrar'}
          </Button>
        </div>
      ) : (
        <div className="text-sm text-fg-2">Convite inválido ou expirado. 😕</div>
      )}
    </div>
  );
}
