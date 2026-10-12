import { ADMIN, expect, headerBankroll, login, logout, openFirstUpcomingRace, registerUser, test } from './fixtures';

test('place a couplé, cancel it from My Bets and get refunded', async ({ page }) => {
  await registerUser(page);
  await openFirstUpcomingRace(page);

  await page.selectOption('#bet-type', 'couple');
  const checkboxes = page.locator('tbody input[type=checkbox]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  // Only two horses can be selected for a couplé
  await expect(checkboxes.nth(2)).toBeDisabled();

  await page.fill('#stake', '10');
  await page.getByRole('button', { name: 'Place bet' }).click();
  await expect(page.getByText('Bet placed!')).toBeVisible();
  await expect.poll(() => headerBankroll(page)).toBe(990);

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('nav').getByRole('link', { name: 'My Bets' }).click();
  await page.locator('tbody').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('tbody').getByText('cancelled')).toBeVisible();
  await expect.poll(() => headerBankroll(page)).toBe(1000);

  // The refund has its own transaction type
  await page.locator('nav').getByRole('link', { name: 'Bankroll' }).click();
  await expect(page.locator('tbody').getByText('BET_REFUND')).toBeVisible();
});

test('the admin records the result and the winning bet is paid', async ({ page }) => {
  test.skip(!ADMIN.password, 'E2E_ADMIN_PASSWORD is not set');

  const user = await registerUser(page);
  const raceUrl = await openFirstUpcomingRace(page);

  // Bet on the top prediction; the admin then records the predicted order
  await page.locator('tbody input[type=checkbox]').first().check();
  await page.fill('#stake', '20');
  await page.getByRole('button', { name: 'Place bet' }).click();
  const confirmation = await page.getByText('Bet placed!').innerText();
  const payout = parseFloat(confirmation.match(/([\d.]+)€/)![1]);
  await logout(page);

  await login(page, ADMIN.email, ADMIN.password);
  await page.goto(raceUrl);
  await page.getByRole('button', { name: 'Fill from predictions' }).click();
  await page.getByRole('button', { name: 'Record result & settle bets' }).click();
  await expect(page.getByText(/Result recorded\. Bets settled: [1-9]\d* won/)).toBeVisible();
  await expect(page.getByText('Official Result')).toBeVisible();
  await expect(page.getByText('Place a Bet')).toBeHidden();
  await logout(page);

  await login(page, user.email, user.password);
  await page.locator('nav').getByRole('link', { name: 'My Bets' }).click();
  await expect(page.locator('tbody').getByText('won')).toBeVisible();
  expect(await headerBankroll(page)).toBeCloseTo(980 + payout, 2);
});
