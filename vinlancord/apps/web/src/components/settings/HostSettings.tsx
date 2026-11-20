/** Configurações → Servidor no meu PC: liga/desliga o modo anfitrião e mostra o link de convite. */
import { useEffect, useState } from 'react';
import { Check, Copy, Power, PowerOff, Router, ShieldAlert, Wifi } from 'lucide-react';
import { desktop, type HostStatus } from '../../lib/desktop';
import { api } from '../../lib/api';
import { connectToServer } from '../../lib/serverLink';
import { ui } from '../../store/ui';
import { Button, Select, Spinner, cx } from '../ui';
import { useStore } from '../../store';
import { SectionTitle, Card } from './SettingsLayout';

const NETWORKS = [
  { value: 'internet', label: 'Internet (abre as portas do roteador sozinho)' },
  { value: 'radmin', label: 'Radmin VPN (quando a operadora bloqueia)' },
  { value: 'hamachi', label: 'Hamachi' },
  { value: 'zerotier', label: 'ZeroTier' },
  { value: 'tailscale', label: 'Tailscale' },
  { value: 'lan', label: 'Só a minha casa (mesma rede Wi-Fi)' },
];

export default function HostSettings() {
  const [st, setSt] = useState<HostStatus>({ state: 'stopped' });
  const [available, setAvailable] = useState<boolean | null>(null);
  const [network, setNetwork] = useState(() => localStorage.getItem('vl:host-network') ?? 'internet');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    void desktop.host.available().then(setAvailable);
    void desktop.host.status().then(setSt);
    return desktop.host.onStatus(setSt);
  }, []);

  if (!desktop) return <SectionTitle sub="Disponível só no app para Windows.">Servidor no meu PC</SectionTitle>;
  const busy = st.state === 'starting' || st.state === 'stopping';
  const running = st.state === 'running';
  const usingMine = running && (api.server === st.localUrl || api.server === st.url);

  const copy = async () => {
    if (!st.invite) return;
    await navigator.clipboard.writeText(st.invite);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <SectionTitle sub="Seu PC vira o servidor: liga quando você quiser jogar/conversar com a galera e desliga quando fechar. Grátis, sem nuvem.">
        Servidor no meu PC
      </SectionTitle>

      {available === false && (
        <Card>
          <p className="text-sm text-fg-1">Esta versão do app não inclui o modo anfitrião. Atualize o Além-Mar.</p>
        </Card>
      )}

      <Card title="Estado">
        <div className="flex items-center gap-4">
          <span className={cx('grid size-12 place-items-center rounded-full', running ? 'bg-success/20 text-success' : st.state === 'error' ? 'bg-danger/20 text-danger' : 'bg-bg-4 text-fg-2')}>
            {busy ? <Spinner /> : running ? <Wifi size={22} /> : <PowerOff size={22} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-heading text-lg text-fg">
              {running ? 'Servidor ligado' : st.state === 'starting' ? 'Ligando…' : st.state === 'stopping' ? 'Desligando…' : st.state === 'error' ? 'Deu ruim' : 'Desligado'}
            </div>
            <div className="truncate text-sm text-fg-2">{st.state === 'error' ? st.message : busy ? st.step : running ? st.url : 'Clique em ligar quando quiser abrir pros amigos.'}</div>
          </div>
          {running || st.state === 'stopping' ? (
            <Button variant="danger" icon={<PowerOff size={16} />} loading={st.state === 'stopping'} onClick={() => void desktop!.host.stop()}>
              Desligar
            </Button>
          ) : (
            <Button
              icon={<Power size={16} />}
              loading={st.state === 'starting'}
              disabled={available === false}
              onClick={() => {
                localStorage.setItem('vl:host-network', network);
                void desktop!.host.start({ network });
              }}
            >
              Ligar servidor
            </Button>
          )}
        </div>
        {st.state === 'error' && st.details && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-fg-1">
              Detalhes do erro
              <button className="normal-case tracking-normal text-accent hover:underline" onClick={() => void navigator.clipboard.writeText(`${st.message}\n\n${st.details}`).then(() => ui.success('Detalhes copiados!'))}>
                Copiar detalhes
              </button>
            </div>
            <pre className="selectable max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg-0/70 p-3 font-mono text-[11px] text-fg-2">{st.details}</pre>
          </div>
        )}
        {!running && !busy && (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-1">Como os amigos chegam até você</div>
            <Select value={network} onChange={setNetwork} options={NETWORKS} />
          </div>
        )}
      </Card>

      {running && (
        <>
          <Card title="Convite para os amigos">
            <p className="mb-3 text-sm text-fg-1">Mande este link. Quem tiver o app clica (ou cola em “Servidor: alterar” na tela de login) e já entra no seu servidor.</p>
            <div className="flex gap-2">
              <code className="selectable min-w-0 flex-1 truncate rounded-lg border border-line bg-bg-0/70 px-3 py-2 font-mono text-xs text-fg-1">{st.invite}</code>
              <Button icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={() => void copy()}>
                {copied ? 'Copiado!' : 'Copiar'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-fg-2">Se o IP da sua internet mudar, o link muda também — é só mandar o novo.</p>
          </Card>

          {st.network === 'internet' && st.upnp !== 'ok' && (
            <Card title={st.upnp === 'cgnat' ? 'Sua operadora bloqueia conexões de fora' : 'O roteador não abriu as portas sozinho'}>
              <div className="flex gap-3 text-sm text-fg-1">
                {st.upnp === 'cgnat' ? <ShieldAlert size={20} className="shrink-0 text-warning" /> : <Router size={20} className="shrink-0 text-warning" />}
                {st.upnp === 'cgnat' ? (
                  <p>
                    Sua internet usa IP compartilhado (CGNAT), então ninguém de fora consegue chegar no seu PC. Solução grátis: você e os amigos instalam o <b>Radmin VPN</b>, entram na mesma
                    rede dele, e aqui você desliga, escolhe <b>Radmin VPN</b> e liga de novo.
                  </p>
                ) : (
                  <p>
                    Ative o <b>UPnP</b> no roteador ou libere manualmente (redirecionamento de portas) para o IP <b>{st.lanIp}</b>: porta <b>{st.port} TCP</b> e porta{' '}
                    <b>{st.mediaPort} TCP e UDP</b>. Sem isso, só quem está na sua casa consegue entrar. Alternativa: Radmin VPN.
                  </p>
                )}
              </div>
            </Card>
          )}

          <CreatorBadgeCard />

          <Card title="Usar no meu app">
            {usingMine ? (
              <p className="text-sm text-fg-1">Este app já está conectado ao seu servidor. ✔</p>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-fg-1">Conecte este app ao seu servidor (você cria sua conta nele uma vez; ela fica guardada no seu PC).</p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    st.localUrl && st.fingerprint
                      ? void connectToServer({ url: st.localUrl, pin: st.fingerprint }, { confirm: false }).catch((e) => ui.error(e))
                      : undefined
                  }
                >
                  Conectar
                </Button>
              </div>
            )}
          </Card>
        </>
      )}

      <Card title="Bom saber">
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-2">
          <li>Na primeira vez o Windows pergunta se o Além-Mar pode usar a rede: clique em <b>Permitir</b> (redes privadas e públicas).</li>
          <li>Contas, servidores e mensagens ficam guardados no seu PC e voltam quando você liga de novo.</li>
          <li>Enquanto o servidor estiver ligado, deixe o app aberto (pode minimizar).</li>
        </ul>
      </Card>
    </>
  );
}

