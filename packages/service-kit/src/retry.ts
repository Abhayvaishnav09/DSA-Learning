/**
 * Retries a startup step (database, message bus) with exponential backoff, so a service that
 * starts before its dependencies waits for them instead of crashing (containers start in any order).
 */
export async function retry<T>(
  step: string,
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    baseMs?: number;
    maxMs?: number;
    onRetry?: (error: unknown, attempt: number, waitMs: number) => void;
  } = {},
): Promise<T> {
  const { attempts = 12, baseMs = 250, maxMs = 8_000, onRetry } = options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts) {
        throw new Error(`${step} failed after ${attempts} attempts: ${String(error)}`, {
          cause: error,
        });
      }
      const waitMs = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      onRetry?.(error, attempt, waitMs);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
