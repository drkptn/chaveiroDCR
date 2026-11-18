/**
 * PostgreSQL portátil (binários do pacote @embedded-postgres/<plataforma>).
 * Usa initdb + pg_ctl: no Windows o pg_ctl roda o banco com permissões reduzidas,
 * então funciona mesmo se o app estiver aberto como administrador.
 * O banco só escuta em 127.0.0.1 (nunca exposto na rede).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Bins {
  initdb: string;
  pg_ctl: string;
  postgres: string;
}

async function binaries(): Promise<Bins> {
  const name = process.platform === 'win32' ? 'windows-x64' : `${process.platform}-${process.arch}`;
  const mod = (await import(`@embedded-postgres/${name}`)) as Bins & { default?: Bins };
  const bins = mod.default?.pg_ctl ? mod.default : mod;
  // Linux/macOS: o pacote guarda os links simbólicos das bibliotecas num manifesto; recria se faltarem
  const root = join(dirname(bins.postgres), '..', '..');
  const hydrate = join(root, 'scripts', 'hydrate-symlinks.js');
  if (process.platform !== 'win32' && existsSync(hydrate)) {
    try {
      const m = (await import(pathToFileURL(hydrate).href)) as { hydrateSymlinks?: () => Promise<void> };
      await m.hydrateSymlinks?.();
    } catch {
      /* já hidratado */
    }
  }
  return bins;
}

function run(bin: string, args: string[], opts: { allowFail?: boolean } = {}) {
  return new Promise<{ code: number; out: string }>((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true, env: { ...process.env, LC_ALL: 'C', LANG: 'C' } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0 && !opts.allowFail) reject(new Error(`${bin.split(/[\\/]/).pop()} falhou (${code}): ${out.trim().slice(-600)}`));
      else resolve({ code: code ?? 1, out });
    });
  });
}

export class LocalPostgres {
  private bins!: Bins;
  private started = false;

  constructor(
    private dir: string,
    private port: number,
    private user: string,
    private password: string,
  ) {}

  get url() {
    return `postgresql://${this.user}:${encodeURIComponent(this.password)}@127.0.0.1:${this.port}/vinlancord`;
  }

  async start(log: (m: string) => void) {
    this.bins = await binaries();
    const data = join(this.dir, 'data');
    if (!existsSync(join(data, 'PG_VERSION'))) {
      log('Criando o banco de dados (só na primeira vez)…');
      rmSync(data, { recursive: true, force: true });
      mkdirSync(data, { recursive: true });
      const pw = join(this.dir, '.pw');
      writeFileSync(pw, this.password, { mode: 0o600 });
      try {
        await run(this.bins.initdb, ['-D', data, '-U', this.user, `--pwfile=${pw}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--no-locale']);
      } finally {
        rmSync(pw, { force: true });
      }
    }
    // instância esquecida de uma execução anterior (app fechado à força): desliga antes
    const status = await run(this.bins.pg_ctl, ['status', '-D', data], { allowFail: true });
    if (status.code === 0) await run(this.bins.pg_ctl, ['stop', '-D', data, '-m', 'fast', '-w'], { allowFail: true });
    log('Ligando o banco de dados…');
    await run(this.bins.pg_ctl, [
      'start',
      '-D',
      data,
      '-w',
      '-t',
      '90',
      '-l',
      join(this.dir, 'postgres.log'),
      '-o',
      `-p ${this.port} -c listen_addresses=127.0.0.1 -c max_connections=50`,
    ]);
    this.started = true;
    await this.ensureDatabase();
  }

  private async ensureDatabase() {
    const pg = (await import('pg')).default;
    const c = new pg.Client({ connectionString: this.url.replace(/\/vinlancord$/, '/postgres') });
    await c.connect();
    try {
      const r = await c.query(`SELECT 1 FROM pg_database WHERE datname = 'vinlancord'`);
      if (!r.rowCount) await c.query('CREATE DATABASE vinlancord');
    } finally {
      await c.end().catch(() => {});
    }
  }

  async stop() {
    if (!this.started) return;
    this.started = false;
    await run(this.bins.pg_ctl, ['stop', '-D', join(this.dir, 'data'), '-m', 'fast', '-w', '-t', '30'], { allowFail: true });
  }
}
