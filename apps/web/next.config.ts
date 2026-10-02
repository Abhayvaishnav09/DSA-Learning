import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

/** In containers the web server forwards API paths to the gateway, so the browser stays same-origin. */
const apiTarget = process.env.API_PROXY_TARGET;
const API_PATHS = ['/v1/:path*', '/public/:path*', '/.well-known/:path*', '/media/:path*'];

const config: NextConfig = {
  reactStrictMode: true,
  // The Docker image runs the self-contained server (infra/docker/web.Dockerfile).
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? {
        output: 'standalone' as const,
        // Trace workspace packages from the monorepo root into the standalone server.
        outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
      }
    : {}),
  ...(apiTarget
    ? {
        rewrites: async () =>
          API_PATHS.map((source) => ({ source, destination: `${apiTarget}${source}` })),
      }
    : {}),
  // Workspace packages ship TypeScript source (docs/02-architecture.md §9).
  transpilePackages: [
    '@logicpath/api-client',
    '@logicpath/authoring-workflow',
    '@logicpath/content-tools',
    '@logicpath/contracts',
    '@logicpath/local-backend',
    '@logicpath/ui',
    '@logicpath/content-schema',
    '@logicpath/grader',
    '@logicpath/learning-engine',
    '@logicpath/visualizer',
  ],
  poweredByHeader: false,
  headers,
};

async function headers() {
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ];
}

export default config;
