/** Exercise real Admin account entry, creation, cross-feature oversight and responsive protection against the live SPA. */
import { expect, test } from '@playwright/test';

const policy = 'Account deletion is disabled pending an approved post-impact policy.';
const tagline = 'Your thoughts. Your space. Beautifully simple.';

/** Install runtime capture before navigation so no browser failure can escape the final assertion. */
function captureRuntimeErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => { errors.push(error.message); });
  return errors;
}

/** Read actual browser data and keys without mocking any application helper. */
async function readStorage(page) {
  return page.evaluate(() => ({
    users: JSON.parse(localStorage.getItem('writespace_users') || '[]'),
    posts: JSON.parse(localStorage.getItem('writespace_posts') || '[]'),
    session: JSON.parse(localStorage.getItem('writespace_session') || 'null'),
    keys: Object.keys(localStorage).sort(), temporary: { ...sessionStorage },
  }));
}

/** Click responsive navigation controls only when the menu is collapsed and visible. */
async function openNavigation(page) {
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  if (await toggle.isVisible()) await toggle.click();
}

/** Reach a destination through the actual account navigation, never a second goto. */
async function accountLink(page, name) {
  await openNavigation(page);
  await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name, exact: true }).click();
}

/** Use the visible login form from public discovery for both built-in and created identities. */
async function signIn(page, username, password, role) {
  await page.getByRole('link', { name: 'Start Reading', exact: true }).click();
  await page.getByLabel(/^Username/).fill(username);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(role === 'admin' ? /\/admin$/ : /\/blogs$/);
  await expect(page.getByRole('heading', { level: 1, name: role === 'admin' ? 'Admin Dashboard' : 'All Blogs' })).toBeVisible();
}

/** Sign out durably through the actual menu and return to guest discovery. */
async function logout(page) {
  await openNavigation(page);
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: tagline })).toBeVisible();
  expect((await readStorage(page)).session).toBeNull();
}

/** Create one account with the real Admin form and verify success without identity switching. */
async function createAccount(page, displayName, username, role) {
  const before = await readStorage(page);
  await page.getByLabel(/^Display name/).fill(displayName);
  await page.getByLabel(/^Username/).fill(username);
  await page.getByLabel(/^Password/).fill('admin-journey-demo');
  await page.getByLabel('Role', { exact: true }).selectOption(role);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Account created. Your Admin session has not changed.');
  const after = await readStorage(page);
  const created = after.users.find((user) => user.username === username);
  expect(created).toEqual({
    id: expect.stringMatching(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/),
    displayName, username, password: 'admin-journey-demo', role, createdAt: expect.any(String),
  });
  expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
  expect(after.users).toEqual([...before.users, created]);
  expect(after.session).toEqual(before.session);
  expect(after.posts).toEqual(before.posts);
  await expect(page.getByLabel(/^Password/)).toHaveValue('');
  await expect(page.getByRole('table')).not.toContainText('admin-journey-demo');
  return created;
}

/** Assert protected affordances and expose the tooltip through its keyboard-focusable wrapper. */
async function expectProtection(page, username, reason) {
  const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // UserRow keeps the hidden desktop/mobile Username label inside the second td.
  const usernameCell = page.locator('td:nth-child(2)').filter({
    hasText: new RegExp(`^\\s*Username\\s*${escapedUsername}\\s*$`),
  });
  const table = page.getByRole('region', { name: 'Accounts', exact: true }).getByRole('table');
  const row = table.locator('tbody tr').filter({ has: usernameCell });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(1)).toHaveText(new RegExp(`^\\s*Username\\s*${escapedUsername}\\s*$`));
  const button = row.getByRole('button', { name: 'Delete', exact: true });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('title', reason);
  const wrapper = row.getByLabel(`Deletion protection for ${username}`, { exact: true });
  await wrapper.focus();
  await expect(row.getByRole('tooltip')).toHaveText(reason);
  await expect(row.getByRole('tooltip')).toBeVisible();
}

