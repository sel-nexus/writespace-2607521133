/** Verify registration validation, durable identity and partial-state recovery. */
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage.jsx';
import LoginPage from './LoginPage.jsx';
import * as auth from '../helpers/auth.js';

const writer = { userId: 'existing', username: 'old-writer', displayName: 'Old Writer', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const input = { displayName: 'New Writer', username: 'new-writer', password: 'demo-only', confirmPassword: 'demo-only' };
const labels = {
  displayName: /^Display name\s*\*?$/,
  username: /^Username\s*\*?$/,
  password: /^Password\s*\*?$/,
  confirmPassword: /^Confirm password\s*\*?$/,
};
const existing = { id: 'existing', displayName: 'Old Writer', username: 'old-writer', password: 'old-demo', role: 'user', createdAt: 'old-date' };

/** Mount registration and real login recovery, with explicit destination elements. */
function renderRegister(session = null, onAuthenticated = vi.fn()) {
  const view = render(
    <StrictMode>
      <MemoryRouter initialEntries={['/register']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/register" element={<RegisterPage session={session} onAuthenticated={onAuthenticated} />} />
          <Route path="/login" element={<LoginPage session={session} onAuthenticated={onAuthenticated} />} />
          <Route path="/blogs" element={<h1>Writer destination</h1>} />
          <Route path="/admin" element={<h1>Admin destination</h1>} />
          <Route path="/" element={<h1>Public destination</h1>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
  return { ...view, onAuthenticated, user: userEvent.setup() };
}

/** Enter each supplied exact value and submit only through the actual button. */
async function submitRegistration(user, values = input) {
  for (const [field, value] of Object.entries(values)) {
    if (value) await user.type(screen.getByLabelText(labels[field], { exact: false }), value);
  }
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

/** Verify failed registration preserves fields and does not report authentication. */
function expectPreserved(onAuthenticated, values = input) {
  expect(screen.getByRole('form', { name: 'Register' })).toBeVisible();
  for (const [field, value] of Object.entries(values)) {
    expect(screen.getByLabelText(labels[field], { exact: false })).toHaveValue(value);
  }
  expect(onAuthenticated).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: /destination/ })).not.toBeInTheDocument();
}

/** Stabilize generated identity and timestamp while keeping real auth/storage code. */
function stableIdentity() {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
  vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2025-05-01T00:00:00.000Z');
}

describe('RegisterPage', () => {
  it('renders all semantic fields, warning and illustrative samples without calling register or changing storage', () => {
    const register = vi.spyOn(auth, 'register');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const { onAuthenticated } = renderRegister();
    expect(screen.getByRole('form', { name: 'Register' })).toHaveAttribute('novalidate');
    for (const [field, label] of Object.entries(labels)) {
      const control = screen.getByLabelText(label, { exact: false });
      expect(control).toHaveAttribute('id', `register-${field}`);
      expect(control).toHaveAttribute('aria-required', 'true');
      expect(control).toHaveAttribute('aria-invalid', 'false');
      expect(control).not.toHaveAttribute('aria-describedby');
    }
    expect(screen.getByLabelText(/Display name/)).toHaveAttribute('autocomplete', 'nickname');
    expect(screen.getByLabelText(/Username/)).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText(labels.password)).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText(/Confirm password/)).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText(/Local-only demo/)).toHaveTextContent(/plaintext.*Do not use real or reused passwords/);
    expect(screen.getAllByText('Illustrative sample')).toHaveLength(3);
    expect(screen.getAllByText('Admin · Sample author')).toHaveLength(3);
    expect(register).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('shows all four required errors on empty submit without native validation masking feedback', async () => {
    const { user, onAuthenticated } = renderRegister();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([
      'Display name is required.', 'Username is required.', 'Password is required.', 'Password confirmation is required.',
    ]);
    for (const [field, label] of Object.entries(labels)) {
      expect(screen.getByLabelText(label, { exact: false })).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText(label, { exact: false })).toHaveAttribute('aria-describedby', `register-${field}-error`);
    }
    expectPreserved(onAuthenticated, { displayName: '', username: '', password: '', confirmPassword: '' });
    expect(write).not.toHaveBeenCalled();
  });

  it.each(Object.keys(input).flatMap((field) => ['', '   '].map((value) => [field, value])))(
    'rejects required field %s with value %j independently and preserves all entered fields', async (field, value) => {
      const { user, onAuthenticated } = renderRegister();
      const values = { ...input, [field]: value };
      const write = vi.spyOn(Storage.prototype, 'setItem');
      await submitRegistration(user, values);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(screen.getByRole('alert')).toHaveTextContent(/is required\.$/);
      expect(screen.getByLabelText(labels[field], { exact: false })).toHaveAttribute('aria-invalid', 'true');
      expectPreserved(onAuthenticated, values);
      expect(write).not.toHaveBeenCalled();
    },
  );

  it('rejects exact password mismatch, then removes obsolete field feedback on a corrected submission', async () => {
    stableIdentity();
    const { user, onAuthenticated } = renderRegister();
    const values = { ...input, confirmPassword: 'Demo-only' };
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await submitRegistration(user, values);
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords must match.');
    expect(screen.getByLabelText(/Confirm password/)).toHaveAttribute('aria-describedby', 'register-confirmPassword-error');
    expectPreserved(onAuthenticated, values);
    expect(write).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText(/Confirm password/));
    await user.type(screen.getByLabelText(/Confirm password/), input.password);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('heading', { name: 'Writer destination' })).toBeVisible();
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it.each(['admin', 'old-writer'])('rejects reserved or freshly duplicated username %s without a write', async (username) => {
    const { user, onAuthenticated } = renderRegister();
    // Another tab adds an account after this form mounted; duplicate checks must read afresh.
    localStorage.setItem('writespace_users', JSON.stringify([existing]));
    localStorage.setItem('writespace_session', JSON.stringify(admin));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const values = { ...input, username };
    await submitRegistration(user, values);
    expect(screen.getByRole('alert')).toHaveTextContent('Username is already taken.');
    expect(screen.getByLabelText(/Username/)).toHaveAttribute('aria-describedby', 'register-username-error');
    expectPreserved(onAuthenticated, values);
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem('writespace_users')).toBe(JSON.stringify([existing]));
    expect(localStorage.getItem('writespace_session')).toBe(JSON.stringify(admin));
  });

  it('appends a complete user-only account, persists exact values and calls App before navigating to blogs', async () => {
    stableIdentity();
    localStorage.setItem('writespace_users', JSON.stringify([existing]));
    const values = { ...input, displayName: ' New Writer ', username: 'Admin', password: ' demo ', confirmPassword: ' demo ' };
    const session = {
      userId: '11111111-1111-4111-8111-111111111111', username: values.username, displayName: values.displayName, role: 'user',
    };
    const callback = vi.fn((nextSession) => {
      expect(screen.getByRole('form', { name: 'Register' })).toBeVisible();
      expect(JSON.parse(localStorage.getItem('writespace_session'))).toEqual(nextSession);
      expect(JSON.parse(localStorage.getItem('writespace_users'))).toHaveLength(2);
    });
    const { user } = renderRegister(null, callback);
    await submitRegistration(user, values);
    expect(callback).toHaveBeenCalledExactlyOnceWith(session);
    expect(screen.getByRole('heading', { name: 'Writer destination' })).toBeVisible();
    const saved = JSON.parse(localStorage.getItem('writespace_users'));
    expect(saved).toEqual([existing, {
      id: session.userId, displayName: values.displayName, username: values.username, password: values.password,
      role: 'user', createdAt: '2025-05-01T00:00:00.000Z',
    }]);
    expect(JSON.parse(localStorage.getItem('writespace_session'))).toEqual(session);
    expect(localStorage).toHaveLength(2);
  });

  it.each(['{broken', '{}', '[{}]', '[{"role":"owner"}]'])('fails closed on corrupt account data %s and preserves current session', async (raw) => {
    localStorage.setItem('writespace_users', raw);
    localStorage.setItem('writespace_session', JSON.stringify(admin));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { user, onAuthenticated } = renderRegister();
    await submitRegistration(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read saved accounts.');
    expectPreserved(onAuthenticated);
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem('writespace_users')).toBe(raw);
    expect(localStorage.getItem('writespace_session')).toBe(JSON.stringify(admin));
  });

  it.each(['getItem', 'storage-access'])('reports denied %s reads and never overwrites existing account/session', async (mode) => {
    localStorage.setItem('writespace_users', JSON.stringify([existing]));
    localStorage.setItem('writespace_session', JSON.stringify(admin));
    const read = mode === 'getItem'
      ? vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Denied'); })
      : vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Denied'); });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { user, onAuthenticated } = renderRegister();
    await submitRegistration(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read saved accounts.');
    expectPreserved(onAuthenticated);
    expect(write).not.toHaveBeenCalled();
    read.mockRestore();
    expect(localStorage.getItem('writespace_users')).toBe(JSON.stringify([existing]));
    expect(localStorage.getItem('writespace_session')).toBe(JSON.stringify(admin));
  });

  it('preserves account/session on account-write failure and permits an explicit retry', async () => {
    stableIdentity();
    localStorage.setItem('writespace_users', JSON.stringify([existing]));
    localStorage.setItem('writespace_session', JSON.stringify(admin));
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Quota exceeded'); });
    const { user, onAuthenticated } = renderRegister();
    await submitRegistration(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save your account. Please try again.');
    expectPreserved(onAuthenticated);
    expect(screen.queryByRole('link', { name: 'Log in to your created account' })).not.toBeInTheDocument();
    expect(localStorage.getItem('writespace_users')).toBe(JSON.stringify([existing]));
    expect(localStorage.getItem('writespace_session')).toBe(JSON.stringify(admin));
    expect(write).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Writer destination' })).toBeVisible();
  });

  it('reports account-creation failure without navigation or partial-success claims', async () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('Unavailable'); });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { user, onAuthenticated } = renderRegister();
    await submitRegistration(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not create your account. Please try again.');
    expectPreserved(onAuthenticated);
    expect(write).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Log in to your created account' })).not.toBeInTheDocument();
  });

  it('preserves a partial account and previous session, offers login without callback, then signs in through the real login form', async () => {
    stableIdentity();
    localStorage.setItem('writespace_users', JSON.stringify([existing]));
    localStorage.setItem('writespace_session', JSON.stringify(admin));
    const originalWrite = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'writespace_session') throw new Error('Session denied');
      return originalWrite.call(this, key, value);
    });
    const { user, onAuthenticated } = renderRegister();
    await submitRegistration(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Your account was created, but you are not signed in. Please log in.');
    expectPreserved(onAuthenticated);
    expect(localStorage.getItem('writespace_session')).toBe(JSON.stringify(admin));
    const users = JSON.parse(localStorage.getItem('writespace_users'));
    expect(users).toHaveLength(2);
    expect(users[0]).toEqual(existing);
    expect(users[1]).toMatchObject({ username: input.username, password: input.password, role: 'user' });
    const loginLink = screen.getByRole('link', { name: 'Log in to your created account' });
    expect(loginLink).toHaveAttribute('href', '/login');
    write.mockRestore();
    await user.click(loginLink);
    expect(screen.getByRole('form', { name: 'Login' })).toBeVisible();
    await user.type(screen.getByLabelText(/Username/), input.username);
    await user.type(screen.getByLabelText(/Password/), input.password);
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByRole('heading', { name: 'Writer destination' })).toBeVisible();
    expect(onAuthenticated).toHaveBeenCalledExactlyOnceWith({
      userId: users[1].id, username: input.username, displayName: input.displayName, role: 'user',
    });
    expect(JSON.parse(localStorage.getItem('writespace_users'))).toEqual(users);
  });

  it.each([writer, admin])('redirects recognized session %j without creating an account or notifying App again', (session) => {
    localStorage.setItem('writespace_session', JSON.stringify(session));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const register = vi.spyOn(auth, 'register');
    const { onAuthenticated } = renderRegister(session);
    expect(screen.getByRole('heading', { name: session.role === 'admin' ? 'Admin destination' : 'Writer destination' })).toBeVisible();
    expect(register).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(localStorage.getItem('writespace_session')).toBe(JSON.stringify(session));
  });

  it.each([{}, { role: 'admin' }, { ...writer, role: 'owner' }])('does not authorize incomplete or unknown session %j', (session) => {
    renderRegister(session);
    expect(screen.getByRole('form', { name: 'Register' })).toBeVisible();
  });

  it('supports real home and existing-account link navigation without saving', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { user } = renderRegister();
    await user.click(screen.getByRole('link', { name: 'Log in', exact: true }));
    expect(screen.getByRole('form', { name: 'Login' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Return to WriteSpace' }));
    expect(screen.getByRole('heading', { name: 'Public destination' })).toBeVisible();
    expect(write).not.toHaveBeenCalled();
  });
});
