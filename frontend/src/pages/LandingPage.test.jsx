/** Verify read-only discovery, preview boundaries and public destinations. */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage.jsx';

const userSession = { userId: 'u', username: 'writer', displayName: 'Writer', role: 'user' };
const adminSession = { ...userSession, role: 'admin' };

/** Build complete real-storage fixtures with predictable date ordering. */
function post(id, createdAt, content = 'A real story from this browser.') {
  return { id, title: `Story ${id}`, content, createdAt, authorId: 'u', authorName: 'Writer' };
}

/** Mount discovery inside a test-owned router with destination probes, not feature pages. */
function mount(session = null) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<LandingPage session={session} />} />
        <Route
          path="*"
          element={(
            <p>
              Destination probe
            </p>
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** Locate only real previews, excluding illustrative cards. */
function latest() {
  return within(screen.getByRole('heading', { name: 'Latest Posts' }).closest('section'));
}

describe('LandingPage', () => {
  it('shows the exact tagline, labelled samples, all features and current-year footer', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your thoughts. Your space. Beautifully simple.');
    expect(screen.getAllByText('Post Title')).toHaveLength(3);
    expect(screen.getAllByText('Full post text...')).toHaveLength(3);
    expect(screen.getAllByText('Admin')).toHaveLength(3);
    expect(screen.getAllByText('Illustrative sample')).toHaveLength(3);
    expect(screen.getByText(/illustrative samples, not saved posts/)).toBeVisible();
    for (const title of ['Write Freely', 'Private & Local', 'Instant & Fast']) {
      expect(screen.getByRole('heading', { name: title })).toBeVisible();
    }
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} WriteSpace`))).toBeVisible();
    expect(latest().getByText('No posts yet — check back soon!')).toBeVisible();
    expect(localStorage).toHaveLength(0);
  });

  it.each([null, {}, { ...userSession, role: 'owner' }, { role: 'user' }, userSession, adminSession])(
    'routes Start Reading using complete recognized sessions: %j',
    (session) => {
      mount(session);
      const valid = session === userSession || session === adminSession;
      expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', valid ? '/blogs' : '/login');
      expect(screen.getByRole('link', { name: 'Get Started Free' })).toHaveAttribute('href', '/register');
    },
  );

  it('keeps footer destinations literal and follows the CTA with a native link click', async () => {
    const user = userEvent.setup();
    mount();
    const footer = within(screen.getByRole('navigation', { name: 'Footer navigation' }));
    for (const [label, href] of [['Home', '/'], ['All Blogs', '/blogs'], ['Login', '/login'], ['Register', '/register']]) {
      expect(footer.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
    await user.click(screen.getByRole('link', { name: 'Get Started Free' }));
    expect(screen.getByText('Destination probe')).toBeVisible();
  });

  it('selects only the newest three actual posts, formats dates and takes exactly the first 120 characters', () => {
    const content = `${'x'.repeat(120)}DO NOT PREVIEW`;
    const records = [
      post('old', '2024-01-01T00:00:00Z'),
      post('middle', '2025-04-02T00:00:00Z'),
      post('new', '2025-04-04T00:00:00Z', content),
      post('third', '2025-04-01T00:00:00Z'),
    ];
    const raw = JSON.stringify(records);
    localStorage.setItem('writespace_posts', raw);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    mount();
    const previews = latest().getAllByRole('article');
    expect(previews.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Story new', 'Story middle', 'Story third',
    ]);
    expect(latest().queryByText('Story old')).not.toBeInTheDocument();
    expect(latest().getByText('x'.repeat(120))).toBeVisible();
    expect(latest().queryByText(/DO NOT PREVIEW/)).not.toBeInTheDocument();
    expect(latest().getByText('Apr 04 2025')).toBeVisible();
    expect(latest().getByRole('link', { name: 'Story new' })).toHaveAttribute('href', '/blog/new');
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('treats a saved empty array as ordinary emptiness, not corruption', () => {
    localStorage.setItem('writespace_posts', '[]');
    mount();
    expect(latest().getByText('No posts yet — check back soon!')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBe('[]');
  });

  it.each([1, 2, 3])('renders all %i records when fewer than four exist', (count) => {
    localStorage.setItem('writespace_posts', JSON.stringify(
      Array.from({ length: count }, (_, index) => post(String(index), '2025-01-01')),
    ));
    mount();
    expect(latest().getAllByRole('article')).toHaveLength(count);
    expect(latest().queryByText('No posts yet — check back soon!')).not.toBeInTheDocument();
  });

  it('preserves legacy date strings and renders plain text without executing markup', () => {
    localStorage.setItem('writespace_posts', JSON.stringify([
      post('legacy/id', 'not-a-date', '<script>bad()</script>'),
      post('valid', '1965-01-02'),
    ]));
    mount();
    expect(latest().getAllByRole('heading', { level: 3 })[0]).toHaveTextContent('Story valid');
    expect(latest().getByText('Date unavailable')).toBeVisible();
    expect(latest().getByText('<script>bad()</script>')).toBeVisible();
    expect(document.querySelector('script')).toBeNull();
    expect(latest().getByRole('link', { name: 'Story legacy/id' })).toHaveAttribute('href', '/blog/legacy%2Fid');
  });

  it.each(['{broken', '{}', '[{"id":"incomplete"}]', 'null'])('warns on corrupt data without repairing %s', (raw) => {
    localStorage.setItem('writespace_posts', raw);
    localStorage.setItem('writespace_users', 'untouched');
    localStorage.setItem('writespace_session', 'untouched');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const clear = vi.spyOn(Storage.prototype, 'clear');
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read saved posts. Your stored data has not been changed.');
    expect(latest().getByText('No posts yet — check back soon!')).toBeVisible();
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(localStorage.getItem('writespace_users')).toBe('untouched');
    expect(localStorage.getItem('writespace_session')).toBe('untouched');
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('keeps discovery usable when reads are denied and does not write during render or remount', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Denied'); });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const view = mount();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
    view.unmount();
    mount();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(write).not.toHaveBeenCalled();
  });
});
