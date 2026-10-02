#!/usr/bin/env node
// Writes <out>/package.json with the runtime dependencies a bundled service still needs: the
// native packages from natives.mjs that the service actually depends on, at the exact installed
// version. Everything else is inside dist/main.js. Usage: node runtime-deps.mjs <service> <out>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { NATIVE } from './natives.mjs';

const [service, out] = process.argv.slice(2);
const dir = join(process.cwd(), 'services', service);
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const require = createRequire(join(dir, 'package.json'));
const dependencies = {};
for (const name of NATIVE) {
  if (!pkg.dependencies?.[name]) continue;
  dependencies[name] = JSON.parse(
    readFileSync(require.resolve(`${name}/package.json`), 'utf8'),
  ).version;
}
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, 'package.json'),
  JSON.stringify(
    { name: `${service}-runtime`, private: true, type: 'module', dependencies },
    null,
    2,
  ),
);
console.log(`runtime dependencies for ${service}:`, Object.keys(dependencies).join(', ') || 'none');
