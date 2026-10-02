'use client';

import { ENDPOINT_META } from '@logicpath/contracts/meta';
import { Badge, Button, Callout, Card, DataTable } from '@logicpath/ui';
import { Reveal, Stagger, StaggerItem } from '@logicpath/ui/motion';
import { BookOpenCheck, Gauge, KeyRound, ShieldCheck, Webhook } from 'lucide-react';
import Link from 'next/link';
import { routes } from '@/shared/routing/routes';
import { CodeSample } from './CodeSample';

/**
 * The public API portal (ADR-0021). Developer docs are in English, the industry default;
 * the endpoint list is read from the contract table, so it can never drift from the API.
 */

const BASE = 'https://api.logicpath.dev';

const PUBLIC_ENDPOINTS = Object.entries(ENDPOINT_META)
  .filter(([, e]) => e.auth === 'apiKey')
  .map(([id, e]) => ({ id, ...e }));

const PLANS = [
  { plan: 'Free', perMinute: 60, perDay: '2,000', who: 'Anyone with a LogicPath account (18+)' },
  {
    plan: 'Partner',
    perMinute: 600,
    perDay: '100,000',
    who: 'Schools and education partners, on request',
  },
];

const SAMPLES = [
  {
    lang: 'curl',
    code: `curl ${BASE}/public/v1/curriculum \\
  -H "X-API-Key: $LOGICPATH_API_KEY"`,
  },
  {
    lang: 'JavaScript',
    code: `const res = await fetch('${BASE}/public/v1/curriculum', {
  headers: { 'X-API-Key': process.env.LOGICPATH_API_KEY },
});
if (!res.ok) throw new Error((await res.json()).detail);
const { stages, concepts } = await res.json();`,
  },
  {
    lang: 'Python',
    code: `import os, requests

res = requests.get(
    "${BASE}/public/v1/curriculum",
    headers={"X-API-Key": os.environ["LOGICPATH_API_KEY"]},
    timeout=10,
)
res.raise_for_status()
curriculum = res.json()`,
  },
];

const ERROR_SAMPLE = `HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
RateLimit-Limit: 60
RateLimit-Remaining: 0
RateLimit-Reset: 23
Retry-After: 23

{
  "type": "https://logicpath.dev/problems/rate-limited",
  "title": "Too many requests",
  "status": 429,
  "detail": "This key allows 60 requests a minute. Try again in 23 seconds."
}`;

const FEATURES = [
  {
    icon: BookOpenCheck,
    title: 'The whole curriculum',
    body: 'Stages, concepts, lessons and practice questions in English and Hinglish.',
  },
  {
    icon: KeyRound,
    title: 'Simple keys',
    body: 'One header, shown once when created, revocable any time.',
  },
  {
    icon: Gauge,
    title: 'Fair limits',
    body: 'Per-key rate limits and daily quotas, reported in standard headers.',
  },
  {
    icon: ShieldCheck,
    title: 'Safe by design',
    body: 'Read-only, no learner data, and answer keys are never included.',
  },
];

