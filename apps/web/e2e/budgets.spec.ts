import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

/**
 * Performance budgets (docs/11-quality-testing.md), in compressed bytes:
 * - critical path: the scripts a page's HTML loads before it can be used;
 * - 3D: what the 3D scene adds on top, loaded later and only where it is shown.
 * The in-page demo backend (guest/demo mode only) is neither: production talks to the API.
 */

const KB = 1024;
// Lessons carry the interpreter, grader and scheduler, so they get a little more. The landing
// page shows the program player, which now draws list cells, marks and a comparisons meter.
const BUDGET = { criticalJs: 366 * KB, lessonJs: 380 * KB, threeD: 250 * KB };

async function criticalJs(page: Page, path: string): Promise<number> {
  const html = await (await page.request.get(path)).text();
  const scripts = [...new Set([...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]!))];
  const sizes = await Promise.all(
    scripts.map(async (src) => gzipSync(await (await page.request.get(src)).body()).length),
  );
  return sizes.reduce((a, b) => a + b, 0);
}

async function loadedJs(page: Page, url: string): Promise<number> {
  const sizes: Promise<number>[] = [];
  page.on('response', (r) => {
    if (r.request().resourceType() === 'script') {
      sizes.push(
        r
          .body()
          .then((b) => gzipSync(b).length)
          .catch(() => 0),
      );
    }
  });
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  return (await Promise.all(sizes)).reduce((a, b) => a + b, 0);
}

test.describe('budgets', () => {
  test.skip(({ isMobile }) => isMobile, 'same bundles on every device; measured once');

  for (const path of ['/', '/learn', '/learn/loops.counter']) {
    test(`critical-path JavaScript: ${path}`, async ({ page }) => {
      const bytes = await criticalJs(page, path);
      console.log(`${path}: ${(bytes / KB).toFixed(0)} KB critical JS`);
      expect(bytes).toBeLessThan(path.startsWith('/learn/') ? BUDGET.lessonJs : BUDGET.criticalJs);
    });
  }

  for (const path of ['/', '/learn']) {
    test(`3D adds at most its budget: ${path}`, async ({ browser }) => {
      const lite = await loadedJs(await browser.newPage(), `${path}?lite=1`);
      const full = await loadedJs(await browser.newPage(), path);
      console.log(`${path}: 3D adds ${((full - lite) / KB).toFixed(0)} KB`);
      expect(full - lite).toBeLessThan(BUDGET.threeD);
    });
  }
});
