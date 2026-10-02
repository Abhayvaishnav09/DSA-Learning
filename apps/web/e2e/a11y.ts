import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * Waits until nothing on the page is still fading or sliding in. Text that is half transparent
 * reads as low contrast to axe, although it is only a moment of the entrance animation.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const deadline = performance.now() + 4000;
        let quietFrames = 0;
        const check = () => {
          const running = document
            .getAnimations()
            .some(
              (a) =>
                a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity,
            );
          quietFrames = running ? 0 : quietFrames + 1;
          // A few quiet frames in a row: the entrance has finished and nothing new has started.
          if (quietFrames >= 6 || performance.now() > deadline) resolve();
          else requestAnimationFrame(check);
        };
        check();
      }),
  );
}

/** Serious and critical WCAG 2.2 AA problems on the page as it is now, one line each. */
export async function seriousProblems(page: Page): Promise<string[]> {
  await settle(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
