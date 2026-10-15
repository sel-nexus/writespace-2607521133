/** Verify discovery entry, future-route protection and durable session transitions. */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const tagline = 'Your thoughts. Your space. Beautifully simple.';
const writer = { userId: 'u', username: 'writer', displayName: 'Writer', role: 'user' };
const admin = { ...writer, userId: 'admin', role: 'admin', displayName: 'Admin' };
const postPaths = ['/blogs', '/blog/example', '/write', '/edit/example'];
const adminPaths = ['/admin', '/users'];

/** Expose route changes without inventing unimplemented feature content. */
function LocationProbe() {
  const location = useLocation();
  return (
    <p data-testid="location">
      {location.pathname}
    </p>
  );
}

/** Render the app inside the sole test-owned router. */
function renderEntry(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
}

/** Dispatch a realistic cross-tab session notification inside React's test boundary. */
function sessionChanged(value, key = 'writespace_session') {
  if (value === null) localStorage.removeItem('writespace_session');
  else localStorage.setItem('writespace_session', JSON.stringify(value));
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key })); });
}

describe('WriteSpace public entry', () => {
  it('renders editorial discovery with accessible landmarks and final CTA destinations', () => {
    renderEntry();
    expect(screen.getByRole('heading', { level: 1, name: tagline })).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Get Started Free' })).toHaveAttribute('href', '/register');
    expect(screen.getByText(/A browser-local writing demo/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
  });

  it('retains the unknown-route fallback and returns home through a native link click', async () => {
    const user = userEvent.setup();
    renderEntry('/a-page-that-does-not-exist');
    expect(screen.getByRole('heading', { name: 'This page wandered off.' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: tagline })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Return to WriteSpace' }));
    expect(screen.getByRole('heading', { name: tagline })).toBeVisible();
  });

  it('keeps discovery available after home navigation and a remount', async () => {
    const user = userEvent.setup();
    const view = renderEntry();
    await user.click(screen.getByRole('link', { name: 'WriteSpace home' }));
    view.unmount();
    renderEntry();
    expect(screen.getByRole('heading', { name: tagline })).toBeVisible();
  });

  it('does not mutate either storage area during public and fallback navigation', async () => {
    const user = userEvent.setup();
    const posts = '[{"id":"existing","title":"Keep this story"}]';
    localStorage.setItem('writespace_posts', posts);
    localStorage.setItem('writespace_users', 'malformed but untouched');
    localStorage.setItem('writespace_session', '{"id":"existing-user"}');
    sessionStorage.setItem('unrelated', 'preserve');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const clear = vi.spyOn(Storage.prototype, 'clear');
    renderEntry('/unknown');
    await user.click(screen.getByRole('link', { name: 'Return to WriteSpace' }));
    await user.click(screen.getByRole('link', { name: 'WriteSpace home' }));
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(localStorage.getItem('writespace_posts')).toBe(posts);
    expect(localStorage.getItem('writespace_users')).toBe('malformed but untouched');
    expect(localStorage.getItem('writespace_session')).toBe('{"id":"existing-user"}');
    expect(localStorage).toHaveLength(3);
    expect(sessionStorage.getItem('unrelated')).toBe('preserve');
  });

  it('survives denied storage reads with guest destinations and safe warnings', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderEntry();
    expect(screen.getByRole('heading', { name: tagline })).toBeVisible();
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
    expect(setItem).not.toHaveBeenCalled();
  });

  it.each(['/login', '/register'])('leaves unfinished public route %s as not-found without feature claims', (path) => {
    renderEntry(path);
    expect(screen.getByTestId('location')).toHaveTextContent(path);
    expect(screen.getByRole('heading', { name: 'This page wandered off.' })).toBeVisible();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
});

describe('entry protection and session handling', () => {
  it.each([...postPaths, ...adminPaths])('redirects guests on known protected route %s to login', (path) => {
    renderEntry(path);
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(screen.getByRole('heading', { name: 'This page wandered off.' })).toBeVisible();
  });

  it.each(['{broken', '{}', '{"role":"admin"}', JSON.stringify({ ...writer, role: 'owner' })])(
    'fails closed for invalid stored session %s without deleting it',
    (raw) => {
      localStorage.setItem('writespace_session', raw);
      renderEntry('/admin');
      expect(screen.getByTestId('location')).toHaveTextContent('/login');
      expect(screen.getByRole('alert')).toHaveTextContent('Could not read your saved session.');
      expect(localStorage.getItem('writespace_session')).toBe(raw);
    },
  );

  it.each(postPaths)('keeps authorized writer path %s at not-found until that slice is implemented', (path) => {
    localStorage.setItem('writespace_session', JSON.stringify(writer));
    renderEntry(path);
    expect(screen.getByTestId('location').textContent).toBe(path);
    expect(screen.getByRole('heading', { name: 'This page wandered off.' })).toBeVisible();
  });

  it.each(adminPaths)('redirects writers from Admin-only path %s to blogs', (path) => {
    localStorage.setItem('writespace_session', JSON.stringify(writer));
    renderEntry(path);
    expect(screen.getByTestId('location').textContent).toBe('/blogs');
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it.each([...postPaths, ...adminPaths])('keeps authorized Admin route %s at not-found without a fake feature page', (path) => {
    localStorage.setItem('writespace_session', JSON.stringify(admin));
    renderEntry(path);
    expect(screen.getByTestId('location').textContent).toBe(path);
    expect(screen.getByRole('heading', { name: 'This page wandered off.' })).toBeVisible();
  });

  it.each([[writer, 'All Blogs', '/blogs'], [admin, 'Dashboard', '/admin']])(
    'reads a persisted identity %j on landing without forcing a role redirect',
    (session, label, href) => {
      localStorage.setItem('writespace_session', JSON.stringify(session));
      renderEntry();
      expect(screen.getByTestId('location').textContent).toBe('/');
      const header = within(screen.getByRole('navigation', { name: 'Public navigation' }));
      expect(header.getByRole('link', { name: label })).toHaveAttribute('href', href);
      expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/blogs');
    },
  );

  it('adopts valid cross-tab sessions, ignores other keys and fails closed on invalid sessions', () => {
    renderEntry();
    sessionChanged(writer, 'writespace_posts');
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
    sessionChanged(writer);
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/blogs');
    sessionChanged({ role: 'admin' });
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('alert')).toBeVisible();
    sessionChanged(admin);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    sessionChanged(null, null);
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
  });

  it('removes only the session on logout click and returns to guest discovery', async () => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_session', JSON.stringify(writer));
    localStorage.setItem('writespace_posts', '[]');
    localStorage.setItem('writespace_users', '[]');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    renderEntry('/blogs');
    expect(removeItem).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(removeItem).toHaveBeenCalledExactlyOnceWith('writespace_session');
    expect(localStorage.getItem('writespace_session')).toBeNull();
    expect(localStorage.getItem('writespace_posts')).toBe('[]');
    expect(localStorage.getItem('writespace_users')).toBe('[]');
    expect(screen.getByTestId('location').textContent).toBe('/');
    expect(screen.getByRole('heading', { name: tagline })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
  });

  it('keeps identity and location intact when durable logout fails, then permits a successful retry', async () => {
    const user = userEvent.setup();
    const raw = JSON.stringify(admin);
    localStorage.setItem('writespace_session', raw);
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => { throw new Error('Denied'); });
    renderEntry('/admin');
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Your session is still active.');
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    expect(screen.getByTestId('location').textContent).toBe('/admin');
    expect(localStorage.getItem('writespace_session')).toBe(raw);
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(removeItem).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('location').textContent).toBe('/');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
