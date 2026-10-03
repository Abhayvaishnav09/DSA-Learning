// Copies Python (Pyodide) into public/ so the site serves it itself: the visualize screen works
// without a CDN, inside the Android app and offline once cached. Versioned folder: cache-forever.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];
const require = createRequire(import.meta.url);
const source = dirname(require.resolve('pyodide/package.json'));
const { version } = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
const target = join(fileURLToPath(new URL('..', import.meta.url)), 'public', 'pyodide', version);
mkdirSync(target, { recursive: true });
for (const file of FILES) {
  if (!existsSync(join(target, file))) copyFileSync(join(source, file), join(target, file));
}
console.log(`pyodide ${version} -> public/pyodide/${version}/`);
