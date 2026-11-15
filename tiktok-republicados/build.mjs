// Gera tudo a partir de src/remover.js (fonte única):
//   extensao/remover.js            → script da extensão do Chrome
//   dist/bookmarklet.txt           → o "favorito mágico"
//   dist/faxina-republicados.js    → versão pra colar no console
//   dist/faxina-republicados-extensao.zip
//   dist/index.html                → página com instruções (de site/template.html)
// Uso: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const p = (...xs) => path.join(root, ...xs);

const source = readFileSync(p('src', 'remover.js'), 'utf8');
const version = (source.match(/var VERSION = '([^']+)'/) || [])[1];
if (!version) throw new Error('VERSION não encontrada em src/remover.js');

mkdirSync(p('dist'), { recursive: true });

// 1) extensão
copyFileSync(p('src', 'remover.js'), p('extensao', 'remover.js'));
const manifestPath = p('extensao', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== version) {
  manifest.version = version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

// 2) console + favorito.
//    Compactação conservadora: tira indentação e linhas que são só comentário
//    (o fonte não tem strings de várias linhas). As quebras de linha ficam
//    (viram %0A), então comentários no fim da linha continuam seguros.
writeFileSync(p('dist', 'faxina-republicados.js'), source);
const compact = source
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'))
  .join('\n');
// Codifica só o necessário pra URL: %, #, quebras de linha/tabs e não-ASCII.
const encodeMin = (s) => s.replace(/[%#\t\r\n]|[^\x20-\x7e]/gu, (c) => encodeURIComponent(c));
const bookmarklet = 'javascript:' + encodeMin(compact);
writeFileSync(p('dist', 'bookmarklet.txt'), bookmarklet + '\n');

// 3) zip da extensão
const zipPath = p('dist', 'faxina-republicados-extensao.zip');
if (existsSync(zipPath)) rmSync(zipPath);
execFileSync('zip', ['-r', '-X', '-q', zipPath, '.', '-x', '.*'], { cwd: p('extensao') });

// 4) página de instruções
const tplPath = p('site', 'template.html');
if (existsSync(tplPath)) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const painel = existsSync(p('site', 'painel.png'))
    ? 'data:image/png;base64,' + readFileSync(p('site', 'painel.png')).toString('base64')
    : '';
  const html = readFileSync(tplPath, 'utf8')
    .replaceAll('__VERSION__', version)
    .replace('__LINES__', String(source.split('\n').length))
    .replace('__PAINEL_SRC__', () => painel)
    .replace('__BOOKMARKLET_HREF__', () => esc(bookmarklet))
    .replace('__SCRIPT_TEXT__', () => esc(source));
  writeFileSync(p('dist', 'index.html'), html);
}

console.log(`ok v${version}: bookmarklet ${(bookmarklet.length / 1024).toFixed(1)} KB, zip ${(readFileSync(zipPath).length / 1024).toFixed(1)} KB`);
