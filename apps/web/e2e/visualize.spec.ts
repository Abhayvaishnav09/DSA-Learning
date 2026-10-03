import { expect, test, type Page } from '@playwright/test';
import { seriousProblems } from './a11y';

/** "Visualize your code": real Python in a Worker, drawn by the lesson player. */

// The first run downloads Python (about 13 MB) from this site.
const PYTHON_READY = 90_000;

/** Opens the screen and waits for the page to come alive (clicks before hydration do nothing). */
async function open(page: Page, path = '/visualize') {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

async function runAndWait(page: Page) {
  await page.getByTestId('viz-run').click();
  await expect(page.getByTestId('visualizer')).toBeVisible({ timeout: PYTHON_READY });
}

async function stepUntil(page: Page, done: () => Promise<boolean>) {
  const forward = page.getByRole('button', { name: 'Step forward' });
  for (let i = 0; i < 1100 && !(await done()); i++) await forward.click();
}

test.describe.configure({ timeout: 150_000 });

test('the linear-search example runs as real Python, cell by cell', async ({ page }) => {
  await open(page);
  await runAndWait(page);
  const caption = page.getByTestId('viz-caption');
  await expect(caption).toHaveText(/^Ready/);

  // Step to the comparison that finds Emma: her cell turns "found", the earlier ones are checked.
  await stepUntil(
    page,
    async () => (await caption.textContent())?.includes("'Emma' == 'Emma'") ?? false,
  );
  await expect(caption).toContainText('Yes (True)');
  const papers = page.getByTestId('viz-vars').getByRole('list', { name: /^papers:/ });
  await expect(papers.getByText('"Emma" (found)')).toBeVisible();
  await expect(papers.getByText('"Alice" (checked)')).toBeAttached();
  await expect(page.getByTestId('viz-checks')).toContainText(
    '5 comparisons so far (5 in this run)',
  );

  // To the end with the keyboard.
  await page.getByTestId('visualizer').focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect(caption).toHaveText('The program has finished.');
  await expect(page.getByTestId('viz-output')).toHaveText("Is 'Emma' in papers list? True");

  // The algorithm is named, and its Big-O is measured: best O(1), worst O(n).
  await expect(page.getByTestId('algorithm')).toContainText('Linear search');
  await expect(page.getByTestId('big-o')).toHaveText('O(n)', { timeout: 30_000 });
  await expect(page.getByTestId('verdict-text')).toContainText('Certain', { timeout: 30_000 });
  await expect(page.getByTestId('derivation')).toContainText('runs n times');
  await expect(page.getByTestId('case-Best case')).toContainText('O(1)');
  await expect(page.getByTestId('case-Worst case')).toContainText('Key not in the list');
  await expect(page.getByTestId('algorithm')).toContainText('Matches the textbook.');
});

test('an uploaded .py file runs, with input() and a clear error', async ({ page }) => {
  await open(page);
  await page.getByTestId('viz-file').setInputFiles({
    name: 'double.py',
    mimeType: 'text/x-python',
    buffer: Buffer.from('n = int(input("n? "))\nprint(n * 2)\nprint(n / 0)\n'),
  });
  await expect(page.getByTestId('viz-code')).toHaveValue(/print\(n \* 2\)/);
  await page.getByTestId('viz-stdin').fill('21');
  await runAndWait(page);
  await expect(page.getByText('The program stopped with an error.')).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByTestId('viz-caption')).toHaveText(
    'Line 3: ZeroDivisionError: division by zero. A number cannot be divided by 0.',
    { timeout: 20_000 },
  );
  await expect(page.getByTestId('viz-output')).toContainText('42');
});

test('an endless loop is stopped and explained', async ({ page }) => {
  await open(page);
  await page.getByTestId('viz-code').fill('n = 0\nwhile True:\n    n = n + 1\n');
  await runAndWait(page);
  await page.getByTestId('visualizer').focus();
  await page.keyboard.press('End');
  await expect(page.getByTestId('viz-caption')).toContainText('Does this loop ever end?');
  await expect(page.getByRole('button', { name: 'Step forward' })).toBeDisabled();
});

test('pseudocode works too, without downloading Python', async ({ page }) => {
  await open(page);
  await page.getByRole('radio', { name: 'Pseudocode' }).click();
  await page.getByTestId('viz-example').selectOption('pseudo-search');
  await page.getByTestId('viz-run').click();
  await stepUntil(
    page,
    async () => await page.getByRole('button', { name: 'Step forward' }).isDisabled(),
  );
  await expect(page.getByTestId('viz-output')).toHaveText('true');
  await expect(page.getByTestId('viz-checks')).toContainText('3 comparisons');
});

test('the lesson shows how the work grows', async ({ page }) => {
  await open(page, '/learn/loops.counter');
  await page.getByTestId('beat-next').click();
  await expect(page.getByTestId('complexity')).toContainText('O(n)');
});

test('has no serious accessibility problems: /visualize', async ({ page }) => {
  await open(page);
  await runAndWait(page);
  // Including the measured Big-O panel and its chart.
  await expect(page.getByTestId('big-o')).toBeVisible({ timeout: 30_000 });
  expect(await seriousProblems(page)).toEqual([]);
});