/**
 * Registro do criador: torna A CONTA LOGADA neste app a única conta criadora do servidor
 * (selo "Lord of Freedom" + Painel do Criador). Só funciona daqui, do PC que roda o servidor.
 */
function CreatorBadgeCard() {
  const me = useStore((s) => s.me);
  const [busy, setBusy] = useState(false);
  const isCreator = !!me?.badges?.includes('creator');
  const apply = async (badges: string[]) => {
    if (!desktop || !me) return;
    setBusy(true);
    try {
      await desktop.host.setBadges(me.username, badges);
      ui.success(badges.length ? 'Pronto, Lord! Sua conta agora é a criadora deste servidor. 👑' : 'Sua conta deixou de ser a criadora.');
    } catch (e) {
      ui.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Conta do criador">
      {!me ? (
        <p className="text-sm text-fg-1">Clique em “Conectar” abaixo e entre na sua conta; depois volte aqui para registrá-la como a conta do criador.</p>
      ) : isCreator ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-1">
            <b className="vl-name-creator">{me.displayName}</b> (@{me.username}) é a conta do criador deste servidor: selo <span className="vl-badge-creator rounded-full px-2 py-0.5 font-heading text-[12px]">👑 Lord of Freedom</span> e o{' '}
            <b>Painel do Criador</b> nas configurações.
          </p>
          <Button variant="ghost" disabled={busy} onClick={() => void apply([])}>
            Remover
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm text-fg-1">
            Registrar <b>{me.displayName}</b> (@{me.username}) como a <b>única</b> conta criadora deste servidor: ganha o selo Lord of Freedom, nome dourado e o Painel do Criador. Só dá para
            fazer isso daqui, do PC que roda o servidor.
          </p>
          <Button loading={busy} onClick={() => void apply(['creator'])}>
            👑 Registrar minha conta
          </Button>
        </div>
      )}
    </Card>
  );
}
