import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export { expect };

let userCounter = 0;

/** Every test fails if the page throws an uncaught JavaScript error */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, provide) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await provide(errors);
      expect(errors, 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export const ADMIN = {
  email: 'admin@hippodrome.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? '',
};

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await expect(page.getByText('Welcome back')).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Register a fresh user through the sign-up form (starts with 1000€) */
export async function registerUser(page: Page) {
  userCounter++;
  const id = `${Date.now()}${userCounter}`;
  const user = { email: `e2e${id}@test.local`, username: `e2e${id}`, password: 'Password123!' };

  await page.goto('/login');
  await page.getByRole('button', { name: 'Create one' }).click();
  await page.fill('#email', user.email);
  await page.fill('#username', user.username);
  await page.fill('#password', user.password);
  await page.click('button[type=submit]');
  await expect(page.getByText('Welcome back')).toBeVisible();
  return user;
}

/** Bankroll shown in the navigation bar */
export async function headerBankroll(page: Page): Promise<number> {
  const text = await page.locator('nav').getByText(/\d+\.\d{2}€/).first().innerText();
  return parseFloat(text.replace('€', ''));
}

/** Open the first upcoming race from the race list and return its URL */
export async function openFirstUpcomingRace(page: Page): Promise<string> {
  await page.goto('/races');
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/races?') && response.url().includes('status=scheduled')),
    page.getByRole('button', { name: 'Upcoming' }).click(),
  ]);
  await page.locator('a[href^="/races/"]').first().click();
  await expect(page.getByText('Place a Bet')).toBeVisible();
  return page.url();
}
