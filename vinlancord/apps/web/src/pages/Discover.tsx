/** Explorar servidores públicos. */
import { useEffect, useState } from 'react';
import { MobileNavButton } from '../components/layout/MobileNav';
import { useNavigate } from 'react-router';
import { Compass, Search, Users } from 'lucide-react';
import type { Guild } from '@vinlancord/shared';
import { api } from '../lib/api';
import { reducers, useStore } from '../store';
import { ui, useUI } from '../store/ui';
import { Button, EmptyState, GuildIcon, Spinner } from '../components/ui';

export function DiscoverPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [list, setList] = useState<(Guild & { joined: boolean })[] | null>(null);
  const mine = useStore((s) => s.guilds);
  useEffect(() => {
    useUI.setState({ currentChannelId: null, currentGuildId: null });
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      setList(null);
      void api.get<(Guild & { joined: boolean })[]>(`/discover?q=${encodeURIComponent(q)}`).then(setList).catch(() => setList([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <main className="vl-content vl-panel scroll-thin min-w-0 flex-1 overflow-y-auto">
      <div className="p-2 md:hidden"><MobileNavButton /></div>
      <div className="relative overflow-hidden px-10 pb-10 pt-12">
        <div className="absolute -right-20 -top-24 size-96 rounded-full bg-accent/25 blur-[100px]" />
        <div className="absolute -left-10 top-10 size-72 rounded-full bg-accent-2/15 blur-[90px]" />
        <div className="relative max-w-3xl">
          <h1 className="font-display text-4xl font-bold text-fg">Encontre sua turma no <span className="gradient-text">Além-Mar</span></h1>
          <p className="mt-2 text-fg-1">De jogos a estudos: comunidades públicas esperando por você.</p>
          <div className="mt-6 flex h-12 items-center gap-3 rounded-xl border border-line-strong bg-bg-1/80 px-4 backdrop-blur focus-within:border-accent">
            <Search size={18} className="text-fg-2" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar comunidades" className="flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-2" />
          </div>
        </div>
      </div>
      <div className="px-10 pb-10">
        {!list ? (
          <div className="grid h-40 place-items-center"><Spinner /></div>
        ) : !list.length ? (
          <EmptyState icon={<Compass size={28} />} title="Nenhum servidor público encontrado" body="Donos de servidores podem torná-los públicos em Configurações → Visão geral." />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {list.map((g) => (
              <div key={g.id} className="group overflow-hidden rounded-2xl border border-line bg-bg-1 transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--vl-shadow)]">
                <div className="relative h-28 bg-gradient-to-br from-accent/60 to-accent-2/40">
                  {g.banner && <img src={g.banner} alt="" className="size-full object-cover" loading="lazy" />}
                  <div className="absolute -bottom-7 left-4 overflow-hidden rounded-2xl ring-4 ring-bg-1">
                    <GuildIcon guild={g} size={56} />
                  </div>
                </div>
                <div className="p-4 pt-9">
                  <div className="truncate font-heading text-[17px] text-fg">{g.name}</div>
                  <p className="mt-1 line-clamp-2 h-10 text-sm text-fg-2">{g.description || 'Sem descrição.'}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-fg-2"><Users size={13} /> {g.memberCount} membros</span>
                    {mine[g.id] ? (
                      <Button size="sm" variant="secondary" onClick={() => nav(`/channels/${g.id}`)}>Abrir</Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={async () => {
                          try {
                            const full = await api.post<any>(`/discover/${g.id}/join`);
                            reducers.GUILD_CREATE!(full);
                            nav(`/channels/${g.id}`);
                          } catch (e) {
                            ui.error(e);
                          }
                        }}
                      >
                        Entrar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
