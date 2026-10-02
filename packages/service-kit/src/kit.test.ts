import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { decodeCursor, encodeCursor } from './cursor';
import { HttpProblem } from './errors';
import { z } from 'zod';

describe('loadConfig', () => {
  it('applies defaults and service-specific keys', () => {
    const config = loadConfig({ EXTRA: z.coerce.number().default(3) }, { SERVICE_NAME: 'svc' });
    expect(config).toMatchObject({ SERVICE_NAME: 'svc', PORT: 0, EVENT_PREFIX: 'lp', EXTRA: 3 });
  });

  it('refuses to start with invalid configuration', () => {
    expect(() => loadConfig({}, { SERVICE_NAME: 'svc', EVENT_PREFIX: 'Bad-Prefix' })).toThrow(
      /EVENT_PREFIX/,
    );
    expect(() => loadConfig({}, {})).toThrow(/SERVICE_NAME/);
  });
});

describe('cursors', () => {
  it('round-trip and reject garbage', () => {
    const cursor = encodeCursor({ c: '2026-10-02T00:00:00.000Z', id: 'abc' });
    expect(decodeCursor(cursor)).toEqual({ c: '2026-10-02T00:00:00.000Z', id: 'abc' });
    expect(decodeCursor(undefined)).toBeNull();
    expect(() => decodeCursor('%%%')).toThrow(HttpProblem);
  });
});
