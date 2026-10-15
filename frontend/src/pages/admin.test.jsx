/** Exercise Admin primitives and pages with real helpers, mocking only browser storage and native generators/dialogs. */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import StatCard from '../components/StatCard.jsx';
import UserRow from '../components/UserRow.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import UserManagement from './UserManagement.jsx';
import { defaultAdmin, deletionPolicyMessage } from '../helpers/users.js';

const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const owner = { userId: 'owner', username: 'owner', displayName: 'Owner', role: 'admin' };
const writer = { id: 'writer', username: 'writer', displayName: 'Writer', password: 'hidden-demo-secret', role: 'user',
  createdAt: '2025-05-02T12:00:00.000Z' };
const savedOwner = { id: owner.userId, username: owner.username, displayName: owner.displayName, role: owner.role,
  password: 'owner-demo-secret', createdAt: writer.createdAt };

/** Render pages with a real router and persist a matching operation-time identity. */
function renderPage(Page, session = admin) {
  localStorage.setItem('writespace_session', JSON.stringify(session));
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Page session={session} />
    </MemoryRouter>,
  );
}

/** Create unsorted real post records owned by another writer. */
function posts() {
  return [2, 6, 1, 4, 3, 5].map((day) => ({
    id: `p${day}`, title: `Story ${day}`, content: `Actual content ${day}`, authorId: 'writer', authorName: 'Writer',
    createdAt: `2025-05-0${day}T12:00:00.000Z`,
  }));
}

/** Read definition values by their associated visible term without ambiguous duplicate labels. */
function values() {
  return Array.from(screen.getByRole('region', { name: 'Recent Posts' }).parentElement.querySelectorAll('dd'))
    .map((node) => node.textContent.trim());
}

/** Fill accessible fields and choose either recognized role through real form events. */
async function fillAccount(user, role = 'user', username = 'new-writer') {
  await user.type(screen.getByLabelText(/^Display name/), 'New Writer');
  await user.type(screen.getByLabelText(/^Username/), username);
  await user.type(screen.getByLabelText(/^Password/), 'demo-password');
  await user.selectOptions(screen.getByLabelText('Role'), role);
}

describe('StatCard', () => {
  it.each([0, 12, '—'])('renders exact label and value %j without an invented trend', (value) => {
    render(
      <dl>
        <StatCard label="Total users" value={value} />
      </dl>,
    );
    expect(screen.getByRole('term')).toHaveTextContent('Total users');
    expect(screen.getByRole('definition')).toHaveTextContent(String(value));
    expect(screen.queryByText(/trend/i)).not.toBeInTheDocument();
  });
});

describe('UserRow', () => {
  it.each([
    [defaultAdmin, admin, 'Default admin cannot be deleted.'],
    [savedOwner, owner, 'You cannot delete your active Admin account.'],
    [writer, admin, deletionPolicyMessage],
  ])('shows account identity and distinct disabled protection for %j', async (account, session, reason) => {
    const user = userEvent.setup();
    render(
      <table>
        <tbody>
          <UserRow user={account} session={session} />
        </tbody>
      </table>,
    );
    const row = screen.getByRole('row');
    expect(within(row).getAllByText(account.displayName, { exact: true, selector: 'span' })[0]).toBeVisible();
    expect(within(row).getByRole('img', { name: account.role === 'admin' ? 'Admin avatar' : 'User avatar' })).toBeVisible();
    expect(within(row).getByText(account.username, { exact: true })).toBeVisible();
    expect(row).toHaveClass('block', 'md:table-row');
    expect(row).toHaveTextContent(account.id === 'admin' ? 'Built-in account' : 'May 02, 2025');
    const button = within(row).getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', reason);
    expect(within(row).getByRole('tooltip', { hidden: true })).toHaveTextContent(reason);
    expect(row).not.toHaveTextContent(account.password ?? 'not-a-password');
    const before = { ...localStorage };
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(button);
    expect(write).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(before);
  });

  it('safely shows unknown legacy dates and ordinary pending protection without a session', () => {
    render(
      <table>
        <tbody>
          <UserRow user={{ ...writer, createdAt: 'legacy date' }} />
        </tbody>
      </table>,
    );
    expect(screen.getByText('Date unavailable')).toBeVisible();
    expect(screen.getByRole('button')).toHaveAttribute('title', deletionPolicyMessage);
  });
});

