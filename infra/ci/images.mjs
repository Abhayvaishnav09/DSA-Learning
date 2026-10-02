#!/usr/bin/env node
// Prints the container images CI/CD builds, as JSON for a GitHub Actions matrix:
// every service that exists, plus the gateway and the website. New services join automatically.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SERVICES } from '../dev/services.mjs';

const root = new URL('../..', import.meta.url).pathname;
const services = Object.keys(SERVICES).filter((name) =>
  existsSync(join(root, 'services', name, 'src', 'main.ts')),
);
const images = [
  ...[...services, 'gateway'].map((name) => ({
    name,
    dockerfile: 'infra/docker/service.Dockerfile',
    service: name,
  })),
  { name: 'web', dockerfile: 'infra/docker/web.Dockerfile', service: '' },
];
// `--arch`: one entry per image and CPU type, built on a native runner of that type (no emulation).
// The Oracle Cloud free VM is arm64; Kubernetes and Render are usually amd64.
const perArch = process.argv.includes('--arch')
  ? images.flatMap((image) => [
      { ...image, arch: 'amd64', runner: 'ubuntu-24.04' },
      { ...image, arch: 'arm64', runner: 'ubuntu-24.04-arm' },
    ])
  : images;
process.stdout.write(JSON.stringify({ include: perArch }));
