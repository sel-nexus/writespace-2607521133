/** Exercise real registration, plain-text CRUD, responsive grids and UI sign-in ownership journeys. */
import { expect, test } from '@playwright/test';

const tagline = 'Your thoughts. Your space. Beautifully simple.';
const title = '<b>A literal title</b>';
const body = 'First line\n\n  Indented line\n<img src=x onerror="window.__postsXss=true">\n<script>window.__postsXss=true</script>';

/** Install runtime listeners before the first navigation; every test asserts the final empty list. */
function captureRuntimeErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => { errors.push(error.message); });
  return errors;
}

/** Read actual browser collections, session and key inventory without helper mocks. */
async function readStorage(page) {
  return page.evaluate(() => ({
    posts: JSON.parse(localStorage.getItem('writespace_posts') || '[]'),
    users: JSON.parse(localStorage.getItem('writespace_users') || '[]'),
    session: JSON.parse(localStorage.getItem('writespace_session') || 'null'),
    keys: Object.keys(localStorage).sort(), temporary: { ...sessionStorage },
  }));
}

/** Open the real mobile account menu only when its button is visible. */
async function openNavigation(page) {
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  if (await toggle.isVisible()) await toggle.click();
}

/** Navigate by a real authenticated link, never by route teleportation. */
async function accountLink(page, name) {
  await openNavigation(page);
  await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name, exact: true }).click();
}

/** Register through visible fields; the caller reaches Register by clicking a real link. */
async function register(page, username) {
  await page.getByLabel(/^Display name/).fill(`${username} Writer`);
  await page.getByLabel(/^Username/).fill(username);
  await page.getByLabel(/^Password/).fill('posts-demo-only');
  await page.getByLabel(/^Confirm password/).fill('posts-demo-only');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('heading', { level: 1, name: 'All Blogs' })).toBeVisible();
}

/** Log out through the real responsive controls and verify guest landing. */
async function logout(page) {
  await openNavigation(page);
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: tagline })).toBeVisible();
  expect((await readStorage(page)).session).toBeNull();
}

/** Sign in from landing by clicking Start Reading, including Admin credentials. */
async function signIn(page, username, password = 'posts-demo-only') {
  await page.getByRole('link', { name: 'Start Reading', exact: true }).click();
  await page.getByLabel(/^Username/).fill(username);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(username === 'admin' ? /\/admin$/ : /\/blogs$/);
}

/** Fill the real writer form with exact plain text. */
async function fillPost(page, postTitle, content) {
  await page.getByLabel(/^Title/).fill(postTitle);
  await page.getByLabel(/^Content/).fill(content);
  await expect(page.getByText(`${content.length} characters`, { exact: true })).toBeVisible();
}

