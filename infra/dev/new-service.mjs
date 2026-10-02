#!/usr/bin/env node
// Creates the files every service has, so a new one starts the same way as the others:
//   node infra/dev/new-service.mjs <name> [--no-schema] [extra workspace packages...]
// The name must already be in infra/dev/services.mjs (which reserves its port). Afterwards write
// src/schema.ts and src/service.ts, run `pnpm install`, then `pnpm --filter ./services/<name>
// db:generate -- --name init` for the migration (a service that keeps nothing of its own in
// the database takes --no-schema). See docs/04-backend.md.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICES } from './services.mjs';

const args = process.argv.slice(2);
const schema = !args.includes('--no-schema');
const [name, ...extra] = args.filter((a) => a !== '--no-schema');
if (!name || !(name in SERVICES)) {
  console.error(
    `usage: new-service.mjs <name> [workspace packages]\nknown: ${Object.keys(SERVICES).join(', ')}`,
  );
  process.exit(1);
}
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'services', name);
if (existsSync(join(dir, 'package.json'))) {
  console.error(`services/${name} already exists`);
  process.exit(1);
}
const write = (file, text) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
};
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const camel = name.replace(/-(\w)/g, (_, c) => c.toUpperCase());

const dependencies = {
  '@logicpath/contracts': 'workspace:*',
  '@logicpath/service-kit': 'workspace:*',
  ...Object.fromEntries(extra.map((p) => [p, 'workspace:*'])),
  ...(schema ? { 'drizzle-orm': '^0.45.3' } : {}),
  zod: '^4.6.5',
};
write(
  'package.json',
  json({
    name: `@logicpath/${name}-service`,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx watch src/main.ts',
      build: 'node ../../infra/build-service.mjs',
      lint: 'eslint .',
      typecheck: 'tsc -p tsconfig.json',
      'test:integration': 'vitest run',
      ...(schema ? { 'db:generate': 'drizzle-kit generate' } : {}),
    },
    dependencies: Object.fromEntries(
      Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)),
    ),
    devDependencies: {
      '@types/node': '^26.6.4',
      ...(schema ? { 'drizzle-kit': '^0.31.11' } : {}),
      tsx: '^4.23.15',
      vitest: '^5.0.3',
    },
  }),
);
write(
  'tsconfig.json',
  json({
    extends: '../../tsconfig.base.json',
    compilerOptions: { types: ['node'] },
    include: ['src', 'test'],
  }),
);
write(
  'vitest.config.ts',
  `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.int.test.ts'], testTimeout: 30_000, hookTimeout: 60_000 },
});
`,
);
if (schema) {
  write(
    'drizzle.config.ts',
    `import { defineConfig } from 'drizzle-kit';

export default defineConfig({ dialect: 'postgresql', schema: './src/schema.ts', out: './drizzle' });
`,
  );
}
write(
  'src/main.ts',
  `import { loadConfig, runService } from '@logicpath/service-kit';
import { env, ${camel}Service } from './service';

await runService(${camel}Service(loadConfig(env)));
`,
);
console.log(`created services/${name}; port ${SERVICES[name]}`);
