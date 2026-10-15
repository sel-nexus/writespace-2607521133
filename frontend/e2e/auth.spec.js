/** Exercise browser-local account entry, persistence and guards against the real SPA. */
import { expect, test } from '@playwright/test';

const writer = { userId: 'fixture-writer', username: 'fixture-writer', displayName: 'Fixture Writer', role: 'user' };
const tagline = 'Your thoughts. Your space. Beautifully simple.';

/** Capture runtime failures before the first navigation in every test. */
function captureRuntimeErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => { errors.push(error.message); });
  return errors;
}

/** Read the real account/session data and complete key inventory. */
async function readAccounts(page) {
  return page.evaluate(() => ({
    users: JSON.parse(localStorage.getItem('writespace_users') || '[]'),
    session: JSON.parse(localStorage.getItem('writespace_session') || 'null'),
    keys: Object.keys(localStorage).sort(),
    posts: localStorage.getItem('writespace_posts'),
    temporary: { ...sessionStorage },
  }));
}

/** Activate actual logout controls, including the existing responsive menu. */
async function logout(page) {
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
}

/** Assert a usable responsive form with linked labels and no horizontal overflow. */
async function expectForm(page, name, labels) {
  const form = page.getByRole('form', { name, exact: true });
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute('novalidate', '');
  for (const label of labels) {
    const input = form.getByLabel(new RegExp(`^${label}`));
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('aria-required', 'true');
    await expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(await input.getAttribute('id')).toBeTruthy();
    const box = await input.boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText(/Local-only demo/)).toContainText('Passwords are stored in plaintext');
  await expect(page.getByText(/Local-only demo/)).toContainText('Do not use real or reused passwords');
  await expect(page.getByText('Illustrative sample', { exact: true })).toHaveCount(3);
  await expect(page.getByText('Admin · Sample author', { exact: true })).toHaveCount(3);
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`real registration, reload, logout, invalid login and persisted-account login at ${viewport.width}px`, async ({ page }) => {
    const errors = captureRuntimeErrors(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expectForm(page, 'Register', ['Display name', 'Username', 'Password', 'Confirm password']);
    await page.getByLabel(/^Display name/).fill('Journey Writer');
    await page.getByLabel(/^Username/).fill('journey-writer');
    await page.getByLabel(/^Password/).fill('journey-demo-only');
    await page.getByLabel(/^Confirm password/).fill('journey-demo-only');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    const created = await readAccounts(page);
    expect(created.users).toHaveLength(1);
    expect(created.users[0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/), displayName: 'Journey Writer', username: 'journey-writer',
      password: 'journey-demo-only', role: 'user', createdAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(created.users[0].createdAt))).toBe(false);
    expect(created.session).toEqual({
      userId: created.users[0].id, displayName: 'Journey Writer', username: 'journey-writer', role: 'user',
    });
    expect(created.keys).toEqual(['writespace_session', 'writespace_users']);
    expect(created.posts).toBeNull();
    expect(created.temporary).toEqual({});
    await page.reload();
    await expect(page).toHaveURL(/\/blogs$/);
    expect(await readAccounts(page)).toEqual(created);
    await logout(page);
    const signedOut = await readAccounts(page);
    expect(signedOut.users).toEqual(created.users);
    expect(signedOut.session).toBeNull();
    expect(signedOut.keys).toEqual(['writespace_users']);
    await page.reload();
    await expect(page.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
    await page.getByRole('link', { name: 'Start Reading' }).click();
    await expectForm(page, 'Login', ['Username', 'Password']);
    await expect(page.getByText(/Demo Admin:/)).toHaveText('Demo Admin: username admin / password admin.');
    await page.getByLabel(/^Username/).fill('journey-writer');
    await page.getByLabel(/^Password/).fill('wrong-demo');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel(/^Username/)).toHaveValue('journey-writer');
    await expect(page.getByLabel(/^Password/)).toHaveValue('wrong-demo');
    expect(await readAccounts(page)).toEqual(signedOut);
    await page.getByLabel(/^Password/).fill('journey-demo-only');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    expect(await readAccounts(page)).toEqual(created);
    await page.reload();
    await expect(page).toHaveURL(/\/blogs$/);
    expect(await readAccounts(page)).toEqual(created);
    await logout(page);
    expect(await readAccounts(page)).toEqual(signedOut);
    expect(errors).toEqual([]);
  });
}

