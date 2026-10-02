import { expect, test } from '@playwright/test';
import { seriousProblems } from './a11y';

/** App frame, routing and access rules (docs/03-frontend.md, ADR-0019). */

test('signed-out visitors are sent to sign in, then back where they were going', async ({
  page,
}) => {
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fusers$/);
  await page.getByTestId('demo-admin').click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
});

test('each demo role lands in its own area, and roles are enforced', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('demo-writer').click();
  await expect(page).toHaveURL(/\/studio$/);

  // A writer opening the admin area gets a clear "not for your role" page.
  await page.goto('/admin');
  await expect(page.getByText('This area is for another role')).toBeVisible();

  // Sign out from the account menu.
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/studio');
  await expect(page).toHaveURL(/\/login/);
});

test('the frame adapts: bottom tabs on phones, sidebar on desktop', async ({ page, isMobile }) => {
  await page.goto('/learn');
  const nav = page.getByRole('navigation', { name: 'Main' });
  if (isMobile) {
    await expect(nav.filter({ visible: true })).toHaveCount(1);
    await expect(page.locator('nav.fixed').getByRole('link', { name: 'Learn' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  } else {
    await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  }
});

test('the command palette finds pages and lessons', async ({ page }) => {
  await page.goto('/learn');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByPlaceholder('Search lessons, pages and actions…');
  await expect(input).toBeVisible();
  await input.fill('gate');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/learn\/loops\.counter$/);
});

test('"animations off" stops motion everywhere from the first paint', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('demo-student').click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitemradio', { name: 'Off' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
});

test('unknown pages show a friendly not-found page', async ({ page }) => {
  const response = await page.goto('/no/such/page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

for (const path of ['/login', '/home', '/studio']) {
  test(`shell has no serious accessibility problems: ${path}`, async ({ page }) => {
    await page.goto('/login');
    if (path !== '/login') {
      await page.getByTestId(path === '/studio' ? 'demo-writer' : 'demo-student').click();
      await page.waitForURL(`**${path}`);
    }
    expect(await seriousProblems(page)).toEqual([]);
  });
}
