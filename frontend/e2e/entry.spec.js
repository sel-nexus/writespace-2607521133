/** Exercise entry navigation and reload through the live browser without seeding data. */
import { expect, test } from '@playwright/test';

/**
 * Collect browser console errors and uncaught exceptions before initial navigation.
 * @param {import('@playwright/test').Page} page - Browser page under test.
 * @returns {string[]} Mutable error collection asserted at journey completion.
 */
function captureRuntimeErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

/**
 * Snapshot both storage areas to detect unintended public-entry mutations.
 * @param {import('@playwright/test').Page} page - Loaded same-origin page.
 * @returns {Promise<object>} Serializable local and session storage contents.
 */
async function readBrowserData(page) {
  return page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
}

test('welcome links and reload retain the public entry without changing browser data', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle('WriteSpace — A space for your words');
  await expect(page.getByRole('heading', { level: 1, name: 'A little space for big ideas.' })).toBeVisible();
  const before = await readBrowserData(page);

  await page.getByRole('link', { name: 'Meet WriteSpace' }).click();
  await expect(page).toHaveURL(/\/#about$/);
  await expect(page.getByRole('heading', { name: 'Words begin here.' })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/#about$/);
  await expect(page.getByRole('heading', { name: 'A little space for big ideas.' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to welcome' }).click();
  await expect(page).toHaveURL(/\/#main-content$/);
  await page.getByRole('link', { name: 'WriteSpace home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A little space for big ideas.' })).toBeVisible();

  expect(await readBrowserData(page)).toEqual(before);
  expect(before).toEqual({ local: {}, session: {} });
  expect(errors).toEqual([]);
});

test('unknown deep link survives reload and recovers through the home link', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/a-page-that-does-not-exist');
  await expect(page.getByRole('heading', { name: 'This page wandered off.' })).toBeVisible();
  const before = await readBrowserData(page);

  await page.reload();
  await expect(page).toHaveURL(/\/a-page-that-does-not-exist$/);
  await expect(page.getByRole('heading', { name: 'This page wandered off.' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to WriteSpace' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'A little space for big ideas.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A little space for big ideas.' })).toBeVisible();

  expect(await readBrowserData(page)).toEqual(before);
  expect(before).toEqual({ local: {}, session: {} });
  expect(errors).toEqual([]);
});