export function Developers() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 tablet:px-6">
      <Stagger className="mb-12 flex max-w-2xl flex-col gap-4">
        <StaggerItem>
          <Badge tone="accent" size="md">
            <Webhook aria-hidden /> Public API · v1
          </Badge>
        </StaggerItem>
        <StaggerItem>
          <h1 className="text-4xl font-bold">Build with the LogicPath curriculum</h1>
        </StaggerItem>
        <StaggerItem>
          <p className="text-lg text-muted">
            A free, structured curriculum for programming logic, from first ideas to interview
            preparation. Use it in your own apps, school portals and study tools.
          </p>
        </StaggerItem>
        <StaggerItem className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={routes.developerSettings}>Get an API key</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <a href="#quickstart">Quickstart</a>
          </Button>
        </StaggerItem>
      </Stagger>

      <div className="mb-16 grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.05} className="h-full">
            <Card className="flex h-full flex-col gap-2">
              <f.icon className="size-6 text-accent" aria-hidden />
              <h2 className="font-semibold">{f.title}</h2>
              <p className="text-sm text-muted">{f.body}</p>
            </Card>
          </Reveal>
        ))}
      </div>

      <section id="quickstart" className="mb-16 flex scroll-mt-24 flex-col gap-5">
        <h2 className="text-2xl font-bold">Quickstart</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted marker:font-semibold marker:text-accent">
          <li>
            Sign in, open{' '}
            <Link className="text-accent underline" href={routes.developerSettings}>
              Settings → API keys
            </Link>{' '}
            and create a key. Copy it: it is shown only once.
          </li>
          <li>
            Keep it on your server (an environment variable), never in a web page or app bundle.
          </li>
          <li>
            Send it in the <code className="rounded bg-code px-1.5 py-0.5 text-fg">X-API-Key</code>{' '}
            header:
          </li>
        </ol>
        <CodeSample samples={SAMPLES} label="Language" />
      </section>

      <section className="mb-16 flex flex-col gap-5">
        <h2 className="text-2xl font-bold">Endpoints</h2>
        <DataTable
          caption="Public API endpoints"
          rows={PUBLIC_ENDPOINTS}
          rowKey={(e) => e.id}
          columns={[
            {
              key: 'method',
              header: 'Method',
              cell: (e) => <Badge tone="success">{e.method}</Badge>,
              className: 'w-24',
            },
            {
              key: 'path',
              header: 'Path',
              cell: (e) => <code className="font-mono text-sm">{e.path}</code>,
              sortValue: (e) => e.path,
            },
            { key: 'summary', header: 'What it returns', cell: (e) => e.summary },
          ]}
        />
        <p className="text-sm text-muted">
          Base URL <code className="font-mono">{BASE}</code>. Every response is JSON and carries an{' '}
          <code className="font-mono">ETag</code>; send it back in{' '}
          <code className="font-mono">If-None-Match</code> to get{' '}
          <code className="font-mono">304 Not Modified</code> when nothing changed. The full
          reference (OpenAPI 3.1) is at <code className="font-mono">{BASE}/public/docs</code>.
        </p>
      </section>

      <section className="mb-16 flex flex-col gap-5">
        <h2 className="text-2xl font-bold">Limits and quotas</h2>
        <DataTable
          caption="Plans"
          rows={PLANS}
          rowKey={(p) => p.plan}
          columns={[
            {
              key: 'plan',
              header: 'Plan',
              cell: (p) => <span className="font-semibold">{p.plan}</span>,
            },
            { key: 'minute', header: 'Requests / minute', cell: (p) => p.perMinute },
            { key: 'day', header: 'Requests / day', cell: (p) => p.perDay },
            { key: 'who', header: 'Who', cell: (p) => p.who },
          ]}
        />
        <p className="text-muted">
          Each response reports <code className="font-mono">RateLimit-Limit</code>,{' '}
          <code className="font-mono">RateLimit-Remaining</code> and{' '}
          <code className="font-mono">RateLimit-Reset</code>. Errors use RFC 9457 problem details:
        </p>
        <CodeSample samples={[{ lang: 'HTTP', code: ERROR_SAMPLE }]} label="Example" />
      </section>

      <section className="grid gap-4 desktop:grid-cols-2">
        <Callout tone="info" title="Versioning">
          The API is versioned in the path (<code className="font-mono">/public/v1</code>).
          Additions never break existing clients. A breaking change means a new version, and the old
          one keeps working for at least six months, announced with{' '}
          <code className="font-mono">Deprecation</code> and{' '}
          <code className="font-mono">Sunset</code> headers.
        </Callout>
        <Callout tone="warning" title="Fair use">
          Show &quot;Curriculum by LogicPath&quot; where you display the content. Do not resell raw
          access or try to rebuild answer keys. Keys that break these rules are revoked.
        </Callout>
      </section>
    </div>
  );
}
