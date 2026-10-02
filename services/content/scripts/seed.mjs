#!/usr/bin/env node
// Copies the compiled curriculum (content/dist/bundle.json) into assets/ so the service image can
// import it as version 1 on first start. Builds it first only if it is missing (turbo normally
// builds @logicpath/content before this package; a plain `pnpm --filter … build` may not).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../../content/dist/bundle.json', import.meta.url));
const target = fileURLToPath(new URL('../assets/seed-bundle.json', import.meta.url));

if (!existsSync(source)) {
  execFileSync('pnpm', ['--filter', '@logicpath/content', 'build'], { stdio: 'inherit' });
}
mkdirSync(fileURLToPath(new URL('../assets/', import.meta.url)), { recursive: true });
copyFileSync(source, target);
console.log('seed bundle → assets/seed-bundle.json');
