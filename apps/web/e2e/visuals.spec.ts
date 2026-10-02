import { expect, test } from '@playwright/test';
import { seriousProblems } from './a11y';

/** 3D, motion and their fallbacks (ADR-0020), plus the marketing pages. */

test('the hero uses 3D when the device can, and 2D on request or with reduced motion', async ({
  page,
}) => {
  await page.goto('/');
  const hero = page.getByTestId('hero-visual');
  await expect(hero).not.toHaveAttribute('data-tier', 'pending');
  const tier = await hero.getAttribute('data-tier');
  if (tier !== 'lite') await expect(hero.locator('canvas')).toHaveCount(1);

  await page.goto('/?lite=1');
  await expect(page.getByTestId('hero-fallback')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('reduced motion gets the flat map and no 3D', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/learn');
  await expect(page.getByTestId('learning-map')).toHaveAttribute('data-view', 'flat');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
});

test('the map opens a concept from a click, the keyboard, or a link', async ({ page }) => {
  await page.goto('/learn?lite=1');
  const map = page.getByTestId('learning-map');
  await expect(map).toHaveAttribute('data-view', 'flat');

  // Click a node.
  await map.getByRole('button', { name: 'Loops with a counter' }).click();
  const sheet = page.getByRole('dialog', { name: 'Loops with a counter' });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/concept=loops\.counter/);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/concept=/);

  // Keyboard: focus the map, walk the path, open with Enter.
  await map.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  // Deep link straight to a concept, then into its lesson.
  await page.goto('/learn?concept=loops.counter&lite=1');
  await page.getByRole('link', { name: 'Open lesson' }).click();
  await expect(page).toHaveURL(/\/learn\/loops\.counter$/);
});

test('the 3D map can be switched to the flat map', async ({ page }) => {
  await page.goto('/learn');
  const map = page.getByTestId('learning-map');
  const view = await map.getAttribute('data-view');
  test.skip(view !== '3d', 'this browser has no WebGL2');
  await expect(map.locator('canvas')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Flat map' }).click();
  await expect(map).toHaveAttribute('data-view', 'flat');
  await expect(map.getByTestId('flat-map')).toBeVisible();
});

test('the developer portal lists the public API straight from the contract', async ({ page }) => {
  await page.goto('/developers');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Build with the LogicPath curriculum',
  );
  const table = page.getByRole('table', { name: 'Public API endpoints' });
  for (const path of ['/public/v1/curriculum', '/public/v1/concepts/:id', '/public/v1/items']) {
    await expect(table.getByText(path, { exact: true })).toBeVisible();
  }
});

for (const path of [
  '/how-it-works',
  '/developers',
  '/legal/privacy',
  '/legal/terms',
  '/learn?lite=1',
]) {
  test(`no serious accessibility problems: ${path}`, async ({ page }) => {
    await page.goto(path);
    expect(await seriousProblems(page)).toEqual([]);
  });
}
