#!/usr/bin/env node
// Bundles one service (run from its folder) into dist/main.js with esbuild. Workspace packages are
// TypeScript source, so bundling gives a single runnable file per service; native modules stay
// external and come from node_modules in the image (see infra/docker/service.Dockerfile).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
const NATIVE = ['@node-rs/argon2', 'pg-native', 'pino-pretty'];

await build({
  entryPoints: [join(cwd, 'src/main.ts')],
  outfile: join(cwd, 'dist/main.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  minify: false,
  external: NATIVE,
  // Some CommonJS dependencies call require(); give the ESM bundle one.
  banner: {
    js: "import { createRequire as __lpCreateRequire } from 'node:module'; const require = __lpCreateRequire(import.meta.url);",
  },
  logLevel: 'warning',
});
console.log(`built ${pkg.name} → dist/main.js`);
