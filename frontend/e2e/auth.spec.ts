import { expect, headerBankroll, logout, registerUser, test } from './fixtures';

test('a wrong password shows an error without reloading the page', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', 'nobody@test.local');
  await page.fill('#password', 'wrong-password');
  await page.click('button[type=submit]');

  await expect(page.getByText('Invalid credentials')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('sign-up opens the dashboard with 1000€, logout returns to login', async ({ page }) => {
  await registerUser(page);

  await expect(page).toHaveURL(/\/$/);
  expect(await headerBankroll(page)).toBe(1000);

  await logout(page);
  // Protected pages are no longer reachable
  await page.goto('/bets');
  await expect(page).toHaveURL(/\/login$/);
});
