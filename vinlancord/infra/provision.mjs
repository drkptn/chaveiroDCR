#!/usr/bin/env node
/**
 * Cria uma VPS já com o Vinlancord instalando sozinho (cloud-init → infra/install.sh).
 *
 *   node infra/provision.mjs vultr     # São Paulo (menor ping no Brasil)  — token em VULTR_API_KEY
 *   node infra/provision.mjs hetzner   # Ashburn/EUA (mais barato)         — token em HCLOUD_TOKEN
 *
 * Opções: --region <id> --plan <id> --name <nome>
 * Ao final mostra o IP e o endereço HTTPS (https://<ip>.sslip.io) e espera o servidor responder.
 * Nenhuma senha do Vinlancord passa por aqui: os segredos são gerados dentro da própria VPS.
 */
const REPO_RAW = 'https://raw.githubusercontent.com/drkptn/chaveiroDCR/refs/heads/claude/vinlancord-communication-app-vkiccq/vinlancord/infra/install.sh';

const args = process.argv.slice(2);
const provider = args[0];
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const name = opt('name', 'vinlancord');

const cloudInit = `#cloud-config
runcmd:
  - [bash, -c, "curl -fsSL ${REPO_RAW} -o /root/vinlancord-install.sh && bash /root/vinlancord-install.sh > /var/log/vinlancord-install.log 2>&1"]
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('▸', ...a);

async function http(base, token, method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 400)}`);
  return data;
}

async function vultr() {
  // Em sessões na nuvem o proxy injeta o token real; localmente use VULTR_API_KEY.
  const token = process.env.VULTR_API_KEY || 'injetado-pelo-proxy';
  const api = (m, p, b) => http('https://api.vultr.com/v2', token, m, p, b);
  const region = opt('region', 'sao');
  const oses = (await api('GET', '/os?per_page=500')).os;
  const os = oses.find((o) => /^Ubuntu 24\.04 LTS x64$/.test(o.name)) ?? oses.find((o) => /^Ubuntu 22\.04 LTS x64$/.test(o.name));
  if (!os) throw new Error('Imagem Ubuntu não encontrada na Vultr.');
  const plans = (await api('GET', '/plans?type=vc2&per_page=500')).plans.filter((p) => p.locations.includes(region));
  const plan = opt('plan') ?? plans.filter((p) => p.ram >= 2048 && p.vcpu_count >= 1).sort((a, b) => a.monthly_cost - b.monthly_cost)[0]?.id;
  if (!plan) throw new Error(`Nenhum plano disponível em ${region}.`);
  const chosen = plans.find((p) => p.id === plan);
  log(`Criando VPS na Vultr: região ${region}, plano ${plan}${chosen ? ` (${chosen.vcpu_count} vCPU, ${chosen.ram} MB, US$ ${chosen.monthly_cost}/mês)` : ''}, ${os.name}`);
  const { instance } = await api('POST', '/instances', {
    region,
    plan,
    os_id: os.id,
    label: name,
    hostname: name,
    tags: ['vinlancord'],
    backups: 'disabled',
    user_data: Buffer.from(cloudInit).toString('base64'),
  });
  log(`Instância ${instance.id} criada. Esperando o IP…`);
  for (let i = 0; i < 90; i++) {
    const { instance: it } = await api('GET', `/instances/${instance.id}`);
    if (it.main_ip && it.main_ip !== '0.0.0.0' && it.status === 'active') return { id: instance.id, ip: it.main_ip };
    await sleep(5000);
  }
  throw new Error('A VPS não ficou ativa a tempo.');
}

async function hetzner() {
  const token = process.env.HCLOUD_TOKEN || 'injetado-pelo-proxy';
  const api = (m, p, b) => http('https://api.hetzner.cloud/v1', token, m, p, b);
  const location = opt('region', 'ash');
  const type = opt('plan', location === 'ash' || location === 'hil' ? 'cpx11' : 'cx22');
  log(`Criando VPS na Hetzner: local ${location}, tipo ${type}, Ubuntu 24.04`);
  const { server } = await api('POST', '/servers', {
    name,
    server_type: type,
    image: 'ubuntu-24.04',
    location,
    user_data: cloudInit,
    labels: { app: 'vinlancord' },
    start_after_create: true,
  });
  const ip = server.public_net?.ipv4?.ip;
  if (!ip) throw new Error('A Hetzner não devolveu um IP.');
  return { id: server.id, ip };
}

async function waitHealthy(url) {
  log(`Instalando sozinha (Docker, banco, HTTPS…). Isso leva ~5–15 min. Verificando ${url}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 30 * 60_000) {
    try {
      const r = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return true;
    } catch {
      /* ainda subindo */
    }
    await sleep(15_000);
    process.stdout.write('.');
  }
  return false;
}

const run = { vultr, hetzner }[provider];
if (!run) {
  console.error('Uso: node infra/provision.mjs <vultr|hetzner> [--region id] [--plan id] [--name nome]');
  process.exit(1);
}
const { id, ip } = await run();
const url = `https://${ip.replace(/\./g, '-')}.sslip.io`;
log(`VPS ${id} com IP ${ip}. Endereço do Vinlancord: ${url}`);
if (args.includes('--no-wait')) process.exit(0);
const ok = await waitHealthy(url);
console.log();
if (!ok) {
  console.error('✗ O servidor ainda não respondeu. Veja /var/log/vinlancord-install.log na VPS.');
  process.exit(2);
}
console.log(`✔ Vinlancord no ar em ${url}`);
