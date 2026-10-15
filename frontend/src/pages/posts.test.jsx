/** Verify listing, detail and writer routes using real guarded storage and click/submit interactions. */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Home from './Home.jsx';
import ReadBlog from './ReadBlog.jsx';
import WriteBlog from './WriteBlog.jsx';

const writer = { userId: 'writer', username: 'writer', displayName: 'Writer', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const post = {
  id: 'post', title: 'Saved title', content: 'First line\n\n  Indented line\n<script>window.bad=true</script>',
  authorId: 'writer', authorName: 'Original Author', createdAt: '2025-04-04T00:00:00.000Z',
};
const other = { ...post, id: 'other', title: 'Other title', authorId: 'another' };

/** Seed complete storage without normalizing any original identity. */
function seed(posts = [post], session = writer) {
  localStorage.setItem('writespace_posts', JSON.stringify(posts));
  if (session) localStorage.setItem('writespace_session', JSON.stringify(session));
}

/** Observe real router destinations without mocking navigate. */
function LocationProbe() {
  return (
    <p data-testid="location">
      {useLocation().pathname}
    </p>
  );
}

/** Mount only the post slice and actual post routes in one test router. */
function mount(path = '/blogs', session = writer) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/blogs" element={<Home session={session} />} />
        <Route path="/blog/:id" element={<ReadBlog session={session} />} />
        <Route path="/write" element={<WriteBlog session={session} />} />
        <Route path="/edit/:id" element={<WriteBlog mode="edit" session={session} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

/** Enter exact title/body through labelled, controlled fields. */
async function fillDraft(user, title = 'New title', content = 'New body\nSecond line') {
  await user.clear(screen.getByLabelText(/^Title/));
  await user.type(screen.getByLabelText(/^Title/), title);
  await user.clear(screen.getByLabelText(/^Content/));
  await user.type(screen.getByLabelText(/^Content/), content);
}

/** Read actual persisted posts for preservation checks. */
function storedPosts() {
  return JSON.parse(localStorage.getItem('writespace_posts'));
}

 describe('Home', () => {
  it('lists all records newest first in the required responsive grid with four cycling borders and exact excerpt/date', () => {
    const posts = [
      { ...post, id: 'old', title: 'Old', createdAt: '2024-01-01' },
      { ...post, id: 'new', title: 'Newest', content: `${'x'.repeat(120)}TAIL`, createdAt: '2026-01-02' },
      { ...post, id: 'middle', title: 'Middle', createdAt: '2025-05-01' },
      { ...post, id: 'invalid', title: 'Invalid date', createdAt: 'bad' },
      { ...post, id: 'epoch', title: 'Before epoch', createdAt: '1965-01-02' },
    ];
    seed(posts);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    mount();
    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Newest', 'Middle', 'Old', 'Before epoch', 'Invalid date',
    ]);
    expect(cards[0].parentElement).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
    for (const [index, card] of cards.entries()) {
      expect(card).toHaveClass(`border-t-${['indigo', 'violet', 'pink', 'teal'][index % 4]}-500`);
    }
    expect(screen.getByText('x'.repeat(120)).textContent).toBe('x'.repeat(120));
    expect(screen.queryByText(/TAIL/)).not.toBeInTheDocument();
    expect(screen.getByText('Jan 02, 2026')).toBeVisible();
    expect(screen.getByText('Date unavailable')).toBeVisible();
    expect(storedPosts()).toEqual(posts);
    expect(write).not.toHaveBeenCalled();
  });

  it.each([false, true])('offers a working empty CTA for absent or empty posts: %s', async (savedEmpty) => {
    const user = userEvent.setup();
    if (savedEmpty) seed([]);
    else localStorage.setItem('writespace_session', JSON.stringify(writer));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    mount();
    expect(screen.getByRole('heading', { name: 'No posts yet' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Write your first post' }));
    expect(screen.getByRole('form', { name: 'Write a post' })).toBeVisible();
    expect(screen.getByTestId('location').textContent).toBe('/write');
    expect(write).not.toHaveBeenCalled();
  });

  it('deletion cancellation keeps the card; confirmation refreshes the real list and empty state', async () => {
    const user = userEvent.setup();
    seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: post.title })).toBeVisible();
    expect(storedPosts()).toEqual([post]);
    expect(write).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('heading', { name: post.title })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No posts yet' })).toBeVisible();
    expect(storedPosts()).toEqual([]);
  });

  it('retains cards and visible failure on denied deletion without refreshing to false empty state', async () => {
    const user = userEvent.setup();
    seed();
    mount();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Denied'); });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('heading', { name: post.title })).toBeVisible();
    expect(storedPosts()).toEqual([post]);
  });

  it('re-reads storage when re-entering rather than caching a stale list', async () => {
    const user = userEvent.setup();
    seed();
    mount();
    await user.click(screen.getByRole('link', { name: post.title }));
    seed([other]);
    await user.click(screen.getByRole('link', { name: 'Back to All Blogs' }));
    expect(screen.getByRole('heading', { name: other.title })).toBeVisible();
    expect(screen.queryByRole('heading', { name: post.title })).not.toBeInTheDocument();
  });
});

 describe('ReadBlog', () => {
  it('renders full literal title/body with original line breaks, author, date and no injected HTML', () => {
    seed([{ ...post, title: '<b>Literal title</b>' }]);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    mount('/blog/post');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('<b>Literal title</b>');
    const body = screen.getByText(/Indented line/);
    expect(body.textContent).toBe(post.content);
    expect(body).toHaveClass('whitespace-pre-wrap');
    expect(screen.getByText('Original Author')).toBeVisible();
    expect(screen.getByText('Apr 04, 2025')).toBeVisible();
    expect(screen.getByRole('img', { name: 'User avatar' })).toBeVisible();
    expect(document.querySelector('b, script')).toBeNull();
    expect(window.bad).toBeUndefined();
    expect(write).not.toHaveBeenCalled();
  });

  it('uses the matching custom Admin author session role without changing stored metadata', () => {
    const session = { ...writer, role: 'admin' };
    seed([post], session);
    mount('/blog/post', session);
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    expect(storedPosts()).toEqual([post]);
  });

  it('safely displays an invalid date and built-in Admin author avatar', () => {
    seed([{ ...post, authorId: 'admin', createdAt: 'bad' }]);
    mount('/blog/post');
    expect(screen.getByText('Date unavailable')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it.each([writer, admin, { ...writer, userId: 'not-owner' }, null])('shows actions only for owner/Admin %j', (session) => {
    seed([post], session);
    mount('/blog/post', session);
    if (session && (session.userId === post.authorId || session.role === 'admin')) {
      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/edit/post');
      expect(screen.getByRole('button', { name: 'Delete' })).toBeVisible();
    } else {
      expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    }
  });

  it('renders exact not-found and follows its back link without writes', async () => {
    const user = userEvent.setup();
    seed();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    mount('/blog/missing');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Post not found');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to All Blogs' }));
    expect(screen.getByTestId('location').textContent).toBe('/blogs');
    expect(write).not.toHaveBeenCalled();
  });

  it('cancels deletion in place, then confirmed deletion navigates to a freshly read list', async () => {
    const user = userEvent.setup();
    seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount('/blog/post');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByTestId('location').textContent).toBe('/blog/post');
    expect(storedPosts()).toEqual([post]);
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByTestId('location').textContent).toBe('/blogs');
    expect(storedPosts()).toEqual([]);
  });

  it('keeps detail and original data visible on failed deletion with no success navigation', async () => {
    const user = userEvent.setup();
    seed();
    mount('/blog/post');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByTestId('location').textContent).toBe('/blog/post');
    expect(screen.getByRole('heading', { name: post.title })).toBeVisible();
    expect(storedPosts()).toEqual([post]);
  });
});

 describe.each(['/blogs', '/blog/post', '/edit/post'])('read failure at %s', (path) => {
  it.each(['{broken', '{}', '[{}]'])('shows a warning without destructive fallback for %s', (raw) => {
    seed();
    localStorage.setItem('writespace_posts', raw);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    mount(path);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read saved posts');
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(write).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Post not found' })).not.toBeInTheDocument();
    if (path === '/blogs') expect(screen.getByRole('heading', { name: 'No posts yet' })).toBeVisible();
    if (path === '/edit/post') expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('handles denied reads without writing or crashing and retains a usable exit', () => {
    seed();
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (key === 'writespace_posts') throw new Error('Denied');
      return read.call(this, key);
    });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    mount(path);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read saved posts');
    expect(screen.getByRole('link', { name: path === '/blogs' ? 'Write a post' : 'Back to All Blogs' })).toBeVisible();
    expect(write).not.toHaveBeenCalled();
    expect(read.call(localStorage, 'writespace_posts')).toBe(JSON.stringify([post]));
  });
});

 describe('WriteBlog create and edit', () => {
  it('uses full-width fields and minimum-256 textarea, live counter and linked required validation; invalid submissions never write', async () => {
    const user = userEvent.setup();
    seed([]);
    mount('/write');
    const title = screen.getByLabelText(/^Title/);
    const content = screen.getByLabelText(/^Content/);
    expect(title).toHaveClass('w-full');
    expect(content).toHaveClass('w-full', 'min-h-[256px]');
    expect(content).toHaveAttribute('aria-describedby', 'post-count');
    expect(screen.getByText('0 characters')).toHaveAttribute('aria-live', 'polite');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Publish post' }));
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAttribute('aria-describedby', 'post-title-error');
    expect(content).toHaveAttribute('aria-invalid', 'true');
    expect(content).toHaveAttribute('aria-describedby', 'post-count post-content-error');
    expect(screen.getByText('Title is required.')).toHaveAttribute('id', 'post-title-error');
    expect(screen.getByText('Content is required.')).toHaveAttribute('id', 'post-content-error');
    expect(write).not.toHaveBeenCalled();
    await user.type(title, 'Title');
    await user.type(content, '  \n ');
    expect(screen.getByText('4 characters')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Publish post' }));
    expect(title).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText('Title is required.')).not.toBeInTheDocument();
    expect(screen.getByText('Content is required.')).toBeVisible();
    expect(write).not.toHaveBeenCalled();
    await user.clear(content);
    await user.type(content, 'Body\nLine');
    expect(screen.getByText('9 characters')).toBeVisible();
    expect(storedPosts()).toEqual([]);
    expect(screen.getByTestId('location').textContent).toBe('/write');
  });

  it.each([writer, admin])('creates from current session and navigates to the real text detail for %j', async (session) => {
    const user = userEvent.setup();
    seed([other], session);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('new-post');
    mount('/write', session);
    await fillDraft(user, '  Exact title  ', 'Body\nLine  ');
    await user.click(screen.getByRole('button', { name: 'Publish post' }));
    const created = storedPosts()[1];
    expect(created).toEqual({
      id: 'new-post', title: '  Exact title  ', content: 'Body\nLine  ', createdAt: expect.any(String),
      authorId: session.userId, authorName: session.displayName,
    });
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    expect(storedPosts()[0]).toEqual(other);
    expect(screen.getByTestId('location').textContent).toBe('/blog/new-post');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('  Exact title  ');
    expect(screen.getByText(/Body/).textContent).toBe('Body\nLine  ');
  });

  it.each(['/write', '/edit/post'])('cancel discards the draft with zero writes on %s', async (path) => {
    const user = userEvent.setup();
    seed();
    mount(path);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await fillDraft(user, 'Discarded', 'Discarded draft');
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(storedPosts()).toEqual([post]);
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').textContent).toBe(path === '/write' ? '/blogs' : '/blog/post');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    if (path === '/write') {
      await user.click(screen.getByRole('link', { name: 'Write a post' }));
      expect(screen.getByLabelText(/^Title/)).toHaveValue('');
      expect(screen.getByLabelText(/^Content/)).toHaveValue('');
    } else {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(post.title);
      await user.click(screen.getByRole('link', { name: 'Edit' }));
      expect(screen.getByLabelText(/^Title/)).toHaveValue(post.title);
      expect(screen.getByLabelText(/^Content/)).toHaveValue(post.content);
    }
  });

  it.each([writer, admin])('loads and updates the owned or Admin target while preserving all identity fields: %j', async (session) => {
    const user = userEvent.setup();
    seed([post, other], session);
    mount('/edit/post', session);
    expect(screen.getByLabelText(/^Title/)).toHaveValue(post.title);
    expect(screen.getByLabelText(/^Content/)).toHaveValue(post.content);
    expect(screen.getByText(`${post.content.length} characters`)).toBeVisible();
    await fillDraft(user, 'Changed title', 'Changed\nbody');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(storedPosts()).toEqual([{ ...post, title: 'Changed title', content: 'Changed\nbody' }, other]);
    expect(screen.getByTestId('location').textContent).toBe('/blog/post');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Changed title');
  });

  it('allows Admin to edit another author, never taking ownership', async () => {
    const user = userEvent.setup();
    seed([other], admin);
    mount('/edit/other', admin);
    await fillDraft(user);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(storedPosts()).toEqual([{ ...other, title: 'New title', content: 'New body\nSecond line' }]);
  });

  it('validates edit fields as required without changing stored data', async () => {
    const user = userEvent.setup();
    seed();
    mount('/edit/post');
    await user.clear(screen.getByLabelText(/^Title/));
    await user.clear(screen.getByLabelText(/^Content/));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('Title is required.')).toBeVisible();
    expect(screen.getByText('Content is required.')).toBeVisible();
    expect(storedPosts()).toEqual([post]);
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').textContent).toBe('/edit/post');
  });

  it('renders exact missing edit state with back link and no form or writes', () => {
    seed();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    mount('/edit/missing');
    expect(screen.getByRole('heading').textContent).toBe('Post not found');
    expect(screen.getByRole('link', { name: 'Back to All Blogs' })).toHaveAttribute('href', '/blogs');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([writer, null])('redirects unauthorized edit attempts to blogs without writes: %j', (session) => {
    seed([other], session);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    mount('/edit/other', session);
    expect(screen.getByTestId('location').textContent).toBe('/blogs');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(storedPosts()).toEqual([other]);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['missing', 'owner-changed', 'session-removed'])('rechecks target/session at submit after %s', async (change) => {
    const user = userEvent.setup();
    seed();
    mount('/edit/post');
    await fillDraft(user);
    if (change === 'missing') seed([other]);
    if (change === 'owner-changed') seed([{ ...post, authorId: 'new-owner' }]);
    if (change === 'session-removed') localStorage.removeItem('writespace_session');
    const before = localStorage.getItem('writespace_posts');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(localStorage.getItem('writespace_posts')).toBe(before);
    expect(write).not.toHaveBeenCalled();
    if (change === 'missing') {
      expect(screen.getByRole('heading').textContent).toBe('Post not found');
      expect(screen.getByTestId('location').textContent).toBe('/edit/post');
    } else expect(screen.getByTestId('location').textContent).toBe('/blogs');
  });

  it('rejects creation with a removed session at submit instead of saving as the old user', async () => {
    const user = userEvent.setup();
    seed([]);
    mount('/write');
    await fillDraft(user);
    localStorage.removeItem('writespace_session');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Publish post' }));
    expect(screen.getByTestId('location').textContent).toBe('/blogs');
    expect(storedPosts()).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });
});

describe.each([['/write', 'Publish post'], ['/edit/post', 'Save changes']])('failed save at %s', (path, button) => {
  it.each(['QuotaExceededError', 'SecurityError'])(
    'preserves fields, record and location on %s, then permits explicit retry', async (errorName) => {
      const user = userEvent.setup();
      seed();
      mount(path);
      await fillDraft(user, 'Retained title', 'Retained\ncontent');
      const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw new DOMException('Denied', errorName);
      });
      await user.click(screen.getByRole('button', { name: button }));
      expect(screen.getByRole('alert')).toHaveTextContent('Could not save your changes');
      expect(screen.getByLabelText(/^Title/)).toHaveValue('Retained title');
      expect(screen.getByLabelText(/^Content/)).toHaveValue('Retained\ncontent');
      expect(screen.getByTestId('location').textContent).toBe(path);
      expect(storedPosts()).toEqual([post]);
      expect(write).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: button }));
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('location').textContent).toMatch(/^\/blog\//);
      expect(storedPosts()[path === '/write' ? 1 : 0]).toMatchObject({ title: 'Retained title', content: 'Retained\ncontent' });
    },
  );

  it.each(['corrupt-posts', 'denied-posts', 'corrupt-session', 'denied-session'])(
    'preserves draft without writes/navigation after %s appears', async (failure) => {
      const user = userEvent.setup();
      seed();
      mount(path);
      await fillDraft(user, 'Retained title', 'Retained content');
      if (failure === 'corrupt-posts') localStorage.setItem('writespace_posts', '{broken');
      if (failure === 'corrupt-session') localStorage.setItem('writespace_session', '{broken');
      const read = Storage.prototype.getItem;
      if (failure.startsWith('denied')) {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
          if (key === (failure === 'denied-posts' ? 'writespace_posts' : 'writespace_session')) throw new Error('Denied');
          return read.call(this, key);
        });
      }
      const before = read.call(localStorage, 'writespace_posts');
      const write = vi.spyOn(Storage.prototype, 'setItem');
      await user.click(screen.getByRole('button', { name: button }));
      expect(screen.getByRole('alert')).toHaveTextContent('Could not read saved posts or session');
      expect(screen.getByLabelText(/^Title/)).toHaveValue('Retained title');
      expect(screen.getByLabelText(/^Content/)).toHaveValue('Retained content');
      expect(screen.getByTestId('location').textContent).toBe(path);
      expect(read.call(localStorage, 'writespace_posts')).toBe(before);
      expect(write).not.toHaveBeenCalled();
    },
  );
});
