import { expect, registerUser, test } from './fixtures';

test('evaluate the model against the odds', async ({ page }) => {
  await registerUser(page);
  await page.locator('nav').getByRole('link', { name: 'Model' }).click();
  await expect(page.getByRole('heading', { name: 'Model Evaluation' })).toBeVisible();

  // The seed has finished races over the last weeks
  await page.fill('#eval-from', '2020-01-01');
  await page.getByRole('button', { name: 'Evaluate' }).click();

  await expect(page.getByText(/\d+ races, \d+ runners/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Market (odds)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Calibration' })).toBeVisible();
  await expect(page.getByText('1€ on each favorite')).toBeVisible();

  // A period without races
  await page.fill('#eval-from', '2001-01-01');
  await page.fill('#eval-to', '2001-12-31');
  await page.getByRole('button', { name: 'Evaluate' }).click();
  await expect(page.getByText('No finished race with odds and a winner in this period.')).toBeVisible();
});
