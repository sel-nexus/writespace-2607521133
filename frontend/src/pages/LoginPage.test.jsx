/** Verify local login and shared account-entry primitives through real controls. */
import { StrictMode, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PropTypes from 'prop-types';
import LoginPage from './LoginPage.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import FormField from '../components/FormField.jsx';
import * as auth from '../helpers/auth.js';

const writer = { userId: 'writer-id', username: 'writer', displayName: 'Writer', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const account = { id: writer.userId, ...writer, password: 'demo-only', createdAt: '2025-05-01T00:00:00.000Z' };

/** Render auth with real destination elements, never wildcard redirect probes. */
function renderLogin(session = null, onAuthenticated = vi.fn()) {
  const view = render(
    <StrictMode>
      <MemoryRouter initialEntries={['/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<LoginPage session={session} onAuthenticated={onAuthenticated} />} />
          <Route path="/blogs" element={<h1>Writer destination</h1>} />
          <Route path="/admin" element={<h1>Admin destination</h1>} />
          <Route path="/register" element={<h1>Registration destination</h1>} />
          <Route path="/" element={<h1>Public destination</h1>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
  return { ...view, onAuthenticated, user: userEvent.setup() };
}

/** Fill controlled login fields with exact values and activate submit. */
async function submitLogin(user, username = 'writer', password = 'demo-only') {
  await user.type(screen.getByLabelText('Username', { exact: false }), username);
  await user.type(screen.getByLabelText('Password', { exact: false }), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

/** Assert a failure cannot discard values, call success or reach a role target. */
function expectUnchanged(onAuthenticated, username = 'writer', password = 'demo-only') {
  expect(screen.getByRole('form', { name: 'Login' })).toBeVisible();
  expect(screen.getByLabelText(/Username/)).toHaveValue(username);
  expect(screen.getByLabelText(/Password/)).toHaveValue(password);
  expect(screen.queryByRole('heading', { name: /destination/ })).not.toBeInTheDocument();
  expect(onAuthenticated).not.toHaveBeenCalled();
}

/** Exercise FormField using caller-owned controlled state. */
function ControlledField() {
  const [value, setValue] = useState('');
  return (
    <FormField
      id="controlled"
      label="Draft name"
      value={value}
      autoComplete="nickname"
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

describe('LoginPage', () => {
  it('renders accessible fields, exact demo credentials and explicit plaintext local-only warning without mutations', () => {
    const login = vi.spyOn(auth, 'login');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const { onAuthenticated } = renderLogin();
    expect(screen.getByRole('form', { name: 'Login' })).toHaveAttribute('novalidate');
    expect(screen.getByLabelText(/Username/)).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText(/Password/)).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText(/Password/)).toHaveAttribute('type', 'password');
    for (const label of [/Username/, /Password/]) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('aria-required', 'true');
      expect(input).toHaveAttribute('aria-invalid', 'false');
      expect(input).not.toHaveAttribute('aria-describedby');
      expect(input.id).toBeTruthy();
    }
    expect(screen.getByText(/Demo Admin:/)).toHaveTextContent('Demo Admin: username admin / password admin.');
    expect(screen.getByText(/Local-only demo/)).toHaveTextContent(/plaintext.*Do not use real or reused passwords/);
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
    expect(login).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('shows both required errors for empty/whitespace inputs %j without native validation masking them', async (value) => {
    const { user, onAuthenticated } = renderLogin();
    if (value) {
      await user.type(screen.getByLabelText(/Username/), value);
      await user.type(screen.getByLabelText(/Password/), value);
    }
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Username is required.')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Password is required.')).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText(/Username/)).toHaveAttribute('aria-describedby', 'login-username-error');
    expect(screen.getByLabelText(/Password/)).toHaveAttribute('aria-invalid', 'true');
    expectUnchanged(onAuthenticated, value, value);
    expect(localStorage.getItem('writespace_session')).toBeNull();
  });

  it.each([['', 'demo-only', 'Username is required.'], ['writer', '', 'Password is required.']])(
    'validates missing %j / %j independently', async (username, password, error) => {
      const { user, onAuthenticated } = renderLogin();
      if (username) await user.type(screen.getByLabelText(/Username/), username);
      if (password) await user.type(screen.getByLabelText(/Password/), password);
      await user.click(screen.getByRole('button', { name: 'Log in' }));
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(screen.getByRole('alert')).toHaveTextContent(error);
      expectUnchanged(onAuthenticated, username, password);
    },
  );

  it.each([['missing', 'wrong'], ['Writer', 'demo-only'], ['writer', 'Demo-only'], [' writer', 'demo-only']])(
    'shows the exact invalid message for %s and preserves an existing durable session', async (username, password) => {
      localStorage.setItem('writespace_users', JSON.stringify([account]));
      const current = JSON.stringify(admin);
      localStorage.setItem('writespace_session', current);
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const { user, onAuthenticated } = renderLogin();
      await submitLogin(user, username, password);
      expect(screen.getByRole('alert')).toHaveTextContent(/^Invalid username or password\.$/);
      expectUnchanged(onAuthenticated, username, password);
      expect(write).not.toHaveBeenCalled();
      expect(localStorage.getItem('writespace_session')).toBe(current);
    },
  );

  it.each([[writer, account], [{ ...writer, role: 'admin' }, { ...account, role: 'admin' }]])(
    'persists a stored %j identity before callback and redirects to its role destination', async (session, stored) => {
      localStorage.setItem('writespace_users', JSON.stringify([stored]));
      const callback = vi.fn((nextSession) => {
        expect(screen.getByRole('form', { name: 'Login' })).toBeVisible();
        expect(JSON.parse(localStorage.getItem('writespace_session'))).toEqual(nextSession);
      });
      const { user } = renderLogin(null, callback);
      await submitLogin(user);
      expect(callback).toHaveBeenCalledExactlyOnceWith(session);
      expect(screen.getByRole('heading', { name: session.role === 'admin' ? 'Admin destination' : 'Writer destination' })).toBeVisible();
      expect(JSON.parse(localStorage.getItem('writespace_session'))).toEqual(session);
      expect(localStorage.getItem('writespace_users')).toBe(JSON.stringify([stored]));
    },
  );

  it('signs in built-in admin/admin before a corrupt account read and supports retry after invalid credentials', async () => {
    localStorage.setItem('writespace_users', '{broken');
    const { user, onAuthenticated } = renderLogin();
    await submitLogin(user, 'admin', 'wrong');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read saved accounts.');
    await user.clear(screen.getByLabelText(/Password/));
    await user.type(screen.getByLabelText(/Password/), 'admin');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(onAuthenticated).toHaveBeenCalledExactlyOnceWith(admin);
    expect(screen.getByRole('heading', { name: 'Admin destination' })).toBeVisible();
    expect(localStorage.getItem('writespace_users')).toBe('{broken');
  });

  it.each(['{broken', '{}', '[{}]', '[{"role":"owner"}]'])('reports corrupt account read %s without repairing data', async (raw) => {
    localStorage.setItem('writespace_users', raw);
    localStorage.setItem('writespace_session', JSON.stringify(admin));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { user, onAuthenticated } = renderLogin();
    await submitLogin(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read saved accounts.');
    expectUnchanged(onAuthenticated);
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem('writespace_users')).toBe(raw);
    expect(localStorage.getItem('writespace_session')).toBe(JSON.stringify(admin));
  });

  it('survives denied account reads without writing or clearing the current session', async () => {
    const current = JSON.stringify(admin);
    localStorage.setItem('writespace_session', current);
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Denied'); });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const { user, onAuthenticated } = renderLogin();
    await submitLogin(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read saved accounts.');
    expectUnchanged(onAuthenticated);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    read.mockRestore();
    expect(localStorage.getItem('writespace_session')).toBe(current);
  });

  it.each(['writer', 'admin'])('preserves fields and current session on denied session write for %s, then allows retry', async (username) => {
    localStorage.setItem('writespace_users', JSON.stringify([account]));
    localStorage.setItem('writespace_session', JSON.stringify(writer));
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Quota exceeded'); });
    const { user, onAuthenticated } = renderLogin();
    const password = username === 'admin' ? 'admin' : 'demo-only';
    await submitLogin(user, username, password);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save your session. Please try again.');
    expectUnchanged(onAuthenticated, username, password);
    expect(localStorage.getItem('writespace_session')).toBe(JSON.stringify(writer));
    expect(write).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(onAuthenticated).toHaveBeenCalledExactlyOnceWith(username === 'admin' ? admin : writer);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it.each([writer, admin])('redirects an already recognized session %j without submitting or mutating', (session) => {
    localStorage.setItem('writespace_session', JSON.stringify(session));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const login = vi.spyOn(auth, 'login');
    const { onAuthenticated } = renderLogin(session);
    expect(screen.getByRole('heading', { name: session.role === 'admin' ? 'Admin destination' : 'Writer destination' })).toBeVisible();
    expect(write).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(localStorage.getItem('writespace_session')).toBe(JSON.stringify(session));
  });

  it.each([{}, { role: 'admin' }, { ...writer, role: 'owner' }])('keeps incomplete or unknown-role session %j at login', (session) => {
    renderLogin(session);
    expect(screen.getByRole('form', { name: 'Login' })).toBeVisible();
  });

  it('clears obsolete field errors on successful validation and navigates via the registration link', async () => {
    const { user } = renderLogin();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await submitLogin(user, 'unknown', 'wrong');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByLabelText(/Username/)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(/Username/)).not.toHaveAttribute('aria-describedby');
    await user.click(screen.getByRole('link', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Registration destination' })).toBeVisible();
  });
});

describe('AuthLayout and FormField', () => {
  it('renders paper layers, labelled Admin samples and supplied text without storage writes; home is a real link', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route
            path="/"
            element={(
              <AuthLayout title="A title" description="An introduction">
                <p>{'<script>not executable</script>'}</p>
              </AuthLayout>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('heading', { level: 1, name: 'A title' })).toBeVisible();
    expect(screen.getByText('An introduction')).toBeVisible();
    expect(screen.getByText('<script>not executable</script>')).toBeVisible();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('main').querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
    const samples = within(screen.getByRole('region', { name: 'Every story starts with a blank page.' }));
    expect(samples.getAllByRole('article')).toHaveLength(3);
    expect(samples.getAllByText('Illustrative sample')).toHaveLength(3);
    expect(samples.getAllByText('Admin · Sample author')).toHaveLength(3);
    await user.click(screen.getByRole('link', { name: 'Return to WriteSpace' }));
    expect(screen.getByRole('heading', { name: 'A title' })).toBeVisible();
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps controlled identity and permits ordinary typing and password-manager-style paste', async () => {
    const user = userEvent.setup();
    render(<ControlledField />);
    const input = screen.getByLabelText(/Draft name/);
    await user.click(input);
    await user.paste(' pasted demo ');
    await user.type(input, 'words');
    expect(input).toHaveValue(' pasted demo words');
    expect(input).toHaveAttribute('id', 'controlled');
    expect(input).toHaveAttribute('name', 'controlled');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('associates hint and error, supports optional/password fields and removes stale error references', () => {
    const props = { id: 'secret', label: 'Demo secret', value: 'kept', onChange: vi.fn(), autoComplete: 'new-password' };
    const view = render(<FormField {...props} type="password" required={false} hint="Demo only" error="Try again" />);
    const input = screen.getByLabelText('Demo secret');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('aria-required', 'false');
    expect(input).not.toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'secret-hint secret-error');
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'secret-error');
    view.rerender(<FormField {...props} hint="Demo only" />);
    expect(screen.getByLabelText(/Demo secret/)).toBe(input);
    expect(input).toHaveValue('kept');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).toHaveAttribute('aria-describedby', 'secret-hint');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    view.rerender(<FormField {...props} error="Required" />);
    expect(input).toHaveAttribute('aria-describedby', 'secret-error');
  });

  it('declares real runtime prop contracts and reports invalid primitive inputs', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    PropTypes.resetWarningCache();
    PropTypes.checkPropTypes(AuthLayout.propTypes, { title: 10, description: 'Intro', children: 'Content' }, 'prop', 'AuthLayout');
    PropTypes.checkPropTypes(FormField.propTypes, {
      id: 'field', label: 'Name', value: [], onChange: 'not a function', autoComplete: 'username', type: 'unsupported',
    }, 'prop', 'FormField');
    expect(error).toHaveBeenCalledTimes(4);
    expect(error.mock.calls.flat().join(' ')).toMatch(/title.*number/);
    expect(error.mock.calls.flat().join(' ')).toMatch(/onChange.*string/);
  });
});
