import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Critical journeys from docs/11-quality-testing.md §2. */

const DAY = 86_400_000;

async function stepToEnd(page: Page) {
  const forward = page.getByRole('button', { name: 'Step forward' });
  while (await forward.isEnabled()) await forward.click();
}

async function check(page: Page) {
  await page.getByRole('button', { name: 'Check' }).click();
}

async function next(page: Page) {
  await page.getByRole('button', { name: 'Next' }).click();
}

test('a beginner completes the first lesson and the questions come back for review', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('start-learning').click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByTestId('concept-loops.counter')).toContainText('Ready');

  // Story
  await page.getByTestId('up-next').click();
  await expect(page.getByRole('heading', { name: 'The gate counter' })).toBeVisible();
  await page.getByTestId('beat-next').click();

  // See: can't continue until the program has been watched to the end.
  await expect(page.getByTestId('beat-title')).toHaveText('See it');
  await expect(page.getByTestId('beat-next')).toBeDisabled();
  await stepToEnd(page);
  await expect(page.getByTestId('viz-caption')).toHaveText('The program has finished.');
  await expect(page.getByTestId('viz-output')).toContainText('Total: 3');
  await page.getByTestId('beat-next').click();

  // Predict: the program pauses, the learner commits, then sees what really happens.
  await expect(page.getByTestId('beat-title')).toHaveText('Predict');
  await stepToEnd(page);
  await page.getByRole('radio', { name: /The loop stops/ }).check();
  await check(page);
  await expect(page.getByTestId('feedback')).toContainText('Good prediction!');
  await expect(page.getByTestId('beat-next')).toBeDisabled();
  await stepToEnd(page);
  await page.getByTestId('beat-next').click();

  // 1. Multiple choice: a wrong answer names the misconception; a hint helps; then "why".
  await expect(page.getByTestId('beat-title')).toContainText('Question 1 of 5');
  await page.getByRole('radio', { name: '5', exact: true }).check();
  await check(page);
  await expect(page.getByTestId('feedback')).toContainText('Counting one pass too many');
  await page.getByRole('button', { name: 'Get a hint' }).click();
  await expect(page.getByText('Hint 1 of 3')).toBeVisible();
  await page.getByRole('radio', { name: '4', exact: true }).check();
  await check(page);
  await expect(page.getByTestId('feedback')).toContainText('Correct!');
  await page.getByRole('button', { name: /i is 1, 2, 3, 4, and the indented line/ }).click();
  await expect(page.getByTestId('feedback')).toContainText('Exactly.');
  await next(page);

  // 2. Predict the output.
  await expect(page.getByTestId('beat-title')).toContainText('Question 2 of 5');
  await page.getByLabel('What does the screen show?').fill('5');
  await page.getByLabel('What does the screen show?').press('Enter');
  await page.getByRole('button', { name: /Each pass adds 1, not i/ }).click();
  await next(page);

  // 3. Trace table.
  await expect(page.getByTestId('beat-title')).toContainText('Question 3 of 5');
  const cells: [string, string][] = [
    ['Row 1, steps', '2'],
    ['Row 2, i', '2'],
    ['Row 2, steps', '4'],
    ['Row 3, i', '3'],
    ['Row 3, steps', '7'],
  ];
  for (const [label, value] of cells) await page.getByLabel(label, { exact: true }).fill(value);
  await check(page);
  await expect(page.getByTestId('feedback')).toContainText('4 of 5 right so far');
  await page.getByLabel('Row 3, steps', { exact: true }).fill('6');
  await check(page);
  await expect(page.getByTestId('feedback')).toContainText('Correct!');
  await next(page);

  // 4. Arrange the lines.
  await expect(page.getByTestId('beat-title')).toContainText('Question 4 of 5');
  for (const line of ['count = 0', 'for i from 1 to 3:', 'count = count + 1', 'say count']) {
    await page.getByRole('button', { name: `Add line: ${line}`, exact: true }).click();
  }
  await check(page);
  await expect(page.getByTestId('feedback')).toContainText('Correct!');
  await next(page);

  // 5. Fill the blank.
  await expect(page.getByTestId('beat-title')).toContainText('Question 5 of 5');
  await page.getByLabel('Blank 1').fill('5');
  await check(page);
  await expect(page.getByTestId('feedback')).toContainText('Correct!');
  await next(page);

  // Recap
  await expect(page.getByRole('heading', { name: 'What you learned' })).toBeVisible();
  await expect(page.getByTestId('recap-knowledge')).toHaveText(/^\d+%$/);
  await page.getByRole('link', { name: 'Back to your path' }).click();
  await expect(page.getByTestId('concept-loops.counter')).toContainText('In progress');
  await expect(page.getByTestId('reviews-due')).toHaveText('No reviews due');

  // A month later every card is due, and reviews show a variation, not the same question.
  await page.clock.setFixedTime(new Date(Date.now() + 30 * DAY));
  await page.reload();
  await expect(page.getByTestId('reviews-due')).toHaveText('5 reviews due');
  await page.getByRole('link', { name: 'Start review' }).click();
  await expect(page.getByText('1 of 5').first()).toBeVisible();
  await expect(page.getByTestId('item-card')).toHaveAttribute(
    'data-item',
    'loops.counter.how-many.v2',
  );
  await page.getByRole('radio', { name: '6', exact: true }).check();
  await check(page);
  await expect(page.getByTestId('feedback')).toContainText('Correct!');
  await next(page);
  await expect(page.getByText('2 of 5').first()).toBeVisible();
});

test('the lesson resumes where the learner left off', async ({ page }) => {
  await page.goto('/learn/loops.counter');
  await page.getByTestId('beat-next').click();
  await expect(page.getByTestId('beat-title')).toHaveText('See it');
  await page.reload();
  await expect(page.getByTestId('beat-title')).toHaveText('See it');
});

test('a learner can switch to Hinglish and it sticks', async ({ page }) => {
  await page.goto('/learn');
  await page.getByLabel('Language').selectOption('hi-Latn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tumhara learning path');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi-Latn');
  await page.goto('/learn/loops.counter');
  await expect(page.getByRole('heading', { name: 'Gate wala counter' })).toBeVisible();
});

test('a lesson can be completed with the keyboard alone', async ({ page }) => {
  await page.goto('/learn/loops.counter');
  await page.getByTestId('beat-next').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('visualizer').focus();
  for (let i = 0; i < 13; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('viz-caption')).toHaveText('The program has finished.');
  // Next unlocks once the visualizer reports its last frame; a disabled button can't take focus.
  await expect(page.getByTestId('beat-next')).toBeEnabled();
  await page.getByTestId('beat-next').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('beat-title')).toHaveText('Predict');
});

for (const path of ['/', '/learn', '/learn/loops.counter', '/review']) {
  test(`has no serious accessibility problems: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      serious.map(
        (v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([]);
  });
}
