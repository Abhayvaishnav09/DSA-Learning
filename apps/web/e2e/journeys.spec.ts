import { expect, test, type Page } from '@playwright/test';
import { seriousProblems as serious } from './a11y';

/** What each role can do from start to finish, on the demo backend that runs in the browser. */

// Journeys sign in and out several times and load whole pages; give them room on a busy machine.
test.describe.configure({ timeout: 90_000 });

type Role = 'student' | 'writer' | 'admin';
const HOME: Record<Role, RegExp> = { student: /\/home$/, writer: /\/studio$/, admin: /\/admin$/ };

async function signIn(page: Page, role: Role) {
  await page.goto('/login');
  await page.getByTestId(`demo-${role}`).click();
  await expect(page).toHaveURL(HOME[role]);
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function stepToEnd(page: Page) {
  const forward = page.getByRole('button', { name: 'Step forward' });
  while (await forward.isEnabled()) await forward.click();
}

test('learning on an account is counted: XP, a badge and the league follow', async ({ page }) => {
  await signIn(page, 'student');
  await page.goto('/learn/loops.counter');
  await page.getByTestId('beat-next').click();
  await stepToEnd(page);
  await page.getByTestId('beat-next').click();
  await stepToEnd(page);
  await page.getByRole('radio', { name: /The loop stops/ }).check();
  await page.getByRole('button', { name: 'Check' }).click();
  await stepToEnd(page);
  await page.getByTestId('beat-next').click();
  await page.getByRole('radio', { name: '4', exact: true }).check();
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByTestId('feedback')).toContainText('Correct!');
  await page.getByRole('button', { name: /i is 1, 2, 3, 4, and the indented line/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // The answers go to the account in the background; the dashboard and profile catch up.
  await page.goto('/profile');
  await expect(page.getByTestId('badge-first-answer')).toHaveAttribute('data-earned', 'true', {
    timeout: 15_000,
  });
  await page.goto('/home');
  await expect(page.getByTestId('home-streak')).toContainText('1 day');
  await expect(page.getByTestId('home-level')).toHaveText('Level 1');
  await page.goto('/leaderboard');
  await expect(page.getByTestId('standings').locator('[data-me="true"]')).toContainText('You');
  await page.goto('/notifications');
  await expect(page.getByTestId('inbox-list')).toContainText('New badge: First step');
});

test('a young learner needs a parent to approve before the account starts', async ({ page }) => {
  const year = new Date().getFullYear() - 12;
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Kiran Kid');
  await page.getByLabel(/^Email/).fill('kiran@example.com');
  await page.getByLabel('Password').fill('a-long-password');
  await page.getByLabel('Year of birth').fill(String(year));
  await expect(page.getByText('We need a parent or guardian')).toBeVisible();
  await page.getByLabel('Parent or guardian email').fill('parent@example.com');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('waiting-body')).toContainText('parent@example.com');

  // Before approval, signing in is refused (checked in a second tab of the same browser).
  const other = await page.context().newPage();
  await other.goto('/login');
  await other.getByLabel(/^Email/).fill('kiran@example.com');
  await other.getByLabel('Password').fill('a-long-password');
  await other.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(other.getByText('Waiting for a parent or guardian to approve')).toBeVisible();
  await other.close();

  // The parent opens the link from the (demo) email and says yes.
  await expect(page.getByText('Demo mailbox')).toBeVisible();
  await page.getByRole('link', { name: /approve Kiran Kid/ }).click();
  await expect(page.getByTestId('consent-grant')).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.getByTestId('consent-grant').click();
  await expect(page.getByTestId('consent-granted')).toBeVisible();

  // Now the learner can sign in.
  await page.goto('/login');
  await page.getByLabel(/^Email/).fill('kiran@example.com');
  await page.getByLabel('Password').fill('a-long-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('home-greeting')).toContainText('Kiran');
});

test('a forgotten password is reset from the emailed link, once', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Riya Reset');
  await page.getByLabel(/^Email/).fill('riya@example.com');
  await page.getByLabel('Password').fill('first-password');
  await page.getByLabel('Year of birth').fill('1998');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await signOut(page);

  await page.goto('/forgot-password');
  await page.getByLabel(/^Email/).fill('riya@example.com');
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  await page.getByRole('link', { name: 'Reset your password' }).click();
  await page.getByLabel('New password').fill('second-password');
  await page.getByLabel('Type it again').fill('different-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('The two passwords are different.')).toBeVisible();
  await page.getByLabel('Type it again').fill('second-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByTestId('reset-done')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel(/^Email/).fill('riya@example.com');
  await page.getByLabel('Password').fill('first-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Email or password is wrong')).toBeVisible();
  await page.getByLabel('Password').fill('second-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test('a question goes from a writer, through an admin, to every learner', async ({ page }) => {
  // The writer drafts a question.
  await signIn(page, 'writer');
  await page.goto('/studio/drafts/new');
  await page.getByTestId('draft-title').fill('Zebra crossing question');
  await page.getByTestId('draft-create').click();
  await expect(page.getByTestId('draft-heading')).toHaveText('Zebra crossing question');
  await page.getByTestId('add-item').click();
  await page.getByTestId('pick-concept').selectOption('loops.counter');
  await page.getByTestId('pick-go').click();
  await expect(page.getByTestId('editor-title')).toContainText('New Question');
  await expect(page.getByTestId('editor-save')).toBeDisabled();

  await page.getByTestId('prompt-en').fill('How many zebras cross when i runs from 1 to 3?');
  await page.getByTestId('prompt-hi').fill('i 1 se 3 tak chale to kitne zebra paar karte hain?');
  await page.getByTestId('option-0-en').fill('3');
  await page.getByTestId('option-0-hi').fill('3');
  await page.getByTestId('option-1-en').fill('4');
  await page.getByTestId('option-1-hi').fill('4');
  await page.getByTestId('hint-0-en').fill('List the values of i.');
  await page.getByTestId('hint-0-hi').fill('i ki values likho.');
  await page.getByTestId('explanation-en').fill('i is 1, 2, 3: three zebras.');
  await page.getByTestId('explanation-hi').fill('i 1, 2, 3 hai: teen zebra.');
  expect(await serious(page)).toEqual([]);

  // The preview is a working question.
  const preview = page.getByRole('complementary', { name: 'Preview' });
  await preview.getByRole('radio', { name: '3', exact: true }).check();
  await preview.getByRole('button', { name: 'Check' }).click();
  await expect(preview.getByTestId('feedback')).toContainText('Correct!');

  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('change-list')).toContainText('zebras cross');
  await page.getByTestId('draft-check').click();
  await expect(
    page.getByText('Everything checks out.').or(page.getByText('Fine to send')),
  ).toBeVisible();
  await page.getByTestId('draft-submit').click();
  await expect(page.getByTestId('status-in_review').first()).toBeVisible();
  await signOut(page);

  // The admin sees what changed, asks for a tweak, then approves.
  await signIn(page, 'admin');
  await page.goto('/admin/review');
  await page.getByTestId('queue-row').click();
  await expect(page.getByTestId('submission-title')).toHaveText('Zebra crossing question');
  await expect(page.getByTestId('submission-change')).toContainText('New');
  expect(await serious(page)).toEqual([]);
  await page.getByTestId('request-changes').click();
  await page.getByTestId('request-comment').fill('Please add a second hint.');
  await page.getByTestId('request-confirm').click();
  await expect(page.getByTestId('status-changes_requested').first()).toBeVisible();
  await signOut(page);

  await signIn(page, 'writer');
  await page.goto('/studio/drafts');
  await page.getByRole('link', { name: 'Zebra crossing question' }).click();
  await expect(page.getByTestId('reviewer-comment')).toHaveText('Please add a second hint.');
  await page.getByTestId('draft-submit').click();
  await expect(page.getByTestId('status-in_review').first()).toBeVisible();
  await signOut(page);

  await signIn(page, 'admin');
  await page.goto('/admin/review');
  await page.getByTestId('queue-row').click();
  await page.getByTestId('approve').click();
  await page.getByTestId('approve-confirm').click();
  await expect(page.getByTestId('status-published').first()).toBeVisible();
  await page.goto('/admin/content');
  await expect(page.getByTestId('live-manifest')).toContainText('v2');
  await signOut(page);

  // The writer is told, and learners can find the new question.
  await signIn(page, 'writer');
  await page.goto('/notifications');
  await expect(page.getByTestId('inbox-list')).toContainText('Published: Zebra crossing question');
  await page.goto('/search?q=zebras');
  await expect(page.getByTestId('search-hit').first()).toContainText('zebras');
});

test('search finds lessons and opens them', async ({ page }) => {
  await page.goto('/search?q=gate');
  await expect(page.getByTestId('search-count')).toBeVisible();
  await expect(page.getByTestId('search-hit').first()).toBeVisible();
  await page.getByTestId('search-hit').first().click();
  await expect(page).toHaveURL(/\/learn\/loops\.counter$/);
  await page.goto('/search?q=zzzzqqq');
  await expect(page.getByText('No matches')).toBeVisible();
});

test('a learner joins a class with a code and can leave it', async ({ page }) => {
  await signIn(page, 'student');
  await page.goto('/classes/join/DEMO42');
  await page.getByTestId('join-confirm').click();
  await expect(page.getByTestId('join-done')).toBeVisible();
  await page.goto('/classes');
  await page.getByTestId('class-list').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('class-leave')).toBeVisible();
  await page.getByTestId('class-leave').click();
  await page.getByTestId('class-leave-confirm').click();
  await expect(page.getByText('You are not in a class yet.')).toBeVisible();
  await page.getByTestId('class-code').fill('ZZZZZZ');
  await page.getByTestId('class-join').click();
  await expect(page.getByText(/was not found/)).toBeVisible();
});

test('admins manage users, flags and API keys', async ({ page }) => {
  // A learner creates a key and keeps its secret.
  await signIn(page, 'student');
  await page.goto('/settings/developer');
  await page.getByTestId('key-create').click();
  await page.getByLabel('Key name').fill('My site');
  await page.getByTestId('key-submit').click();
  await expect(page.getByTestId('key-secret')).toContainText('lp_live_');
  await page.getByTestId('key-saved').click();
  await expect(page.getByTestId('key-My site')).toBeVisible();
  await signOut(page);

  await signIn(page, 'admin');
  await page.goto('/admin/api-keys');
  await page.getByTestId('key-edit-My site').click();
  await page.getByTestId('key-plan').selectOption('partner');
  await page.getByTestId('key-save').click();
  await expect(page.getByRole('row', { name: /My site/ })).toContainText('Partner');
  await page
    .getByRole('row', { name: /My site/ })
    .getByRole('button', { name: 'Revoke' })
    .click();
  await page.getByTestId('key-revoke-confirm').click();
  await expect(page.getByRole('row', { name: /My site/ })).toContainText('Revoked');

  // Flags can be switched, and the change sticks.
  await page.goto('/admin/flags');
  const flag = page.getByRole('switch', { name: 'On: beta.review-nudges' });
  await expect(flag).toBeChecked();
  await flag.click();
  await expect(flag).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'On: beta.review-nudges' })).not.toBeChecked();

  // A user can be found and suspended, then reactivated.
  await page.goto('/admin/users');
  await page.getByTestId('user-search').fill('learner1@demo.logicpath.dev');
  await expect(page.getByTestId('user-row')).toHaveCount(1);
  await page.getByTestId('user-row').click();
  await page.getByTestId('user-toggle-status').click();
  await page.getByTestId('user-suspend-confirm').click();
  await expect(page.getByTestId('user-status')).toHaveText('Suspended');
  await page.getByTestId('user-toggle-status').click();
  await expect(page.getByTestId('user-status')).toHaveText('Active');
});

