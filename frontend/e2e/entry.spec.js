/** Exercise final discovery entry and reload without creating browser records. */
import { expect, test } from '@playwright/test';

const tagline = 'Your thoughts. Your space. Beautifully simple.';

/** Collect console errors and uncaught exceptions before navigation. */
function captureRuntimeErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => { errors.push(error.message); });
  return errors;
}

/** Snapshot both storage areas to detect unintended entry mutations. */
async function readBrowserData(page) {
  return page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
}

test('landing links and reload retain public discovery without changing browser data', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle('WriteSpace — A space for your words');
  await expect(page.getByRole('heading', { level: 1, name: tagline })).toBeVisible();
  const before = await readBrowserData(page);
  await expect(page.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
  await page.getByRole('link', { name: 'Start Reading' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('form', { name: 'Login' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to WriteSpace' }).click();
  await page.getByRole('link', { name: 'WriteSpace home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
  await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
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
  await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
  expect(await readBrowserData(page)).toEqual(before);
  expect(before).toEqual({ local: {}, session: {} });
  expect(errors).toEqual([]);
});
