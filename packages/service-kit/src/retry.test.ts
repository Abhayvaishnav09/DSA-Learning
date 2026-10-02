import { describe, expect, it, vi } from 'vitest';
import { retry } from './retry';

describe('retry', () => {
  it('keeps trying until the step succeeds', async () => {
    let calls = 0;
    const onRetry = vi.fn();
    const result = await retry(
      'connect',
      async () => {
        calls++;
        if (calls < 3) throw new Error('ECONNREFUSED');
        return 'ok';
      },
      { baseMs: 1, onRetry },
    );
    expect(result).toBe('ok');
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('gives up with a clear error', async () => {
    await expect(
      retry('connect to database', () => Promise.reject(new Error('down')), {
        attempts: 2,
        baseMs: 1,
      }),
    ).rejects.toThrow('connect to database failed after 2 attempts: Error: down');
  });
});
