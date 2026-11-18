// Gera dist/index.js (ESM) empacotando o código do servidor e o pacote compartilhado.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@vinlancord/shared');
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: [...external, '@prisma/client/*', 'pino-pretty'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
