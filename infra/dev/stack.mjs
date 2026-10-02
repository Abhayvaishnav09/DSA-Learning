#!/usr/bin/env node
// Native dev stack: runs Postgres, NATS JetStream, Redis, Mailpit and every service as local
// processes, for machines without Docker (docker compose in infra/compose is the usual path).
//
//   node infra/dev/stack.mjs infra    start only Postgres, NATS, Redis, Mailpit
//   node infra/dev/stack.mjs up       infra + all services + gateway
//   node infra/dev/stack.mjs down     stop everything
//   node infra/dev/stack.mjs status
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chownSync,
} from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATEWAY_PORT, INFRA, SERVICES } from './services.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stackDir = join(root, '.stack');
const pidDir = join(stackDir, 'pids');
const logDir = join(stackDir, 'logs');
const pgData = join(stackDir, 'pg');
const PG_BIN = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin';
const GO_BIN = process.env.GO_TOOLS ?? '/root/go-tools/bin';
const asPostgres = process.getuid?.() === 0 ? ['runuser', '-u', 'postgres', '--'] : [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(port, name, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(port)) return;
    await sleep(200);
  }
  throw new Error(`${name} did not open port ${port}; see ${logDir}/${name}.log`);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });
}

function spawnLogged(name, cmd, args, env = {}) {
  const log = openSync(join(logDir, `${name}.log`), 'a');
  const child = spawn(cmd, args, {
    cwd: root,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
  writeFileSync(join(pidDir, `${name}.pid`), String(child.pid));
}

async function startPostgres() {
  if (await portOpen(INFRA.postgres.port)) return;
  if (!existsSync(join(pgData, 'PG_VERSION'))) {
    mkdirSync(pgData, { recursive: true });
    if (asPostgres.length) chownSync(pgData, 102, 104);
    run(asPostgres[0] ?? join(PG_BIN, 'initdb'), [
      ...asPostgres.slice(1),
      ...(asPostgres.length ? [join(PG_BIN, 'initdb')] : []),
      '-D',
      pgData,
      '-U',
      'postgres',
      '--auth=trust',
      '-E',
      'UTF8',
    ]);
  }
  const pgCtl = [
    ...asPostgres,
    join(PG_BIN, 'pg_ctl'),
    '-D',
    pgData,
    '-l',
    join(pgData, 'server.log'),
    '-o',
    `-p ${INFRA.postgres.port} -k /tmp -c max_connections=400`,
    'start',
  ];
  run(pgCtl[0], pgCtl.slice(1));
  await waitForPort(INFRA.postgres.port, 'postgres');
}

function psql(sql, db = 'postgres') {
  return run('psql', [
    '-h',
    '127.0.0.1',
    '-p',
    String(INFRA.postgres.port),
    '-U',
    'postgres',
    '-d',
    db,
    '-tAc',
    sql,
  ]);
}

function ensureDatabases() {
  for (const name of Object.keys(SERVICES)) {
    if (!psql(`SELECT 1 FROM pg_roles WHERE rolname='${name}'`).trim()) {
      psql(`CREATE ROLE ${name} LOGIN PASSWORD '${name}'`);
    }
    if (!psql(`SELECT 1 FROM pg_database WHERE datname='${name}'`).trim()) {
      psql(`CREATE DATABASE ${name} OWNER ${name}`);
    }
  }
}

async function startInfra() {
  mkdirSync(pidDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  await startPostgres();
  ensureDatabases();
  if (!(await portOpen(INFRA.nats.port))) {
    mkdirSync(join(stackDir, 'nats'), { recursive: true });
    const conf = join(stackDir, 'nats.conf');
    writeFileSync(
      conf,
      `port: ${INFRA.nats.port}\nhttp_port: ${INFRA.nats.monitor}\nmax_payload: 8MB\njetstream { store_dir: "${join(stackDir, 'nats')}" }\n`,
    );
    spawnLogged('nats', join(GO_BIN, 'nats-server'), ['-c', conf]);
    await waitForPort(INFRA.nats.port, 'nats');
  }
  if (!(await portOpen(INFRA.redis.port))) {
    spawnLogged('redis', 'redis-server', [
      '--port',
      String(INFRA.redis.port),
      '--save',
      '',
      '--appendonly',
      'no',
    ]);
    await waitForPort(INFRA.redis.port, 'redis');
  }
  if (!(await portOpen(INFRA.mailpit.http)) && existsSync(join(GO_BIN, 'mailpit'))) {
    spawnLogged('mailpit', join(GO_BIN, 'mailpit'), [
      '--smtp',
      `127.0.0.1:${INFRA.mailpit.smtp}`,
      '--listen',
      `127.0.0.1:${INFRA.mailpit.http}`,
      '--smtp-auth-accept-any',
      '--smtp-auth-allow-insecure',
    ]);
    await waitForPort(INFRA.mailpit.http, 'mailpit');
  }
  console.log(
    `infra up: postgres :${INFRA.postgres.port}, nats :${INFRA.nats.port}, redis :${INFRA.redis.port}, mailpit :${INFRA.mailpit.http}`,
  );
}

export function serviceEnv(name) {
  return {
    SERVICE_NAME: name,
    HOST: '127.0.0.1',
    PORT: String(SERVICES[name]),
    DATABASE_URL: `postgres://${name}:${name}@127.0.0.1:${INFRA.postgres.port}/${name}`,
    NATS_URL: `nats://127.0.0.1:${INFRA.nats.port}`,
    JWKS_URL: `http://127.0.0.1:${SERVICES.identity}/.well-known/jwks.json`,
    SMTP_URL: `smtp://127.0.0.1:${INFRA.mailpit.smtp}`,
    REDIS_URL: `redis://127.0.0.1:${INFRA.redis.port}`,
    CONTENT_URL: `http://127.0.0.1:${SERVICES.content}`,
    AUTHORING_URL: `http://127.0.0.1:${SERVICES.authoring}`,
    PUBLIC_WEB_URL: process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
    // Dev-only bootstrap admin and http cookies; production sets these from secrets.
    ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? 'admin@logicpath.dev',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? 'admin-password-1',
    COOKIE_SECURE: 'false',
  };
}

async function startServices() {
  // The content service imports the YAML curriculum (compiled to a bundle) on first start.
  if (!existsSync(join(root, 'content', 'dist', 'bundle.json'))) {
    execFileSync('pnpm', ['--filter', '@logicpath/content', 'build'], {
      cwd: root,
      stdio: 'inherit',
    });
  }
  // identity first: everyone else fetches its JWKS.
  const order = [
    'identity',
    ...Object.keys(SERVICES).filter(
      (s) => s !== 'identity' && existsSync(join(root, 'services', s, 'src', 'main.ts')),
    ),
  ];
  for (const name of order) {
    if (await portOpen(SERVICES[name])) continue;
    spawnLogged(
      name,
      process.execPath,
      ['--import', 'tsx', join('services', name, 'src', 'main.ts')],
      serviceEnv(name),
    );
    await waitForPort(SERVICES[name], name, 60_000);
  }
  if (
    existsSync(join(root, 'services', 'gateway', 'src', 'main.ts')) &&
    !(await portOpen(GATEWAY_PORT))
  ) {
    spawnLogged(
      'gateway',
      process.execPath,
      ['--import', 'tsx', join('services', 'gateway', 'src', 'main.ts')],
      {
        ...serviceEnv('gateway'),
        PORT: String(GATEWAY_PORT),
        DATABASE_URL: '',
      },
    );
    await waitForPort(GATEWAY_PORT, 'gateway');
  }
  console.log(`services up; gateway http://127.0.0.1:${GATEWAY_PORT} (docs at /docs)`);
}

function stopAll() {
  if (existsSync(pidDir)) {
    for (const file of readdirSafe(pidDir)) {
      const pid = Number(readFileSync(join(pidDir, file), 'utf8'));
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // already gone
        }
      }
      rmSync(join(pidDir, file));
    }
  }
  if (existsSync(join(pgData, 'postmaster.pid'))) {
    try {
      run(asPostgres[0] ?? join(PG_BIN, 'pg_ctl'), [
        ...asPostgres.slice(1),
        ...(asPostgres.length ? [join(PG_BIN, 'pg_ctl')] : []),
        '-D',
        pgData,
        'stop',
        '-m',
        'fast',
      ]);
    } catch {
      // not running
    }
  }
  console.log('stack stopped');
}

function readdirSafe(dir) {
  try {
    return execFileSync('ls', [dir], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function status() {
  const rows = [
    ['postgres', INFRA.postgres.port],
    ['nats', INFRA.nats.port],
    ['redis', INFRA.redis.port],
    ['mailpit', INFRA.mailpit.http],
    ...Object.entries(SERVICES),
    ['gateway', GATEWAY_PORT],
  ];
  for (const [name, port] of rows)
    console.log(`${(await portOpen(port)) ? 'up  ' : 'down'}  ${name.padEnd(13)} :${port}`);
}

const command = process.argv[2];
if (command === 'infra') await startInfra();
else if (command === 'up') {
  await startInfra();
  await startServices();
} else if (command === 'services') await startServices();
else if (command === 'down') stopAll();
else if (command === 'status') await status();
else {
  console.log('usage: stack.mjs infra|up|services|down|status');
  process.exitCode = 2;
}
