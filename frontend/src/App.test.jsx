/** Verify public rendering, route recovery, and a side-effect-free entry. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

/**
 * Render the entry within a test-owned router at the requested URL.
 * @param {string} path - Initial public route, including an optional hash.
 * @returns {import('@testing-library/react').RenderResult} Mounted test view.
 */
function renderEntry(path = '/') {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}

describe('WriteSpace public entry', () => {
  it('renders a real welcome with accessible content and working link destinations', () => {
    renderEntry();

    expect(screen.getByRole('heading', { level: 1, name: 'A little space for big ideas.' })).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('link', { name: 'Meet WriteSpace' })).toHaveAttribute('href', '#about');
    expect(screen.getByRole('heading', { name: 'Words begin here.' })).toBeVisible();
    expect(screen.getByText(/This is a browser-local writing demo/)).toBeVisible();
  });

  it('renders an unknown-route fallback and returns home by clicking its link', async () => {
    const user = userEvent.setup();
    renderEntry('/a-page-that-does-not-exist');

    expect(screen.getByRole('heading', { name: 'This page wandered off.' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'A little space for big ideas.' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Return to WriteSpace' }));
    expect(screen.getByRole('heading', { name: 'A little space for big ideas.' })).toBeVisible();
  });

  it('keeps the welcome available after following its introductory links and remounting', async () => {
    const user = userEvent.setup();
    const view = renderEntry();

    await user.click(screen.getByRole('link', { name: 'Meet WriteSpace' }));
    expect(screen.getByRole('heading', { name: 'Words begin here.' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Back to welcome' }));
    view.unmount();
    renderEntry('/');

    expect(screen.getByRole('heading', { name: 'A little space for big ideas.' })).toBeVisible();
  });

  it('does not mutate existing browser data during entry or fallback navigation', async () => {
    const user = userEvent.setup();
    const storedPosts = JSON.stringify([{ id: 'existing', title: 'Keep this story' }]);
    localStorage.setItem('writespace_posts', storedPosts);
    localStorage.setItem('writespace_users', 'malformed but untouched');
    localStorage.setItem('writespace_session', '{"id":"existing-user"}');
    sessionStorage.setItem('unrelated', 'preserve');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const clear = vi.spyOn(Storage.prototype, 'clear');
    renderEntry('/unknown');

    await user.click(screen.getByRole('link', { name: 'Return to WriteSpace' }));
    await user.click(screen.getByRole('link', { name: 'Meet WriteSpace' }));

    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(localStorage.getItem('writespace_posts')).toBe(storedPosts);
    expect(localStorage.getItem('writespace_users')).toBe('malformed but untouched');
    expect(localStorage.getItem('writespace_session')).toBe('{"id":"existing-user"}');
    expect(localStorage).toHaveLength(3);
    expect(sessionStorage.getItem('unrelated')).toBe('preserve');
  });

  it('renders without consulting storage even when storage reads would throw', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    renderEntry();

    expect(screen.getByRole('heading', { name: 'A little space for big ideas.' })).toBeVisible();
    expect(getItem).not.toHaveBeenCalled();
  });
});