test('the admin charts can be read with a pointer, the keyboard, or as a table', async ({
  page,
  isMobile,
}) => {
  await signIn(page, 'admin');
  await expect(page.getByTestId('overview-loaded')).toBeVisible();
  const chart = page.getByRole('slider', { name: /Answers per day/ });
  await chart.focus();
  await expect(page.getByTestId('chart-tooltip').first()).toBeVisible();
  const before = await chart.getAttribute('aria-valuetext');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => chart.getAttribute('aria-valuetext')).not.toBe(before);
  if (!isMobile) {
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('chart-tooltip').first()).toBeVisible();
  }
  // The same numbers as a table.
  await page.getByRole('button', { name: 'Show as a table' }).first().click();
  const table = page.getByRole('table', { name: /Answers per day/ });
  await expect(table.getByRole('row')).toHaveCount(31); // 30 days and the header
  // A different time range keeps working.
  await page.getByRole('radio', { name: 'Last 7 days' }).click();
  await expect(page.getByTestId('overview-loaded')).toBeVisible();
});

const ROUTES: Record<Role, string[]> = {
  student: [
    '/home',
    '/profile',
    '/settings',
    '/settings/developer',
    '/search?q=loop',
    '/notifications',
    '/leaderboard',
    '/classes',
    '/classes/join/DEMO42',
  ],
  writer: ['/studio', '/studio/drafts', '/studio/drafts/new', '/studio/media', '/studio/stats'],
  admin: [
    '/admin',
    '/admin/review',
    '/admin/content',
    '/admin/users',
    '/admin/classes',
    '/admin/flags',
    '/admin/api-keys',
    '/admin/media',
    '/admin/audit',
  ],
};

for (const role of ['student', 'writer', 'admin'] as const) {
  test(`every ${role} page has no serious accessibility problems and no errors`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page, role);
    for (const path of ROUTES[role]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      expect(await serious(page), path).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

for (const path of [
  '/signup',
  '/forgot-password',
  '/reset-password?token=x',
  '/verify-email?token=x',
  '/consent/abc',
]) {
  test(`${path} is accessible and handles a bad link kindly`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await serious(page)).toEqual([]);
    await expect(page.getByText('Application error')).toHaveCount(0);
  });
}
