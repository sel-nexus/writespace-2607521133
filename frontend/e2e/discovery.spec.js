/** Exercise read-only discovery and role navigation against the live application. */
import { expect, test } from '@playwright/test';

const tagline = 'Your thoughts. Your space. Beautifully simple.';
const writer = { userId: 'writer', username: 'writer', displayName: 'Local Writer', role: 'user' };

/** Capture errors before navigation; each journey must finish with zero failures. */
function captureRuntimeErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => { errors.push(error.message); });
  return errors;
}

/** Snapshot actual browser data, not a mocked helper response. */
async function readBrowserData(page) {
  return page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
}

/** Attach text-based visual preflight and screenshots for representative states. */
async function attachPreflight(page, testInfo, name) {
  await testInfo.attach(`${name}-accessibility`, {
    body: JSON.stringify(await page.accessibility.snapshot(), null, 2),
    contentType: 'application/json',
  });
  const layout = await page.evaluate(() => {
    const heading = document.querySelector('h1');
    const body = document.body;
    const root = document.getElementById('root').firstElementChild;
    return {
      headingFont: getComputedStyle(heading).fontFamily,
      headingSize: getComputedStyle(heading).fontSize,
      bodyFont: getComputedStyle(root).fontFamily,
      bodyDisplay: getComputedStyle(body).display,
      bodyWidth: body.getBoundingClientRect().width,
      rootDisplay: getComputedStyle(root).display,
      rootWidth: root.getBoundingClientRect().width,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      mainWidth: document.querySelector('main').getBoundingClientRect().width,
    };
  });
  await testInfo.attach(`${name}-fonts-layout`, {
    body: JSON.stringify(layout, null, 2), contentType: 'application/json',
  });
  await testInfo.attach(`${name}-html`, { body: await page.content(), contentType: 'text/html' });
  await testInfo.attach(`${name}-screenshot`, {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });
  expect(layout.headingFont).toContain('Georgia');
  expect(layout.bodyFont).toContain('Arial');
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.rootDisplay).toBe('flex');
}

/** Make unsorted fixtures whose long content proves the preview boundary. */
function fixturePosts() {
  return [1, 4, 2, 3].map((day) => ({
    id: `post-${day}`,
    title: `Saved thought ${day}`,
    content: day === 4 ? `${'p'.repeat(120)}HIDDEN TAIL` : `Actual local post ${day}.`,
    createdAt: `2025-05-0${day}T12:00:00.000Z`,
    authorId: 'writer', authorName: 'Local Writer',
  }));
}

test('desktop discovery reloads the newest actual previews without persisting samples', async ({ page }, testInfo) => {
  const errors = captureRuntimeErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: tagline })).toBeVisible();
  const records = fixturePosts();
  await page.evaluate((posts) => {
    localStorage.setItem('writespace_posts', JSON.stringify(posts));
  }, records);
  const before = await readBrowserData(page);
  await page.reload();
  const latest = page.getByRole('region', { name: 'Latest Posts' });
  await expect(latest.getByRole('heading', { level: 3 })).toHaveText([
    'Saved thought 4', 'Saved thought 3', 'Saved thought 2',
  ]);
  await expect(latest.getByText('May 04 2025')).toBeVisible();
  await expect(latest.getByText('p'.repeat(120), { exact: true })).toBeVisible();
  await expect(latest.getByText(/HIDDEN TAIL/)).toHaveCount(0);
  await expect(page.getByText('Illustrative sample', { exact: true })).toHaveCount(3);
  await expect(latest.getByText('Post Title')).toHaveCount(0);
  await attachPreflight(page, testInfo, 'desktop-populated');
  await latest.getByRole('link', { name: 'Saved thought 4' }).click();
  await expect(page).toHaveURL(/\/login$/);
  // Account entry is implemented; this discovery journey remains read-only.
  await expect(page.getByRole('form', { name: 'Login' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to WriteSpace' }).click();
  await page.reload();
  await expect(latest.getByRole('heading', { level: 3 })).toHaveText([
    'Saved thought 4', 'Saved thought 3', 'Saved thought 2',
  ]);
  expect(await readBrowserData(page)).toEqual(before);
  expect(errors).toEqual([]);
});

for (const [label, expectedPath] of [['Start Reading', '/login'], ['Get Started Free', '/register']]) {
  test(`guest CTA ${label} reaches its implemented auth form without changing storage`, async ({ page }) => {
    const errors = captureRuntimeErrors(page);
    await page.goto('/');
    const before = await readBrowserData(page);
    await page.getByRole('link', { name: label, exact: true }).click();
    expect(new URL(page.url()).pathname).toBe(expectedPath);
    await expect(page.getByRole('form', { name: expectedPath === '/login' ? 'Login' : 'Register', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Return to WriteSpace' }).click();
    await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
    expect(await readBrowserData(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
}

for (const [label, href, finalPath] of [
  ['Home', '/', '/'], ['All Blogs', '/blogs', '/login'], ['Login', '/login', '/login'], ['Register', '/register', '/register'],
]) {
  test(`footer ${label} remains a real public navigation link`, async ({ page }) => {
    const errors = captureRuntimeErrors(page);
    await page.goto('/');
    const before = await readBrowserData(page);
    const link = page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: label, exact: true });
    await expect(link).toHaveAttribute('href', href);
    await link.click();
    expect(new URL(page.url()).pathname).toBe(finalPath);
    if (label === 'Home') await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
    else await expect(page.getByRole('form', { name: finalPath === '/login' ? 'Login' : 'Register', exact: true })).toBeVisible();
    expect(await readBrowserData(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
}

test('mobile discovery and account navigation retain hierarchy, close on links and log out on click', async ({ page }, testInfo) => {
  const errors = captureRuntimeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
  await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
  await attachPreflight(page, testInfo, 'mobile-empty');
  await page.evaluate((session) => {
    localStorage.setItem('writespace_session', JSON.stringify(session));
  }, writer);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/blogs');
  await page.getByRole('link', { name: 'Start Reading' }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Logout' })).toBeHidden();
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: 'All Blogs', exact: true })).toHaveAttribute('aria-current', 'page');
  await attachPreflight(page, testInfo, 'mobile-account-menu-open');
  await page.getByRole('link', { name: 'Write', exact: true }).click();
  await expect(page).toHaveURL(/\/write$/);
  await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Logout' })).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
  expect(await readBrowserData(page)).toEqual({ local: {}, session: {} });
  expect(errors).toEqual([]);
});

test('Admin public destination and account menu obey the role without fake dashboard content', async ({ page }, testInfo) => {
  const errors = captureRuntimeErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.evaluate((session) => {
    localStorage.setItem('writespace_session', JSON.stringify(session));
  }, { ...writer, userId: 'admin', role: 'admin', displayName: 'Admin' });
  await page.reload();
  const before = await readBrowserData(page);
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'This page wandered off.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Users', exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveAttribute('aria-current', 'page');
  await attachPreflight(page, testInfo, 'desktop-admin-navigation');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
  expect(await readBrowserData(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('corrupt discovery storage shows safe warnings, remains usable and never repairs records', async ({ page }, testInfo) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('writespace_posts', '{broken');
    localStorage.setItem('writespace_session', '{broken');
  });
  const before = await readBrowserData(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(2);
  await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
  await attachPreflight(page, testInfo, 'desktop-corrupt-storage');
  await page.getByRole('link', { name: 'Start Reading' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link', { name: 'Return to WriteSpace' }).click();
  await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
  expect(await readBrowserData(page)).toEqual(before);
  expect(errors).toEqual([]);
});
