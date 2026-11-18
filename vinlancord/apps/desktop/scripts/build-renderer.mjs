// Compila a interface web e copia para apps/desktop/renderer.
// Defina VINLANCORD_SERVER_URL para o endereço padrão do seu servidor (ex.: https://vinlancord.seudominio.com).
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, '..', 'web');
const env = { ...process.env };
if (process.env.VINLANCORD_SERVER_URL) env.VITE_DEFAULT_SERVER = process.env.VINLANCORD_SERVER_URL;
execSync('npx vite build', { cwd: web, stdio: 'inherit', env });
rmSync(join(root, 'renderer'), { recursive: true, force: true });
cpSync(join(web, 'dist'), join(root, 'renderer'), { recursive: true });
console.log('Interface copiada para', join(root, 'renderer'));
