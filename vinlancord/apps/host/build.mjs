// Monta apps/host/dist: o servidor completo (modo anfitrião) pronto para ir dentro do app desktop.
//   dist/runtime.mjs   servidor + runtime num único arquivo
//   dist/migrations    migrações do banco
//   dist/web           interface web (acesso pelo navegador, opcional)
//   dist/node_modules  só o que tem binário nativo (mediasoup, sharp, argon2, Prisma, PostgreSQL portátil)
// As dependências nativas são instaladas para a plataforma em que o build roda (Windows no CI).
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const server = join(root, '..', 'server');
const web = join(root, '..', 'web');
const dist = join(root, 'dist');
const modules = join(root, '..', '..', 'node_modules');
const version = (p) => JSON.parse(readFileSync(join(modules, p, 'package.json'), 'utf8')).version;

if (!existsSync(join(server, 'src', 'generated', 'prisma'))) execSync('npx prisma generate', { cwd: server, stdio: 'inherit' });

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const native = ['mediasoup', 'sharp', '@node-rs/argon2', '@prisma/client', '@achingbrain/nat-port-mapper'];
await build({
  entryPoints: [join(root, 'src', 'runtime.ts')],
  outfile: join(dist, 'runtime.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  external: [...native, '@prisma/client/*', '@embedded-postgres/*', 'pg-native', 'pino-pretty'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});

cpSync(join(server, 'prisma', 'migrations'), join(dist, 'migrations'), { recursive: true });
if (existsSync(join(web, 'dist', 'index.html'))) cpSync(join(web, 'dist'), join(dist, 'web'), { recursive: true });

const pgVersion = version('embedded-postgres');
writeFileSync(
  join(dist, 'package.json'),
  JSON.stringify(
    {
      name: 'vinlancord-host-runtime',
      private: true,
      type: 'module',
      dependencies: Object.fromEntries(native.map((p) => [p, version(p)])),
      optionalDependencies: Object.fromEntries(
        ['windows-x64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'].map((p) => [`@embedded-postgres/${p}`, pgVersion]),
      ),
    },
    null,
    2,
  ),
);

console.log('Instalando dependências nativas para', process.platform, process.arch, '…');
execSync('npm install --omit=dev --no-audit --no-fund --no-package-lock --ignore-scripts=false', { cwd: dist, stdio: 'inherit' });
// arquivos de documentação/teste não precisam ir no instalador
for (const p of ['node_modules/mediasoup/worker/src', 'node_modules/mediasoup/worker/include', 'node_modules/mediasoup/worker/subprojects', 'node_modules/mediasoup/worker/deps'])
  rmSync(join(dist, p), { recursive: true, force: true });
// Windows: postgres.exe, initdb.exe, pg_ctl.exe, mediasoup-worker.exe e o argon2 (.node) dependem do
// runtime do Visual C++ (VCRUNTIME140/140_1, MSVCP140), que muitos PCs NÃO têm instalado.
// Distribuição "app-local" (permitida pela Microsoft): as DLLs vão ao lado de cada executável/módulo.
if (process.platform === 'win32') {
  const sys = join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  const dlls = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll'];
  for (const d of dlls) if (!existsSync(join(sys, d))) throw new Error(`Runtime do Visual C++ não encontrado neste PC de build: ${d}`);
  const dirs = new Set();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(exe|node)$/i.test(e.name)) dirs.add(dir);
    }
  };
  walk(join(dist, 'node_modules'));
  for (const dir of dirs) for (const d of dlls) if (!existsSync(join(dir, d))) copyFileSync(join(sys, d), join(dir, d));
  console.log(`Runtime do Visual C++ incluído em ${dirs.size} pasta(s).`);
}
console.log('Modo anfitrião pronto em', dist);