/** Attach accessibility, HTML, fonts, layout and screenshots for parent source/preflight review. */
async function attachPreflight(page, testInfo, name) {
  await testInfo.attach(`${name}-accessibility`, {
    body: JSON.stringify(await page.accessibility.snapshot(), null, 2), contentType: 'application/json',
  });
  const layout = await page.evaluate(() => {
    const main = document.querySelector('main');
    const table = main.querySelector('table');
    const row = table?.querySelector('tbody tr');
    return {
      headingFont: getComputedStyle(main.querySelector('h1')).fontFamily,
      bodyFont: getComputedStyle(document.getElementById('root').firstElementChild).fontFamily,
      viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      tableDisplay: table ? getComputedStyle(table).display : null,
      rowDisplay: row ? getComputedStyle(row).display : null,
      headerDisplay: table ? getComputedStyle(table.querySelector('thead')).display : null,
    };
  });
  await testInfo.attach(`${name}-fonts-layout`, { body: JSON.stringify(layout, null, 2), contentType: 'application/json' });
  await testInfo.attach(`${name}-html`, { body: await page.content(), contentType: 'text/html' });
  await testInfo.attach(`${name}-screenshot`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  expect(layout.headingFont).toContain('Georgia');
  expect(layout.bodyFont).toContain('Arial');
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  if (layout.tableDisplay) {
    expect(layout.tableDisplay).toBe(layout.viewportWidth < 768 ? 'block' : 'table');
    expect(layout.rowDisplay).toBe(layout.viewportWidth < 768 ? 'block' : 'table-row');
    expect(layout.headerDisplay).toBe(layout.viewportWidth < 768 ? 'none' : 'table-header-group');
  }
}

for (const width of [1440, 390]) {
  test(`Admin creates accounts → writer publishes → new Admin oversees recent posts at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const errors = captureRuntimeErrors(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await signIn(page, 'admin', 'admin', 'admin');
    await expect(page.getByRole('term')).toHaveText(['Total Posts', 'Total Users', 'Total Admins', 'Total users']);
    await expect(page.getByRole('definition')).toHaveText(['0', '1', '1', '1']);
    await expect(page.getByText(/No posts yet/)).toBeVisible();
    await attachPreflight(page, testInfo, `${width}-dashboard-empty`);
    await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link', { name: 'Users' }).click();
    await expect(page.getByRole('heading', { name: 'User Management', level: 1 })).toBeVisible();
    await expect(page.getByText(/Local-only demo/)).toContainText('Do not use real or reused passwords');
    await expect(page.getByText(/No stored accounts yet/)).toBeVisible();
    await attachPreflight(page, testInfo, `${width}-users-empty`);
    const writer = await createAccount(page, 'Journey Writer', 'journey-writer', 'user');
    const owner = await createAccount(page, 'Journey Owner', 'journey-owner', 'admin');
    const saved = await readStorage(page);
    expect(saved.keys).toEqual(['writespace_session', 'writespace_users']);
    expect(saved.temporary).toEqual({});
    await page.reload();
    expect(await readStorage(page)).toEqual(saved);
    await expectProtection(page, 'admin', 'Default admin cannot be deleted.');
    await expectProtection(page, writer.username, policy);
    await expectProtection(page, owner.username, policy);
    expect(await readStorage(page)).toEqual(saved);
    await attachPreflight(page, testInfo, `${width}-users-populated-policy`);
    await accountLink(page, 'Dashboard');
    await expect(page.getByRole('definition')).toHaveText(['0', '3', '2', '3']);
    await logout(page);
    await signIn(page, writer.username, 'admin-journey-demo', 'user');
    expect((await readStorage(page)).session.userId).toBe(writer.id);
    await expect(page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'Users' })).toHaveCount(0);
    for (let index = 1; index <= 6; index += 1) {
      await accountLink(page, 'Write');
      await page.getByLabel(/^Title/).fill(`Writer story ${index}`);
      await page.getByLabel(/^Content/).fill(`Real story body ${index}\nWritten by the created account.`);
      await page.getByRole('button', { name: 'Publish post', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Writer story ${index}`);
    }
    const authored = await readStorage(page);
    expect(authored.posts).toHaveLength(6);
    expect(authored.posts.every((post) => post.authorId === writer.id && post.authorName === writer.displayName)).toBe(true);
    await logout(page);
    await signIn(page, owner.username, 'admin-journey-demo', 'admin');
    expect((await readStorage(page)).session.userId).toBe(owner.id);
    await expect(page.getByRole('definition')).toHaveText(['6', '3', '2', '3']);
    const recent = page.getByRole('region', { name: 'Recent Posts' });
    await expect(recent.getByRole('article').getByRole('heading')).toHaveText([
      'Writer story 6', 'Writer story 5', 'Writer story 4', 'Writer story 3', 'Writer story 2',
    ]);
    await attachPreflight(page, testInfo, `${width}-dashboard-populated`);
    await recent.getByRole('article').first().getByRole('link', { name: 'Edit', exact: true }).click();
    const target = authored.posts.find((post) => post.title === 'Writer story 6');
    await expect(page).toHaveURL(new RegExp(`/edit/${target.id}$`));
    await page.getByLabel(/^Title/).fill('Cancelled oversight draft');
    await page.getByRole('link', { name: 'Cancel', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/blog/${target.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(target.title);
    expect((await readStorage(page)).posts).toEqual(authored.posts);
    await accountLink(page, 'Dashboard');
    await recent.getByRole('article').first().getByRole('link', { name: 'Edit', exact: true }).click();
    await page.getByLabel(/^Title/).fill('Admin revised writer story');
    await page.getByLabel(/^Content/).fill('Reviewed by Admin, still authored by Journey Writer.');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/blog/${target.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin revised writer story');
    const revised = { ...target, title: 'Admin revised writer story', content: 'Reviewed by Admin, still authored by Journey Writer.' };
    const expectedPosts = authored.posts.map((post) => post.id === target.id ? revised : post);
    expect((await readStorage(page)).posts).toEqual(expectedPosts);
    await accountLink(page, 'Dashboard');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Admin Dashboard' })).toBeVisible();
    await page.reload();
    await expect(recent.getByRole('article').first().getByRole('heading')).toHaveText(revised.title);
    const beforeDelete = await readStorage(page);
    const dismissedDialog = page.waitForEvent('dialog').then(async (dialog) => {
      const message = dialog.message();
      await dialog.dismiss();
      return message;
    });
    await recent.getByRole('article').first().getByRole('button', { name: 'Delete', exact: true }).click();
    expect(await dismissedDialog).toBe('Delete this post? This cannot be undone.');
    expect(await readStorage(page)).toEqual(beforeDelete);
    await expect(page.getByRole('definition')).toHaveText(['6', '3', '2', '3']);
    await expect(recent.getByRole('article').first().getByRole('heading')).toHaveText(revised.title);
    const acceptedDialog = page.waitForEvent('dialog').then(async (dialog) => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await recent.getByRole('article').first().getByRole('button', { name: 'Delete', exact: true }).click();
    expect(await acceptedDialog).toBe('Delete this post? This cannot be undone.');
    await expect(page.getByRole('definition')).toHaveText(['5', '3', '2', '3']);
    await expect(recent.getByRole('heading', { name: revised.title, exact: true })).toHaveCount(0);
    const deleted = await readStorage(page);
    expect(deleted.posts).toEqual(expectedPosts.filter((post) => post.id !== target.id));
    expect(deleted.users).toEqual(saved.users);
    expect(deleted.session).toEqual(beforeDelete.session);
    await page.reload();
    expect(await readStorage(page)).toEqual(deleted);
    await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link', { name: 'Users' }).click();
    await expectProtection(page, 'admin', 'Default admin cannot be deleted.');
    await expectProtection(page, owner.username, 'You cannot delete your active Admin account.');
    await expectProtection(page, writer.username, policy);
    expect(await readStorage(page)).toEqual(deleted);
    await attachPreflight(page, testInfo, `${width}-users-self-protected`);
    await logout(page);
    expect(errors).toEqual([]);
  });
}

for (const path of ['/admin', '/users']) {
  test(`regular-user deep-link guard denies ${path} and preserves browser data`, async ({ page, context }) => {
    const errors = captureRuntimeErrors(page);
    const account = {
      id: 'guard-user', displayName: 'Guard Writer', username: 'guard-writer', password: 'guard-demo',
      role: 'user', createdAt: '2025-05-02T12:00:00.000Z',
    };
    const session = { userId: account.id, displayName: account.displayName, username: account.username, role: 'user' };
    await context.addInitScript(({ user, identity }) => {
      localStorage.setItem('writespace_users', JSON.stringify([user]));
      localStorage.setItem('writespace_session', JSON.stringify(identity));
    }, { user: account, identity: session });
    await page.goto(path);
    await expect(page).toHaveURL(/\/blogs$/);
    await expect(page.getByRole('heading', { level: 1, name: 'All Blogs' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Admin Dashboard|User Management/ })).toHaveCount(0);
    const before = await readStorage(page);
    expect(before.users).toEqual([account]);
    expect(before.session).toEqual(session);
    await page.reload();
    expect(await readStorage(page)).toEqual(before);
    await accountLink(page, 'Write');
    await expect(page.getByRole('form', { name: 'Write a post' })).toBeVisible();
    expect(await readStorage(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
}

test('Admin corrupt account reads expose warnings and prevent creation without repairing stored data', async ({ page }, testInfo) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/');
  await signIn(page, 'admin', 'admin', 'admin');
  await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link', { name: 'Users' }).click();
  await page.evaluate(() => { localStorage.setItem('writespace_users', '{broken'); });
  const before = await page.evaluate(() => ({ ...localStorage }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('The list may be incomplete');
  await page.getByLabel(/^Display name/).fill('Unsaved Writer');
  await page.getByLabel(/^Username/).fill('unsaved-writer');
  await page.getByLabel(/^Password/).fill('demo-only');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(2);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByLabel(/^Username/)).toHaveValue('unsaved-writer');
  await expect(page.getByRole('table')).not.toContainText('unsaved-writer');
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  await attachPreflight(page, testInfo, 'users-corrupt-storage');
  await accountLink(page, 'Dashboard');
  await expect(page.getByRole('definition')).toHaveText(['0', '—', '—', '—']);
  await expect(page.getByRole('alert')).toContainText('Affected totals are unavailable');
  await attachPreflight(page, testInfo, 'dashboard-corrupt-accounts');
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  expect(errors).toEqual([]);
});

test('Admin required and duplicate account feedback preserves fields, saved users and session', async ({ page }, testInfo) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/');
  await signIn(page, 'admin', 'admin', 'admin');
  await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link', { name: 'Users' }).click();
  const before = await readStorage(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(['Display name is required.', 'Username is required.', 'Password is required.']);
  expect(await readStorage(page)).toEqual(before);
  await createAccount(page, 'Duplicate Writer', 'taken-writer', 'user');
  const saved = await readStorage(page);
  for (const username of ['admin', 'taken-writer']) {
    await page.getByLabel(/^Display name/).fill('Another Admin');
    await page.getByLabel(/^Username/).fill(username);
    await page.getByLabel(/^Password/).fill('other-demo');
    await page.getByLabel('Role', { exact: true }).selectOption('admin');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Username is already taken.');
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByLabel(/^Username/)).toHaveValue(username);
    await expect(page.getByLabel(/^Password/)).toHaveValue('other-demo');
    expect(await readStorage(page)).toEqual(saved);
  }
  await attachPreflight(page, testInfo, 'users-duplicate-feedback');
  await page.reload();
  expect(await readStorage(page)).toEqual(saved);
  expect(errors).toEqual([]);
});
