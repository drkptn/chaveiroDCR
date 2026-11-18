// Compila a interface web e copia para apps/desktop/renderer.
// Endereço padrão do servidor embutido no app: VINLANCORD_SERVER_URL ou, se não definido,
// o arquivo apps/desktop/default-server.txt (o servidor público oficial deste repositório).
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, '..', 'web');
const env = { ...process.env };
const fileServer = existsSync(join(root, 'default-server.txt')) ? readFileSync(join(root, 'default-server.txt'), 'utf8').trim() : '';
const server = process.env.VINLANCORD_SERVER_URL || fileServer;
if (server) {
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(server)) throw new Error(`Endereço de servidor inválido: ${server}`);
  env.VITE_DEFAULT_SERVER = server;
  console.log('Servidor padrão embutido:', server);
}
execSync('npx vite build', { cwd: web, stdio: 'inherit', env });
rmSync(join(root, 'renderer'), { recursive: true, force: true });
cpSync(join(web, 'dist'), join(root, 'renderer'), { recursive: true });
console.log('Interface copiada para', join(root, 'renderer'));
