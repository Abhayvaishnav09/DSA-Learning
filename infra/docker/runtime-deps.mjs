#!/usr/bin/env node
// Writes <out>/package.json with the runtime dependencies a bundled service still needs: the
// native packages from natives.mjs that the service actually depends on, at the exact installed
// version. Everything else is inside dist/main.js. Usage: node runtime-deps.mjs <service> <out>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { NATIVE } from './natives.mjs';

const [service, out] = process.argv.slice(2);
const dir = join(process.cwd(), 'services', service);
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const require = createRequire(join(dir, 'package.json'));

/**
 * The installed version of a dependency. Not via require.resolve('<name>/package.json'):
 * packages whose "exports" leave package.json out (sharp) refuse that.
 */
function installedVersion(name) {
  const linked = join(dir, 'node_modules', name, 'package.json');
  if (existsSync(linked)) return JSON.parse(readFileSync(linked, 'utf8')).version;
  for (let at = dirname(require.resolve(name)); at !== dirname(at); at = dirname(at)) {
    const file = join(at, 'package.json');
    if (existsSync(file)) {
      const found = JSON.parse(readFileSync(file, 'utf8'));
      if (found.name === name) return found.version;
    }
  }
  throw new Error(`cannot find the installed version of ${name}`);
}

const dependencies = {};
for (const name of NATIVE) {
  if (!pkg.dependencies?.[name]) continue;
  dependencies[name] = installedVersion(name);
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
