import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // requestAnimationFrame, which motion's animation loop runs on.
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
    setupFiles: ['./src/test-setup.ts'],
  },
});
