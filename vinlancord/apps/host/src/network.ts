/** Rede do anfitrião: IP local, IP público, UPnP (abrir portas no roteador) e detecção de CGNAT. */
import { networkInterfaces } from 'node:os';
import { upnpNat, type Gateway } from '@achingbrain/nat-port-mapper';

export type VpnKind = 'radmin' | 'hamachi' | 'zerotier' | 'tailscale';

const isPrivate = (ip: string) =>
  /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^169\.254\./.test(ip) || /^127\./.test(ip);
/** 100.64.0.0/10: faixa usada por operadoras com CGNAT (IP compartilhado). */
export const isCgnat = (ip: string) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
export const isPublicIPv4 = (ip: string) => /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !isPrivate(ip) && !isCgnat(ip);

/** Endereços das redes virtuais populares para jogar com amigos (alternativa quando o roteador não abre portas). */
function vpnOf(name: string, ip: string): VpnKind | null {
  if (/radmin/i.test(name) || /^26\./.test(ip)) return 'radmin';
  if (/hamachi/i.test(name) || /^25\./.test(ip)) return 'hamachi';
  if (/zerotier/i.test(name)) return 'zerotier';
  if (/tailscale/i.test(name) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return 'tailscale';
  return null;
}

export function localAddresses() {
  let lan: string | null = null;
  const vpns: { kind: VpnKind; ip: string }[] = [];
  const score = (ip: string) => (/^192\.168\./.test(ip) ? 3 : /^10\./.test(ip) ? 2 : /^172\./.test(ip) ? 1 : 0);
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family !== 'IPv4' || ni.internal || ni.address.startsWith('169.254.')) continue;
      const vpn = vpnOf(name, ni.address);
      if (vpn) vpns.push({ kind: vpn, ip: ni.address });
      // ignora adaptadores virtuais de VM/WSL para escolher o IP da rede de casa
      else if (!/vEthernet|VirtualBox|VMware|docker|br-|virbr|WSL/i.test(name) && (!lan || score(ni.address) > score(lan))) lan = ni.address;
    }
  }
  return { lan: lan ?? '127.0.0.1', vpns };
}

export async function publicIpFromWeb(): Promise<string | null> {
  for (const url of ['https://api.ipify.org', 'https://ipv4.icanhazip.com', 'https://ifconfig.me/ip']) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const ip = (await r.text()).trim();
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

export interface UpnpResult {
  ok: boolean;
  externalIp: string | null;
  gateway: Gateway | null;
  error?: string;
}

/** Abre as portas no roteador via UPnP. Devolve o gateway para fechar depois. */
export async function openPorts(lanIp: string, ports: { port: number; protocol: 'tcp' | 'udp' }[]): Promise<UpnpResult> {
  const client = upnpNat({ description: 'Alem-Mar', ttl: 2 * 3600_000, autoRefresh: true });
  try {
    for await (const gateway of client.findGateways({ signal: AbortSignal.timeout(8000) })) {
      if (gateway.family !== 'IPv4') continue;
      try {
        for (const p of ports) await gateway.map(p.port, lanIp, { protocol: p.protocol, externalPort: p.port, signal: AbortSignal.timeout(8000) });
        const externalIp = await gateway.externalIp({ signal: AbortSignal.timeout(6000) }).catch(() => null);
        return { ok: true, externalIp, gateway };
      } catch (e) {
        await gateway.stop().catch(() => {});
        return { ok: false, externalIp: null, gateway: null, error: (e as Error).message };
      }
    }
  } catch (e) {
    return { ok: false, externalIp: null, gateway: null, error: (e as Error).message };
  }
  return { ok: false, externalIp: null, gateway: null, error: 'Nenhum roteador com UPnP encontrado.' };
}
