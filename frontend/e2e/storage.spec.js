/** Exercise real browser corruption and non-destructive public-shell reload recovery. */
import { expect, test } from '@playwright/test';

/**
 * Capture runtime failures before the first navigation.
 * @param {import('@playwright/test').Page} page - Browser page under test.
 * @returns {string[]} Errors to assert at the end of the journey.
 */
function captureRuntimeErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => { errors.push(error.message); });
  return errors;
}

/**
 * Read actual browser storage without invoking application helper code.
 * @param {import('@playwright/test').Page} page - Loaded same-origin page.
 * @returns {Promise<object>} Complete local and session storage snapshots.
 */
async function readBrowserData(page) {
  return page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
}

const corruptions = [
  { name: 'malformed JSON', values: { writespace_posts: '{broken', writespace_users: '[broken', writespace_session: '{broken' } },
  { name: 'wrong top-level shapes', values: { writespace_posts: '{}', writespace_users: 'null', writespace_session: '[]' } },
  { name: 'incomplete records and unknown session role', values: {
    writespace_posts: '[{"id":"preserve-this-id","title":"Incomplete"}]',
    writespace_users: '[{"id":"preserve-this-user","username":"demo"}]',
    writespace_session: '{"userId":"preserve-this-user","username":"demo","displayName":"Demo","role":"owner"}',
  } },
];

for (const corruption of corruptions) {
  test(`public entry stays usable after ${corruption.name} and reload without repairing data`, async ({ page }) => {
    const errors = captureRuntimeErrors(page);
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    // Corrupt actual storage after public entry; reload drives the application's reads.
    await page.evaluate((values) => {
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    }, corruption.values);
    const corrupted = await readBrowserData(page);
    expect(corrupted).toEqual({ local: corruption.values, session: {} });

    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page).toHaveTitle('WriteSpace — A space for your words');
    expect(await readBrowserData(page)).toEqual(corrupted);

    // Use a real public home control rather than a second direct navigation.
    const home = page.getByRole('link', { name: /writespace|home/i }).first();
    await expect(home).toBeVisible();
    await home.click();
    await expect(page).toHaveURL(/\/(?:#.*)?$/);
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    expect(await readBrowserData(page)).toEqual(corrupted);
    expect(errors).toEqual([]);
  });
}
