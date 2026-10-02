import { defineConfig } from 'vitest/config';

// Journeys through the gateway against a running stack (`pnpm stack:up`, or a deployed server):
//   STACK_URL=http://127.0.0.1:8080 pnpm --filter @logicpath/gateway test:stack
export default defineConfig({
  test: {
    include: ['test/stack/**/*.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
