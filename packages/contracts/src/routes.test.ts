import { describe, expect, it } from 'vitest';
import { ENDPOINTS, pathFor, routesOf, type Endpoint } from './routes';
import { learning } from './index';

describe('endpoint table', () => {
  const rows = Object.entries(ENDPOINTS as Record<string, Endpoint>);

  it('has one row per method and path, all versioned', () => {
    const keys = rows.map(([, e]) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const [id, e] of rows) {
      expect(e.path, id).toMatch(/^\/(v1|public\/v1)\//);
      expect(e.auth === 'apiKey', id).toBe(e.path.startsWith('/public/'));
      // Path parameters must be declared.
      const names = [...e.path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]);
      if (names.length > 0) expect(e.params, id).toBeDefined();
    }
  });

  it('fills path parameters safely', () => {
    expect(pathFor('/v1/classes/:id/membership', { id: 'a b' })).toBe(
      '/v1/classes/a%20b/membership',
    );
    expect(() => pathFor('/v1/classes/:id', {})).toThrow(/missing path parameter id/);
  });

  it('lists a service’s rows for contract tests', () => {
    expect(routesOf('profile')).toEqual(['GET /v1/me/profile', 'PATCH /v1/me/profile']);
  });

  it('validates answers the same way the grader types them', () => {
    expect(learning.Answer.safeParse({ type: 'truth-table', rows: [['true']] }).success).toBe(true);
    expect(learning.Answer.safeParse({ type: 'truth-table', rows: [['yes']] }).success).toBe(false);
  });
});

describe('generated endpoint metadata', () => {
  it('matches the endpoint table (run `pnpm --filter @logicpath/contracts gen` after changing it)', async () => {
    const { ENDPOINT_META } = await import('./meta');
    const expected = Object.fromEntries(
      Object.entries(ENDPOINTS as Record<string, Endpoint>).map(([id, e]) => [
        id,
        {
          method: e.method,
          path: e.path,
          service: e.service,
          auth: e.auth,
          status: e.status,
          summary: e.summary,
          ...(e.bodyType ? { bodyType: e.bodyType } : {}),
          ...(e.planned ? { planned: e.planned } : {}),
        },
      ]),
    );
    expect(ENDPOINT_META).toEqual(expected);
  });
});