test('registration required, mismatch, reserved and duplicate feedback preserve fields and account persistence', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Register', exact: true }).click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText([
    'Display name is required.', 'Username is required.', 'Password is required.', 'Password confirmation is required.',
  ]);
  for (const [label, id] of [
    [/^Display name/, 'register-displayName'], [/^Username/, 'register-username'],
    [/^Password/, 'register-password'], [/^Confirm password/, 'register-confirmPassword'],
  ]) {
    await expect(page.getByLabel(label)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel(label)).toHaveAttribute('aria-describedby', `${id}-error`);
  }
  expect((await readAccounts(page)).keys).toEqual([]);
  await page.getByLabel(/^Display name/).fill('Validation Writer');
  await page.getByLabel(/^Username/).fill('admin');
  await page.getByLabel(/^Password/).fill('validation-demo');
  await page.getByLabel(/^Confirm password/).fill('mismatch-demo');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('Passwords must match.');
  await expect(page.getByLabel(/^Confirm password/)).toHaveValue('mismatch-demo');
  await page.getByLabel(/^Confirm password/).fill('validation-demo');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('Username is already taken.');
  await expect(page.getByLabel(/^Username/)).toHaveValue('admin');
  expect((await readAccounts(page)).keys).toEqual([]);
  await page.getByLabel(/^Username/).fill('validation-writer');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  const saved = (await readAccounts(page)).users;
  await logout(page);
  await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
  await page.getByLabel(/^Display name/).fill('Another Writer');
  await page.getByLabel(/^Username/).fill('validation-writer');
  await page.getByLabel(/^Password/).fill('other-demo');
  await page.getByLabel(/^Confirm password/).fill('other-demo');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('Username is already taken.');
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel(/^Display name/)).toHaveValue('Another Writer');
  await expect(page.getByLabel(/^Password/)).toHaveValue('other-demo');
  expect((await readAccounts(page)).users).toEqual(saved);
  expect((await readAccounts(page)).session).toBeNull();
  await page.reload();
  expect((await readAccounts(page)).users).toEqual(saved);
  expect(errors).toEqual([]);
});

test('built-in Admin logs in with explicit demo credentials, persists on reload and logs out without creating accounts', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Start Reading' }).click();
  await page.getByLabel(/^Username/).fill('admin');
  await page.getByLabel(/^Password/).fill('admin');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Admin Dashboard' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'User Management' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
  await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'Dashboard' }).click();
  const saved = await readAccounts(page);
  expect(saved.session).toEqual({ userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' });
  expect(saved.users).toEqual([]);
  expect(saved.keys).toEqual(['writespace_session']);
  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
  expect(await readAccounts(page)).toEqual(saved);
  await logout(page);
  expect((await readAccounts(page)).keys).toEqual([]);
  expect(errors).toEqual([]);
});

for (const path of ['/blogs', '/blog/example', '/write', '/edit/example', '/admin', '/users']) {
  test(`guest deep-link guard ${path} reaches the real login form without writes`, async ({ page }) => {
    const errors = captureRuntimeErrors(page);
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('form', { name: 'Login', exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    expect((await readAccounts(page)).keys).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const path of ['/admin', '/users', '/login', '/register']) {
  test(`existing regular user is redirected from ${path} to blogs without changing session`, async ({ page, context }) => {
    const errors = captureRuntimeErrors(page);
    await context.addInitScript((session) => {
      localStorage.setItem('writespace_session', JSON.stringify(session));
    }, writer);
    await page.goto(path);
    await expect(page).toHaveURL(/\/blogs$/);
    expect((await readAccounts(page)).session).toEqual(writer);
    expect((await readAccounts(page)).users).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const path of ['/login', '/register']) {
  test(`existing Admin is redirected from ${path} to Admin home`, async ({ page, context }) => {
    const errors = captureRuntimeErrors(page);
    const session = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
    await context.addInitScript((identity) => {
      localStorage.setItem('writespace_session', JSON.stringify(identity));
    }, session);
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Admin Dashboard' })).toBeVisible();
    expect((await readAccounts(page)).session).toEqual(session);
    expect((await readAccounts(page)).keys).toEqual(['writespace_session']);
    expect(errors).toEqual([]);
  });
}
