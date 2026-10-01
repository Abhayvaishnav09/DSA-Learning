// Builds the whole app into one self-contained HTML file (for sharing a demo link).
import { build } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const web = join(here, '..');
const result = await build({
  entryPoints: [join(here, 'entry.tsx')],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    '@': join(web, 'src'),
    'next/link': join(here, 'next-link.tsx'),
    'next/navigation': join(here, 'next-navigation.ts'),
  },
  logLevel: 'error',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const cssDir = join(web, '.next/static/chunks');
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(cssDir, f), 'utf8'))
  .join('\n');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LogicPath Prototype</title>
<script>try{var s=JSON.parse(localStorage.getItem('logicpath:settings')||'{}').state;if(s&&(s.theme==='light'||s.theme==='dark'))document.documentElement.dataset.theme=s.theme}catch(e){}</script>
<style>${css}</style>
</head>
<body class="min-h-dvh">
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'logicpath.html'), html);
console.log(`demo/dist/logicpath.html ${(html.length / 1024).toFixed(0)} KB`);
