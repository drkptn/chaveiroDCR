// Empacota o processo principal e o preload com esbuild.
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', sourcemap: false, minify: true, external: ['electron', 'electron-updater'], logLevel: 'info' };
await build({ ...common, entryPoints: [join(root, 'src/main.ts')], outfile: join(root, 'dist-electron/main.js') });
await build({ ...common, entryPoints: [join(root, 'src/preload.ts')], outfile: join(root, 'dist-electron/preload.js') });
