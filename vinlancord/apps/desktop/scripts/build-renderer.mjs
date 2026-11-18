// Compila a interface web e copia para apps/desktop/renderer.
// Endereço padrão do servidor embutido no app: ver scripts/server-config.mjs.
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverConfig } from './server-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, '..', 'web');
const env = { ...process.env };
const { url: server } = serverConfig();
if (server) {
  env.VITE_DEFAULT_SERVER = server;
  console.log('Servidor padrão embutido:', server);
}
execSync('npx vite build', { cwd: web, stdio: 'inherit', env });
rmSync(join(root, 'renderer'), { recursive: true, force: true });
cpSync(join(web, 'dist'), join(root, 'renderer'), { recursive: true });
console.log('Interface copiada para', join(root, 'renderer'));
