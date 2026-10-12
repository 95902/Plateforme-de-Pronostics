import { expect, registerUser, test } from './fixtures';

test('create, deactivate and delete a strategy', async ({ page }) => {
  await registerUser(page);
  await page.locator('nav').getByRole('link', { name: 'Strategies' }).click();

  await page.getByRole('button', { name: 'New strategy' }).click();
  await page.fill('#strategy-name', 'E2E Kelly');
  await page.selectOption('#strategy-type', 'KELLY_CRITERION');
  // Default parameters follow the type
  await expect(page.locator('#strategy-parameters')).toHaveValue(/fraction/);

  await page.fill('#strategy-parameters', '{not json');
  await page.getByRole('button', { name: 'Create strategy' }).click();
  await expect(page.getByText('Parameters must be valid JSON')).toBeVisible();

  await page.fill('#strategy-parameters', '{"fraction": 0.25}');
  await page.getByRole('button', { name: 'Create strategy' }).click();
  const card = page.locator('div.bg-white.rounded-lg.shadow', { has: page.locator('h3', { hasText: 'E2E Kelly' }) });
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'Deactivate' }).click();
  await expect(card.getByText('Inactive')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(card).toBeHidden();
});

test('backtest a strategy and read the results', async ({ page }) => {
  await registerUser(page);
  await page.locator('nav').getByRole('link', { name: 'Strategies' }).click();

  await page.getByRole('button', { name: 'New strategy' }).click();
  await page.fill('#strategy-name', 'E2E Favorite');
  await page.selectOption('#strategy-type', 'FAVORITE');
  await page.fill('#strategy-parameters', '{"baseStake": 10, "maxOdds": 10}');
  await page.getByRole('button', { name: 'Create strategy' }).click();
  const card = page.locator('div.bg-white.rounded-lg.shadow', { has: page.locator('h3', { hasText: 'E2E Favorite' }) });

  await card.getByRole('button', { name: 'Backtest' }).click();
  await card.locator('input[type=date]').first().fill('2020-01-01');
  await card.getByRole('button', { name: 'Run backtest' }).click();

  await expect(card.getByText('Final bankroll')).toBeVisible();
  await expect(card.getByText('Max drawdown')).toBeVisible();
  await expect(card.locator('.recharts-line path').first()).toBeVisible();
  await expect(card.locator('tbody tr').first()).toBeVisible();

  // Hovering the chart shows the bankroll at that date
  const chart = card.locator('svg.recharts-surface').first();
  await chart.scrollIntoViewIfNeeded();
  await chart.hover();
  await expect(card.locator('.recharts-tooltip-wrapper').getByText(/Bankroll/)).toBeVisible();
});
