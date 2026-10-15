/** Verify role navigation, fail-closed gates, avatars and click-only actions. */
import { BookOpen, Crown, UserCircle } from '@phosphor-icons/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Avatar from './Avatar.jsx';
import Navbar from './Navbar.jsx';
import PublicNavbar from './PublicNavbar.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';

const writer = { userId: 'u', username: 'writer', displayName: 'Writer', role: 'user' };
const admin = { ...writer, userId: 'admin', role: 'admin', displayName: 'Admin' };
const invalid = [null, {}, { role: 'admin' }, { ...writer, role: 'owner' }, { ...writer, userId: 1 }];

/** Expose the current URL as a test-only navigation probe. */
function LocationProbe() {
  const location = useLocation();
  return (
    <p data-testid="location">
      {location.pathname}
    </p>
  );
}

/** Mount component navigation with a test-owned router. */
function mount(content, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {content}
      <LocationProbe />
    </MemoryRouter>,
  );
}

/** Mount a guarded child and safe redirect probes. */
function guard(session, role) {
  return mount(
    <Routes>
      <Route
        path="/protected"
        element={(
          <ProtectedRoute session={session} role={role}>
            <p>
              Authorized child
            </p>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/login"
        element={(
          <p>
            Login destination
          </p>
        )}
      />
      <Route
        path="/blogs"
        element={(
          <p>
            Blogs destination
          </p>
        )}
      />
    </Routes>,
    '/protected',
  );
}

describe('ProtectedRoute', () => {
  it.each(invalid)('redirects invalid session %j to login without rendering children', (session) => {
    guard(session);
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(screen.queryByText('Authorized child')).not.toBeInTheDocument();
  });

  it.each([writer, admin])('allows complete recognized session %j on general routes', (session) => {
    guard(session);
    expect(screen.getByText('Authorized child')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/protected');
  });

  it('denies a writer on an Admin route and sends them to blogs', () => {
    guard(writer, 'admin');
    expect(screen.getByTestId('location')).toHaveTextContent('/blogs');
    expect(screen.queryByText('Authorized child')).not.toBeInTheDocument();
  });

  it('allows Admin-only children for a complete Admin', () => {
    guard(admin, 'admin');
    expect(screen.getByText('Authorized child')).toBeVisible();
  });

  it.each(invalid)('does not accept a partial or unknown session %j for Admin routes', (session) => {
    guard(session, 'admin');
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });
});

describe('Avatar and PublicNavbar', () => {
  it.each([['admin', 'Admin avatar'], ['user', 'User avatar'], [null, 'Guest avatar'], ['owner', 'Guest avatar']])(
    'labels role %s without granting unknown identities',
    (role, label) => {
      render(<Avatar role={role} />);
      expect(screen.getByRole('img', { name: label })).toBeVisible();
      expect(screen.getByRole('img').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    },
  );

  it.each([
    ['admin', 'Admin avatar', Crown, 'bg-violet-100', 'text-violet-900'],
    ['user', 'User avatar', BookOpen, 'bg-indigo-100', 'text-indigo-900'],
    [null, 'Guest avatar', UserCircle, 'bg-slate-100', 'text-slate-900'],
    ['owner', 'Guest avatar', UserCircle, 'bg-slate-100', 'text-slate-900'],
  ])('renders the actual role glyph and colors for %s', (role, label, ExpectedIcon, background, foreground) => {
    render(<Avatar role={role} />);
    const avatar = screen.getByRole('img', { name: label });
    const glyph = avatar.querySelector('svg');
    // Compare real library-rendered geometry, not mocked icon names or labels.
    const reference = render(<ExpectedIcon size={24} weight="regular" aria-hidden="true" />);
    const expectedGlyph = reference.container.querySelector('svg');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph).toHaveAttribute('viewBox', expectedGlyph.getAttribute('viewBox'));
    expect(glyph.querySelector('path')).not.toBeNull();
    expect(glyph.innerHTML).toBe(expectedGlyph.innerHTML);
    expect(avatar).toHaveClass(background, foreground);
    for (const color of ['violet', 'indigo', 'slate']) {
      if (background !== `bg-${color}-100`) {
        expect(avatar).not.toHaveClass(`bg-${color}-100`);
        expect(avatar).not.toHaveClass(`text-${color}-900`);
      }
    }
  });

  it.each(invalid)('shows native guest links for %j', (session) => {
    mount(<PublicNavbar session={session} />);
    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each([[writer, 'All Blogs', '/blogs'], [admin, 'Dashboard', '/admin']])(
    'shows identity and role destination for %j',
    (session, label, href) => {
      mount(<PublicNavbar session={session} />);
      expect(screen.getByText(session.displayName)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
      expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
      expect(screen.getByRole('banner')).toHaveClass('sticky');
    },
  );
});

describe('Navbar', () => {
  it.each(invalid)('falls back to public controls for %j and never calls logout on mount', (session) => {
    const logout = vi.fn();
    mount(<Navbar session={session} onLogout={logout} />);
    expect(screen.getByRole('link', { name: 'Login' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it.each([[writer, false], [admin, true]])('offers role-correct destinations and active NavLinks for %j', async (session, isAdmin) => {
    const user = userEvent.setup();
    const logout = vi.fn();
    mount(<Navbar session={session} onLogout={logout} />, '/blogs');
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const nav = within(screen.getByRole('navigation', { name: 'Account navigation' }));
    expect(nav.getByRole('link', { name: 'All Blogs' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Write' })).toHaveAttribute('href', '/write');
    expect(Boolean(nav.queryByRole('link', { name: 'Users' }))).toBe(isAdmin);
    expect(Boolean(nav.queryByRole('link', { name: 'Dashboard' }))).toBe(isAdmin);
    expect(logout).not.toHaveBeenCalled();
  });

  it('opens and closes the mobile menu and closes it after a native link click', async () => {
    const user = userEvent.setup();
    mount(<Navbar session={writer} onLogout={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('account-links')).toHaveClass('hidden');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    await user.click(screen.getByRole('link', { name: 'Write' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/write');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    await user.click(screen.getByRole('link', { name: 'WriteSpace home' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('delegates logout only after click and keeps failed logout feedback visible with the identity', async () => {
    const user = userEvent.setup();
    const logout = vi.fn();
    mount(<Navbar session={admin} onLogout={logout} logoutError="Could not log out. Your session is still active." />);
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Your session is still active.');
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });
});
