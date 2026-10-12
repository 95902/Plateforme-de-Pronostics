import { expect, headerBankroll, registerUser, test } from './fixtures';

test('withdraw money, and see an error when funds are insufficient', async ({ page }) => {
  await registerUser(page);
  await page.locator('nav').getByRole('link', { name: 'Bankroll' }).click();

  await page.getByRole('button', { name: 'Withdraw' }).click();
  await page.getByPlaceholder('Amount (€)').fill('50');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => headerBankroll(page)).toBe(950);
  await expect(page.getByText('-50.00€')).toBeVisible();

  await page.getByRole('button', { name: 'Withdraw' }).click();
  await page.getByPlaceholder('Amount (€)').fill('99999');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Insufficient funds')).toBeVisible();
  expect(await headerBankroll(page)).toBe(950);
});
