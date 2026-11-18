// Empacota o processo principal e o preload com esbuild.
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverConfig } from './server-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { pins } = serverConfig();
if (Object.keys(pins).length) console.log('Certificado fixado para:', Object.keys(pins).join(', '));
const common = { define: { __VL_PINS__: JSON.stringify(pins) }, bundle: true, platform: 'node', target: 'node22', format: 'cjs', sourcemap: false, minify: true, external: ['electron', 'electron-updater'], logLevel: 'info' };
await build({ ...common, entryPoints: [join(root, 'src/main.ts')], outfile: join(root, 'dist-electron/main.js') });
await build({ ...common, entryPoints: [join(root, 'src/preload.ts')], outfile: join(root, 'dist-electron/preload.js') });