describe('AdminDashboard', () => {
  it('shows four exact labels, inferred builtin-once counts, newest five and real quick links/actions', () => {
    localStorage.setItem('writespace_users', JSON.stringify([
      writer, savedOwner, { ...savedOwner, id: 'admin', username: 'admin' },
    ]));
    localStorage.setItem('writespace_posts', JSON.stringify(posts()));
    renderPage(AdminDashboard);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Admin Dashboard');
    expect(screen.getAllByRole('term').map((node) => node.textContent.trim()))
      .toEqual(['Total Posts', 'Total Users', 'Total Admins', 'Total users']);
    expect(values()).toEqual(['6', '3', '2', '3']);
    expect(screen.getByText(/Inferred totals:/)).toHaveTextContent('built-in Admin exactly once');
    const recent = within(screen.getByRole('region', { name: 'Recent Posts' }));
    expect(recent.getAllByRole('heading', { level: 2 }).map((node) => node.textContent.trim()))
      .toEqual(['Recent Posts', 'Story 6', 'Story 5', 'Story 4', 'Story 3', 'Story 2']);
    expect(recent.queryByText('Story 1')).not.toBeInTheDocument();
    expect(recent.getAllByRole('link', { name: 'Edit' })).toHaveLength(5);
    expect(recent.getAllByRole('button', { name: 'Delete' })).toHaveLength(5);
    expect(recent.getAllByRole('link', { name: 'Edit' })[0]).toHaveAttribute('href', '/edit/p6');
    const quick = within(screen.getByRole('navigation', { name: 'Quick actions' }));
    for (const [label, path] of [['All Blogs', '/blogs'], ['Write', '/write'], ['Users', '/users']]) {
      expect(quick.getByRole('link', { name: label })).toHaveAttribute('href', path);
    }
    expect(screen.getByRole('heading', { level: 1 }).parentElement)
      .toHaveClass('bg-gradient-to-r', 'from-violet-800', 'to-indigo-800');
  });

  it('shows usable empty activity with builtin counts and never persists sample posts', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    renderPage(AdminDashboard);
    expect(values()).toEqual(['0', '1', '1', '1']);
    expect(screen.getByText(/No posts yet/)).toBeVisible();
    expect(localStorage.getItem('writespace_posts')).toBeNull();
    expect(write.mock.calls.map(([key]) => key)).toEqual(['writespace_session']);
  });

  it.each(['writespace_posts', 'writespace_users'])('reports corrupt %s with unavailable affected counts and no repair', (key) => {
    localStorage.setItem(key, '{broken');
    renderPage(AdminDashboard);
    expect(screen.getByRole('alert')).toHaveTextContent('Affected totals are unavailable.');
    expect(values()).toEqual(key === 'writespace_posts' ? ['—', '1', '1', '1'] : ['0', '—', '—', '—']);
    expect(localStorage.getItem(key)).toBe('{broken');
  });

  it('reports denied reads rather than fabricating zero totals', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    renderPage(AdminDashboard);
    expect(values()).toEqual(['—', '—', '—', '—']);
    expect(screen.getByRole('alert')).toHaveTextContent('posts and accounts');
    expect(screen.getByText(/Recent posts are unavailable/)).toBeVisible();
  });

  it('preserves counts/list on cancellation or failed deletion, then updates both after confirmed success', async () => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_posts', JSON.stringify(posts()));
    localStorage.setItem('writespace_users', JSON.stringify([writer]));
    renderPage(AdminDashboard);
    const before = { ...localStorage };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const firstDelete = () => screen.getAllByRole('button', { name: 'Delete' })[0];
    await user.click(firstDelete());
    expect(confirm).toHaveBeenCalledWith('Delete this post? This cannot be undone.');
    expect(write).not.toHaveBeenCalled();
    expect(values()).toEqual(['6', '2', '1', '2']);
    expect({ ...localStorage }).toEqual(before);
    confirm.mockReturnValue(true);
    write.mockImplementationOnce(() => { throw new Error('quota'); });
    await user.click(firstDelete());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save your changes.');
    expect(values()).toEqual(['6', '2', '1', '2']);
    expect(screen.getByRole('heading', { name: 'Story 6' })).toBeVisible();
    expect({ ...localStorage }).toEqual(before);
    await user.click(firstDelete());
    expect(values()).toEqual(['5', '2', '1', '2']);
    expect(screen.queryByRole('heading', { name: 'Story 6' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Story 1' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem('writespace_posts')).map((post) => post.id)).not.toContain('p6');
    expect(localStorage.getItem('writespace_users')).toBe(before.writespace_users);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rereads authoritative posts and accounts after deletion, including records added after render', async () => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_posts', JSON.stringify(posts()));
    localStorage.setItem('writespace_users', JSON.stringify([writer]));
    renderPage(AdminDashboard);
    expect(values()).toEqual(['6', '2', '1', '2']);
    const freshPost = { ...posts()[0], id: 'p7', title: 'Story 7', createdAt: '2025-05-07T12:00:00.000Z' };
    localStorage.setItem('writespace_posts', JSON.stringify([...posts(), freshPost]));
    localStorage.setItem('writespace_users', JSON.stringify([writer, savedOwner]));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    expect(values()).toEqual(['6', '3', '2', '3']);
    const recent = within(screen.getByRole('region', { name: 'Recent Posts' }));
    expect(recent.getAllByRole('heading', { level: 2 }).map((node) => node.textContent.trim()))
      .toEqual(['Recent Posts', 'Story 7', 'Story 5', 'Story 4', 'Story 3', 'Story 2']);
    expect(recent.queryByRole('heading', { name: 'Story 6' })).not.toBeInTheDocument();
    expect(recent.queryByRole('heading', { name: 'Story 1' })).not.toBeInTheDocument();
    expect(recent.getAllByRole('button', { name: 'Delete' })).toHaveLength(5);
    expect(write).toHaveBeenCalledExactlyOnceWith('writespace_posts',
      JSON.stringify([...posts().filter((post) => post.id !== 'p6'), freshPost]));
    expect(JSON.parse(localStorage.getItem('writespace_users'))).toEqual([writer, savedOwner]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['posts', 'accounts', 'posts and accounts'])('reports failed %s rereads only after a successful delete', async (failure) => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_posts', JSON.stringify(posts()));
    localStorage.setItem('writespace_users', JSON.stringify([writer]));
    renderPage(AdminDashboard);
    const before = { ...localStorage };
    const originalRead = Storage.prototype.getItem;
    const originalWrite = Storage.prototype.setItem;
    let deleted = false;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      originalWrite.call(this, key, value);
      if (key === 'writespace_posts') deleted = true;
    });
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (deleted && ((key === 'writespace_posts' && failure.includes('posts'))
        || (key === 'writespace_users' && failure.includes('accounts')))) {
        throw new Error('Display reread denied');
      }
      return originalRead.call(this, key);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
      expect(deleted).toBe(true);
      expect(values()).toEqual([
        failure.includes('posts') ? '—' : '5',
        ...(failure.includes('accounts') ? ['—', '—', '—'] : ['2', '1', '2']),
      ]);
      expect(screen.getByRole('alert')).toHaveTextContent(`Could not read saved ${failure}.`);
      expect(screen.queryByRole('heading', { name: 'Story 6' })).not.toBeInTheDocument();
      if (failure.includes('posts')) {
        expect(screen.getByText(/Recent posts are unavailable/)).toBeVisible();
      } else {
        expect(screen.getByRole('heading', { name: 'Story 1' })).toBeVisible();
      }
      expect(write).toHaveBeenCalledExactlyOnceWith('writespace_posts',
        JSON.stringify(posts().filter((post) => post.id !== 'p6')));
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
    expect(JSON.parse(localStorage.getItem('writespace_posts'))).toEqual(posts().filter((post) => post.id !== 'p6'));
    expect(localStorage.getItem('writespace_users')).toBe(before.writespace_users);
    expect(localStorage.getItem('writespace_session')).toBe(before.writespace_session);
  });

  it.each(['corrupt posts', 'stale session'])('preserves rendered activity after operation-time %s', async (failure) => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_posts', JSON.stringify(posts()));
    renderPage(AdminDashboard);
    if (failure === 'corrupt posts') localStorage.setItem('writespace_posts', '{broken');
    else localStorage.removeItem('writespace_session');
    const before = { ...localStorage };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    expect(screen.getByRole('alert')).toHaveTextContent(failure === 'corrupt posts' ? 'Could not read' : 'no longer have permission');
    expect(values()[0]).toBe('6');
    expect(screen.getByRole('heading', { name: 'Story 6' })).toBeVisible();
    expect({ ...localStorage }).toEqual(before);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('UserManagement', () => {
  it('shows builtin-only empty state, labelled demo form and responsive table without password cells', () => {
    renderPage(UserManagement);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('User Management');
    expect(screen.getByText(/No stored accounts yet/)).toBeVisible();
    expect(screen.getByText(/Local-only demo/)).toHaveTextContent('Passwords are stored in plaintext');
    expect(screen.getByText(/Local-only demo/)).toHaveTextContent('Do not use real or reused passwords');
    expect(screen.getByRole('form', { name: 'Create account' })).toHaveAttribute('novalidate');
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Role')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('table')).toHaveClass('block', 'md:table');
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('title', 'Default admin cannot be deleted.');
  });

  it.each(['user', 'admin'])('creates a persisted %s account, updates rows, clears fields and keeps Admin session', async (role) => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_users', JSON.stringify([writer]));
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('new-id');
    renderPage(UserManagement);
    const sessionBefore = localStorage.getItem('writespace_session');
    await fillAccount(user, role);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('status')).toHaveTextContent('Account created. Your Admin session has not changed.');
    const saved = JSON.parse(localStorage.getItem('writespace_users'));
    expect(saved).toEqual([writer, { ...saved[1], id: 'new-id', displayName: 'New Writer', username: 'new-writer',
      password: 'demo-password', role, createdAt: expect.any(String) }]);
    const row = screen.getByText('new-writer', { exact: true }).closest('tr');
    expect(row).toHaveTextContent(role === 'admin' ? 'Admin' : 'User');
    expect(row).not.toHaveTextContent('demo-password');
    expect(screen.getByLabelText(/^Password/)).toHaveValue('');
    expect(screen.getByLabelText(/^Username/)).toHaveValue('');
    expect(screen.getByLabelText('Role')).toHaveValue('user');
    expect(localStorage.getItem('writespace_session')).toBe(sessionBefore);
  });

  it('retains the saved account and existing rows when the display reread fails only after creation', async () => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_users', JSON.stringify([writer]));
    localStorage.setItem('writespace_posts', JSON.stringify(posts()));
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('new-id');
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2025-07-06T12:00:00.000Z');
    renderPage(UserManagement);
    const before = { ...localStorage };
    await fillAccount(user, 'admin');
    const expected = {
      id: 'new-id', displayName: 'New Writer', username: 'new-writer', password: 'demo-password',
      role: 'admin', createdAt: '2025-07-06T12:00:00.000Z',
    };
    const original = Storage.prototype.getItem;
    const write = vi.spyOn(Storage.prototype, 'setItem');
    let usersReads = 0;
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (key === 'writespace_users') {
        usersReads += 1;
        if (usersReads > 1) throw new Error('Display reread denied');
      }
      return original.call(this, key);
    });
    try {
      await user.click(screen.getByRole('button', { name: 'Create account' }));
      expect(usersReads).toBe(2);
      expect(read.mock.calls.map(([key]) => key)).toEqual([
        'writespace_session', 'writespace_users', 'writespace_users',
      ]);
      expect(write).toHaveBeenCalledExactlyOnceWith('writespace_users', JSON.stringify([writer, expected]));
      expect(write.mock.results[0]).toEqual({ type: 'return', value: undefined });
      expect(read.mock.invocationCallOrder[2]).toBeGreaterThan(write.mock.invocationCallOrder[0]);
      expect(screen.getByRole('alert')).toHaveTextContent('Could not read saved accounts. The list may be incomplete');
      expect(screen.getByRole('status').textContent).toBe('Account created. Your Admin session has not changed.');
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row').slice(1);
      expect(rows).toHaveLength(3);
      expect(within(rows[0]).getByText('admin', { exact: true })).toBeVisible();
      expect(within(rows[1]).getByText('writer', { exact: true })).toBeVisible();
      expect(within(rows[1]).getByText('Writer', { exact: true })).toBeVisible();
      expect(within(rows[2]).getByText('new-writer', { exact: true })).toBeVisible();
      expect(within(rows[2]).getByText('New Writer', { exact: true })).toBeVisible();
      expect(rows[2]).toHaveTextContent('Admin');
      expect(table).not.toHaveTextContent('demo-password');
      expect(table).not.toHaveTextContent(writer.password);
      expect(screen.getByLabelText(/^Display name/)).toHaveValue('');
      expect(screen.getByLabelText(/^Username/)).toHaveValue('');
      expect(screen.getByLabelText(/^Password/)).toHaveValue('');
      expect(screen.getByLabelText('Role')).toHaveValue('user');
      expect(screen.queryByText(/No stored accounts yet/)).not.toBeInTheDocument();
    } finally {
      read.mockRestore();
    }
    // Re-read real durable storage after removing the denied-display-read spy.
    expect(localStorage.getItem('writespace_users')).toBe(JSON.stringify([writer, expected]));
    expect(JSON.parse(localStorage.getItem('writespace_users'))).toEqual([writer, expected]);
    expect(localStorage.getItem('writespace_session')).toBe(before.writespace_session);
    expect(localStorage.getItem('writespace_posts')).toBe(before.writespace_posts);
  });

  it('validates required fields with associated alerts and no false success', async () => {
    const user = userEvent.setup();
    renderPage(UserManagement);
    const before = { ...localStorage };
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getAllByRole('alert').map((node) => node.textContent.trim()))
      .toEqual(['Display name is required.', 'Username is required.', 'Password is required.']);
    for (const [label, field] of [['Display name', 'displayName'], ['Username', 'username'], ['Password', 'password']]) {
      const input = screen.getByLabelText(new RegExp(`^${label}`));
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', `admin-${field}-error`);
    }
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect({ ...localStorage }).toEqual(before);
  });

  it.each(['writer', 'admin'])('reports duplicate/reserved username %s and preserves fields and collection', async (username) => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_users', JSON.stringify([writer]));
    renderPage(UserManagement);
    const before = { ...localStorage };
    await fillAccount(user, 'admin', username);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Username is already taken.');
    expect(screen.getByLabelText(/^Username/)).toHaveValue(username);
    expect(screen.getByLabelText(/^Password/)).toHaveValue('demo-password');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect({ ...localStorage }).toEqual(before);
  });

  it('protects builtin, self and every normal account with disabled deletion and no account/post mutations', async () => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_users', JSON.stringify([writer, savedOwner]));
    localStorage.setItem('writespace_posts', JSON.stringify(posts()));
    renderPage(UserManagement, owner);
    const before = { ...localStorage };
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const buttons = screen.getAllByRole('button', { name: 'Delete' });
    expect(buttons.map((button) => button.title)).toEqual([
      'Default admin cannot be deleted.', deletionPolicyMessage, 'You cannot delete your active Admin account.',
    ]);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      await user.click(button);
    }
    expect(write).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(before);
    expect(screen.getByRole('table')).not.toHaveTextContent('hidden-demo-secret');
    expect(screen.getByRole('table')).not.toHaveTextContent('owner-demo-secret');
  });

  it.each(['corrupt', 'denied', 'write', 'stale', 'generation'])('exposes %s failure with no false success or lost fields', async (failure) => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_users', JSON.stringify([writer]));
    renderPage(UserManagement);
    await fillAccount(user);
    if (failure === 'corrupt') localStorage.setItem('writespace_users', '{broken');
    if (failure === 'stale') localStorage.removeItem('writespace_session');
    const before = { ...localStorage };
    const read = failure === 'denied'
      ? vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); }) : null;
    if (failure === 'write') vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    if (failure === 'generation') vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('unavailable'); });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    read?.mockRestore();
    expect(screen.getByRole('alert')).toHaveTextContent(failure === 'stale' ? 'current Admin session' : 'Could not');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Display name/)).toHaveValue('New Writer');
    expect(screen.getByLabelText(/^Password/)).toHaveValue('demo-password');
    expect(screen.getByRole('table')).not.toHaveTextContent('new-writer');
    expect({ ...localStorage }).toEqual(before);
  });

  it('shows an initial corrupt-read warning and incomplete list without overwriting corrupt accounts', () => {
    localStorage.setItem('writespace_users', '{broken');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    renderPage(UserManagement);
    expect(screen.getByRole('alert')).toHaveTextContent('list may be incomplete');
    expect(screen.queryByText(/No stored accounts yet/)).not.toBeInTheDocument();
    expect(localStorage.getItem('writespace_users')).toBe('{broken');
    expect(write.mock.calls.map(([key]) => key)).toEqual(['writespace_session']);
  });
});