/** Confirm that saved body and markup remain text, not injected DOM or executed script. */
async function expectTextSafe(page, postTitle, content) {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(postTitle);
  const paragraph = main.locator('article > p');
  expect(await paragraph.textContent()).toBe(content);
  expect(await paragraph.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('pre-wrap');
  await expect(main.locator('script, img, b')).toHaveCount(0);
  expect(await page.evaluate(() => window.__postsXss)).toBeUndefined();
}

/** Seed unrelated posts only, preserving the identity and accounts created through the real UI. */
async function addUnrelatedPosts(page) {
  const fixtures = [1, 2, 3, 4].map((day) => ({
    id: `fixture-${day}`, title: `Earlier story ${day}`, content: `${'p'.repeat(120)}HIDDEN TAIL`,
    authorId: 'another-author', authorName: 'Another Writer', createdAt: `2020-01-0${day}T00:00:00.000Z`,
  }));
  await page.evaluate((posts) => {
    const current = JSON.parse(localStorage.getItem('writespace_posts') || '[]');
    localStorage.setItem('writespace_posts', JSON.stringify([...current, ...posts]));
  }, fixtures);
  return fixtures;
}

for (const width of [1440, 390]) {
  test(`real registration → write → read → edit → reload → cancel/confirm deletion at ${width}px`, async ({ page }) => {
    const errors = captureRuntimeErrors(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
    await register(page, 'journey');
    const account = await readStorage(page);
    expect(account.users).toHaveLength(1);
    expect(account.session.userId).toBe(account.users[0].id);
    expect(account.posts).toEqual([]);
    await page.getByRole('link', { name: 'Write your first post' }).click();
    await fillPost(page, 'Discard this draft', 'Discard this content');
    await page.getByRole('link', { name: 'Cancel', exact: true }).click();
    expect(await readStorage(page)).toEqual(account);
    await accountLink(page, 'Write');
    await page.getByRole('button', { name: 'Publish post' }).click();
    await expect(page.getByLabel(/^Title/)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel(/^Title/)).toHaveAttribute('aria-describedby', 'post-title-error');
    await expect(page.getByLabel(/^Content/)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel(/^Content/)).toHaveAttribute('aria-describedby', 'post-count post-content-error');
    expect((await readStorage(page)).posts).toEqual([]);
    expect(await page.getByLabel(/^Content/).evaluate((element) => parseFloat(getComputedStyle(element).minHeight))).toBeGreaterThanOrEqual(256);
    await fillPost(page, title, body);
    await page.getByRole('button', { name: 'Publish post' }).click();
    const createdState = await readStorage(page);
    const created = createdState.posts[0];
    expect(createdState.posts).toHaveLength(1);
    expect(created).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/), title, content: body, createdAt: expect.any(String),
      authorId: account.session.userId, authorName: account.session.displayName,
    });
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    await expect(page).toHaveURL(new RegExp(`/blog/${created.id}$`));
    await expectTextSafe(page, title, body);
    await page.reload();
    expect(await readStorage(page)).toEqual(createdState);
    await expectTextSafe(page, title, body);
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel(/^Title/)).toHaveValue(title);
    await expect(page.getByLabel(/^Content/)).toHaveValue(body);
    await fillPost(page, 'Cancelled edit', 'Not saved');
    await page.getByRole('link', { name: 'Cancel', exact: true }).click();
    expect(await readStorage(page)).toEqual(createdState);
    await expectTextSafe(page, title, body);
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    const revisedTitle = 'A revised literal title';
    const revisedBody = `${body}\nThe last line.`;
    await fillPost(page, revisedTitle, revisedBody);
    await page.getByRole('button', { name: 'Save changes' }).click();
    const updated = { ...created, title: revisedTitle, content: revisedBody };
    expect((await readStorage(page)).posts).toEqual([updated]);
    await expectTextSafe(page, revisedTitle, revisedBody);
    await page.reload();
    expect((await readStorage(page)).posts).toEqual([updated]);
    await expectTextSafe(page, revisedTitle, revisedBody);
    const fixtures = await addUnrelatedPosts(page);
    await page.getByRole('link', { name: 'Back to All Blogs' }).click();
    const cards = page.getByRole('main').getByRole('article');
    await expect(cards.getByRole('heading')).toHaveText([
      revisedTitle, 'Earlier story 4', 'Earlier story 3', 'Earlier story 2', 'Earlier story 1',
    ]);
    const grid = page.locator('[aria-label="Posts"]');
    expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(width === 390 ? 1 : 3);
    if (width === 1440) {
      await page.setViewportSize({ width: 820, height: 1000 });
      expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
      await page.setViewportSize({ width, height: 1000 });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(cards.nth(1).getByText('p'.repeat(120), { exact: true })).toBeVisible();
    await expect(cards.getByText(/HIDDEN TAIL/)).toHaveCount(0);
    for (let index = 0; index < 5; index += 1) {
      await expect(cards.nth(index)).toHaveClass(new RegExp(`border-t-${['indigo', 'violet', 'pink', 'teal'][index % 4]}-500`));
    }
    await cards.first().getByRole('link', { name: /Read post/ }).click();
    const beforeDelete = await readStorage(page);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/blog/${created.id}$`));
    expect(await readStorage(page)).toEqual(beforeDelete);
    await expectTextSafe(page, revisedTitle, revisedBody);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    const deletedState = await readStorage(page);
    expect(deletedState.posts).toEqual(fixtures);
    expect(deletedState.users).toEqual(account.users);
    expect(deletedState.session).toEqual(account.session);
    expect(deletedState.keys).toEqual(['writespace_posts', 'writespace_session', 'writespace_users']);
    expect(deletedState.temporary).toEqual({});
    await expect(page.getByRole('heading', { name: revisedTitle })).toHaveCount(0);
    await page.reload();
    expect(await readStorage(page)).toEqual(deletedState);
    await logout(page);
    expect(errors).toEqual([]);
  });
}

 test('guest, two registered users and UI-signed-in Admin obey post ownership without changing authorship', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/');
  const foreign = {
    id: 'foreign', title: 'A fixture from someone else', content: 'Another writer owns this.',
    authorId: 'fixture-owner', authorName: 'Fixture Writer', createdAt: '2020-01-01T00:00:00.000Z',
  };
  await page.evaluate((post) => { localStorage.setItem('writespace_posts', JSON.stringify([post])); }, foreign);
  await page.reload();
  await page.getByRole('link', { name: foreign.title, exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  expect((await readStorage(page)).session).toBeNull();
  expect((await readStorage(page)).posts).toEqual([foreign]);
  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  await register(page, 'alice');
  await accountLink(page, 'Write');
  await fillPost(page, 'Alice owns this', 'Alice body');
  await page.getByRole('button', { name: 'Publish post' }).click();
  const aliceState = await readStorage(page);
  const alicePost = aliceState.posts.find((post) => post.title === 'Alice owns this');
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  await logout(page);
  await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
  await register(page, 'bob');
  await page.getByRole('link', { name: alicePost.title, exact: true }).click();
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  expect((await readStorage(page)).posts).toEqual(aliceState.posts);
  await page.getByRole('link', { name: 'Back to All Blogs' }).click();
  await accountLink(page, 'Write');
  await fillPost(page, 'Bob owns this', 'Bob body');
  await page.getByRole('button', { name: 'Publish post' }).click();
  const bobPost = (await readStorage(page)).posts.find((post) => post.title === 'Bob owns this');
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
  await logout(page);
  await signIn(page, 'alice');
  await page.getByRole('link', { name: alicePost.title, exact: true }).click();
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to All Blogs' }).click();
  await page.getByRole('link', { name: bobPost.title, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await logout(page);
  await signIn(page, 'admin', 'admin');
  await accountLink(page, 'All Blogs');
  await page.getByRole('link', { name: alicePost.title, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await fillPost(page, 'Admin revised Alice', 'Still Alice authored this');
  await page.getByRole('button', { name: 'Save changes' }).click();
  const revisedAlice = { ...alicePost, title: 'Admin revised Alice', content: 'Still Alice authored this' };
  expect((await readStorage(page)).posts).toEqual([foreign, revisedAlice, bobPost]);
  await page.reload();
  expect((await readStorage(page)).posts).toEqual([foreign, revisedAlice, bobPost]);
  await page.getByRole('link', { name: 'Back to All Blogs' }).click();
  await page.getByRole('link', { name: foreign.title, exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  expect((await readStorage(page)).posts).toEqual([foreign, revisedAlice, bobPost]);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  expect((await readStorage(page)).posts).toEqual([revisedAlice, bobPost]);
  await page.reload();
  expect((await readStorage(page)).posts).toEqual([revisedAlice, bobPost]);
  await logout(page);
  expect(errors).toEqual([]);
});
