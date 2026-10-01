import type { NextConfig } from 'next';

/** STATIC_EXPORT=1 builds a plain static site (out/) for hosts without a Node server. */
const staticExport = process.env.STATIC_EXPORT === '1';

const config: NextConfig = {
  reactStrictMode: true,
  ...(staticExport ? { output: 'export' as const, trailingSlash: true } : {}),
  // Workspace packages ship TypeScript source (docs/02-architecture.md §9).
  transpilePackages: [
    '@logicpath/content-schema',
    '@logicpath/grader',
    '@logicpath/learning-engine',
    '@logicpath/visualizer',
  ],
  poweredByHeader: false,
  // Static hosts set their own headers; headers() only applies to `next start`.
  ...(staticExport ? {} : { headers }),
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
