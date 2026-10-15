/** Verify exact local auth, fresh snapshots, validation, and partial registration. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canMutatePost, clearSession, getSession, login, register, roleHome, setSession } from './auth.js';
import { getPosts, getUsers, savePosts, saveUsers } from './storage.js';

const timestamp = '2026-03-04T12:00:00.000Z';
const uuid = '7c1f63e1-2b74-4c21-9e1c-d0b08fd3562f';
const user = { id: 'Exact-Legacy-ID', displayName: 'Jane Doe', username: 'Jane', password: 'demo-only', role: 'user', createdAt: timestamp };
const userSession = { userId: user.id, displayName: user.displayName, username: user.username, role: 'user' };
const adminSession = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const input = { displayName: 'New Writer', username: 'new', password: 'demo-only', confirmPassword: 'demo-only' };
const post = { id: 'Post-ID', title: 'Title', content: 'Body', createdAt: timestamp, authorId: user.id, authorName: user.displayName };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(timestamp));
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(uuid);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * Assert rejected auth leaves both saved accounts and the old session untouched.
 * @param {() => object} action - Invalid auth operation.
 * @param {string} code - Expected local result code.
 * @returns {object} Rejected result for additional field/message checks.
 */
function expectUnchanged(action, code) {
  saveUsers([user]);
  setSession(userSession);
  const before = { ...localStorage };
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const result = action();
  expect(result).toMatchObject({ ok: false, code });
  expect(result).not.toHaveProperty('session');
  expect(writes).not.toHaveBeenCalled();
  expect({ ...localStorage }).toEqual(before);
  expect(getUsers()).toEqual([user]);
  expect(getSession()).toEqual(userSession);
  return result;
}

describe('login', () => {
  it('checks built-in admin/admin before a conflicting saved account or corrupt users', () => {
    saveUsers([{ ...user, username: 'admin', password: 'admin' }]);
    const reads = vi.spyOn(Storage.prototype, 'getItem');
    expect(login('admin', 'admin')).toEqual({ ok: true, session: adminSession });
    expect(reads).not.toHaveBeenCalled();
    expect(getSession()).toEqual(adminSession);
    localStorage.setItem('writespace_users', '{bad');
    expect(login('admin', 'admin')).toEqual({ ok: true, session: adminSession });
    expect(localStorage.getItem('writespace_users')).toBe('{bad');
  });

  it('lets built-in Admin sign in when account getItem is denied', () => {
    const nativeGet = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === 'writespace_users') throw new Error('denied');
      return nativeGet.call(this, key);
    });
    expect(login('admin', 'admin')).toEqual({ ok: true, session: adminSession });
    expect(getSession()).toEqual(adminSession);
  });

  it.each(['user', 'admin'])('signs in an exact stored %s account preserving its ID and excluding password', (role) => {
    saveUsers([{ ...user, role }]);
    const session = { ...userSession, role };
    expect(login('Jane', 'demo-only')).toEqual({ ok: true, session });
    expect(getSession()).toEqual(session);
    expect(getSession()).not.toHaveProperty('password');
    expect(getUsers()).toEqual([{ ...user, role }]);
  });

  it('re-reads credentials on each login rather than caching an earlier account', () => {
    saveUsers([user]);
    expect(login('Jane', 'demo-only').ok).toBe(true);
    saveUsers([{ ...user, password: 'changed' }]);
    const before = { ...localStorage };
    expect(login('Jane', 'demo-only')).toEqual({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    expect({ ...localStorage }).toEqual(before);
    expect(login('Jane', 'changed')).toEqual({ ok: true, session: userSession });
    saveUsers([]);
    expect(login('Jane', 'changed').code).toBe('INVALID_CREDENTIALS');
    expect(getSession()).toEqual(userSession);
  });

  it.each([['jane', 'demo-only'], ['Jane ', 'demo-only'], [' Jane', 'demo-only'], ['Jane', 'DEMO-only'], ['Jane', 'demo-only '], ['unknown', 'wrong'], ['Admin', 'admin'], ['admin', 'wrong']])('rejects exact credential mismatch %j / %j with canonical copy and no writes', (username, password) => {
    const result = expectUnchanged(() => login(username, password), 'INVALID_CREDENTIALS');
    expect(result.message).toBe('Invalid username or password.');
  });

  it('does not invent accounts when the users key is absent', () => {
    expect(login('unknown', 'wrong')).toEqual({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    expect(getUsers()).toEqual([]);
    expect(getSession()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  for (const field of ['username', 'password']) {
    it.each([undefined, null, '', ' \t\n', 1, true, {}, []])(`rejects required ${field} = %j without reading or writing`, (invalid) => {
      const reads = vi.spyOn(Storage.prototype, 'getItem');
      const writes = vi.spyOn(Storage.prototype, 'setItem');
      const result = field === 'username' ? login(invalid, 'demo-only') : login('Jane', invalid);
      expect(result).toMatchObject({ ok: false, code: 'VALIDATION', fieldErrors: { [field]: expect.any(String) } });
      expect(reads).not.toHaveBeenCalled();
      expect(writes).not.toHaveBeenCalled();
      expect(getSession()).toBeNull();
    });
  }

  it('returns both required field errors for missing login arguments', () => {
    expect(login()).toEqual({ ok: false, code: 'VALIDATION', fieldErrors: { username: 'Username is required.', password: 'Password is required.' } });
    expect(getSession()).toBeNull();
  });

  it.each(['{bad', 'null', '{}', '[null]', JSON.stringify([{ ...user, role: 'owner' }]), JSON.stringify([{ ...user, password: 1 }])])('stops on corrupt account read %j without replacing the old session', (raw) => {
    setSession(userSession);
    localStorage.setItem('writespace_users', raw);
    const before = { ...localStorage };
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    expect(login('Jane', 'demo-only')).toMatchObject({ ok: false, code: 'STORAGE_READ' });
    expect(writes).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(before);
    expect(getSession()).toEqual(userSession);
  });

  it('reports denied account reads without attempting session persistence', () => {
    saveUsers([user]);
    setSession(userSession);
    const before = { ...localStorage };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('secret'); });
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    expect(login('Jane', 'demo-only')).toMatchObject({ ok: false, code: 'STORAGE_READ' });
    expect(writes).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(before);
  });

  it.each([['admin', 'admin'], ['Jane', 'demo-only']])('reports session write failure for %s without success or old-session loss', (username, password) => {
    saveUsers([user]);
    setSession(userSession);
    const before = { ...localStorage };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('secret', 'QuotaExceededError'); });
    const result = login(username, password);
    expect(result).toMatchObject({ ok: false, code: 'STORAGE_WRITE' });
    expect(result).not.toHaveProperty('session');
    expect({ ...localStorage }).toEqual(before);
    expect(getSession()).toEqual(userSession);
  });
});

describe('registration', () => {
  // Repeatable stress fixtures, not maximum field lengths or a product account limit.
  const longInput = {
    displayName: ` ${'Long Writer 名 '.repeat(1024)} `,
    username: ` ${'Long-Username_'.repeat(1024)} `,
    password: ` ${'Long demo password! '.repeat(1024)} `,
    confirmPassword: ` ${'Long demo password! '.repeat(1024)} `,
  };
  const manyUsers = Array.from({ length: 500 }, (_, index) => ({
    id: `Legacy-ID-${index}`,
    displayName: ` Writer ${index} 名 `,
    username: `Existing-Writer-${index}`,
    password: ` demo password ${index} `,
    role: index % 2 === 0 ? 'user' : 'admin',
    createdAt: timestamp,
  }));

  it('accepts long required fields without truncation or normalization and supports exact login', () => {
    saveUsers([user]);
    const original = { ...longInput };
    const expectedSession = { userId: uuid, displayName: longInput.displayName, username: longInput.username, role: 'user' };
    const created = { id: uuid, displayName: longInput.displayName, username: longInput.username, password: longInput.password, role: 'user', createdAt: timestamp };
    expect(register(original)).toEqual({ ok: true, session: expectedSession });
    expect(getUsers()).toEqual([user, created]);
    expect(getSession()).toEqual(expectedSession);
    expect(original).toEqual(longInput);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(clearSession()).toEqual({ ok: true });
    expect(login(longInput.username, longInput.password)).toEqual({ ok: true, session: expectedSession });
    expect(getSession()).toEqual(expectedSession);
    expect(getUsers()).toEqual([user, created]);
  });

  it('appends exactly one account after 500 existing users while preserving every record and order', () => {
    expect(saveUsers(manyUsers)).toEqual({ ok: true });
    expect(savePosts([post])).toEqual({ ok: true });
    setSession(userSession);
    const postsBefore = localStorage.getItem('writespace_posts');
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const created = { id: uuid, displayName: input.displayName, username: input.username, password: input.password, role: 'user', createdAt: timestamp };
    const expectedSession = { userId: uuid, displayName: input.displayName, username: input.username, role: 'user' };
    expect(register(input)).toEqual({ ok: true, session: expectedSession });
    expect(getUsers()).toHaveLength(501);
    expect(getUsers()).toEqual([...manyUsers, created]);
    expect(localStorage.getItem('writespace_users')).toBe(JSON.stringify([...manyUsers, created]));
    expect(getSession()).toEqual(expectedSession);
    expect(localStorage.getItem('writespace_posts')).toBe(postsBefore);
    expect(writes.mock.calls.map(([key]) => key)).toEqual(['writespace_users', 'writespace_session']);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('preserves all 500 users, posts and the previous session when a long registration exceeds storage quota', () => {
    expect(saveUsers(manyUsers)).toEqual({ ok: true });
    expect(savePosts([post])).toEqual({ ok: true });
    expect(setSession(userSession)).toEqual({ ok: true });
    const before = { ...localStorage };
    const original = { ...longInput };
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const result = register(original);
    expect(result).toEqual({ ok: false, code: 'STORAGE_WRITE', accountCreated: false, message: 'Could not save your account. Please try again.' });
    expect(result).not.toHaveProperty('session');
    expect(writes.mock.calls.map(([key]) => key)).toEqual(['writespace_users']);
    expect(remove).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(before);
    expect(getUsers()).toHaveLength(500);
    expect(getUsers()).toEqual(manyUsers);
    expect(getPosts()).toEqual([post]);
    expect(getSession()).toEqual(userSession);
    expect(original).toEqual(longInput);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('appends one UUID/ISO user-only account then persists its exact session', () => {
    saveUsers([user]); savePosts([post]);
    const original = { ...input, role: 'admin' };
    const beforeInput = { ...original };
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const result = register(original);
    const created = { id: uuid, displayName: input.displayName, username: input.username, password: input.password, role: 'user', createdAt: timestamp };
    const expectedSession = { userId: uuid, displayName: input.displayName, username: input.username, role: 'user' };
    expect(result).toEqual({ ok: true, session: expectedSession });
    expect(getUsers()).toEqual([user, created]);
    expect(getSession()).toEqual(expectedSession);
    expect(getPosts()).toEqual([post]);
    expect(original).toEqual(beforeInput);
    expect(writes.mock.calls.map(([key]) => key)).toEqual(['writespace_users', 'writespace_session']);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(Object.keys({ ...localStorage }).sort()).toEqual(['writespace_posts', 'writespace_session', 'writespace_users']);
  });

  it('creates the first account from an absent users key without a diagnostic write', () => {
    expect(register(input).ok).toBe(true);
    expect(getUsers()).toHaveLength(1);
    expect(getUsers()[0].id).toBe(uuid);
    expect(getSession().userId).toBe(uuid);
    expect(Object.keys({ ...localStorage }).sort()).toEqual(['writespace_session', 'writespace_users']);
  });

  for (const field of Object.keys(input)) {
    it(`requires an omitted ${field}`, () => {
      const invalid = { ...input };
      delete invalid[field];
      const result = expectUnchanged(() => register(invalid), 'VALIDATION');
      expect(result.fieldErrors[field]).toEqual(expect.any(String));
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    });
    it.each([undefined, null, '', ' \t\n ', 1, true, {}, []])(`requires string ${field} = %j`, (invalid) => {
      const result = expectUnchanged(() => register({ ...input, [field]: invalid }), 'VALIDATION');
      expect(result.fieldErrors[field]).toEqual(expect.any(String));
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    });
  }

  it.each([undefined, null, 1, true, '', [], {}])('returns all required fields for invalid input %j', (invalid) => {
    const result = expectUnchanged(() => register(invalid), 'VALIDATION');
    expect(Object.keys(result.fieldErrors).sort()).toEqual(Object.keys(input).sort());
  });

  it.each(['different', 'demo-only ', 'DEMO-only'])('rejects exact confirmation mismatch %j without writes', (confirmation) => {
    const result = expectUnchanged(() => register({ ...input, confirmPassword: confirmation }), 'VALIDATION');
    expect(result.fieldErrors).toEqual({ confirmPassword: 'Passwords must match.' });
  });

  it.each(['Jane', 'admin'])('rejects duplicate/reserved exact username %s without creating an account', (username) => {
    const result = expectUnchanged(() => register({ ...input, username }), 'DUPLICATE_USERNAME');
    expect(result.fieldErrors).toEqual({ username: 'Username is already taken.' });
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('reserves admin even without stored accounts', () => {
    expect(register({ ...input, username: 'admin' }).code).toBe('DUPLICATE_USERNAME');
    expect(getUsers()).toEqual([]);
    expect(getSession()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it.each(['Admin', 'ADMIN', 'jane', ' Jane '])('preserves case and spaces for non-duplicate username %j', (username) => {
    saveUsers([user]);
    expect(register({ ...input, username }).ok).toBe(true);
    expect(getUsers()[1].username).toBe(username);
    expect(getSession().username).toBe(username);
    clearSession();
    expect(login(username, input.password).ok).toBe(true);
    expect(getSession().username).toBe(username);
  });

  it('re-reads users before duplicate checks and preserves accounts added since a prior attempt', () => {
    expect(register(input).ok).toBe(true);
    expect(register(input).code).toBe('DUPLICATE_USERNAME');
    saveUsers([user]);
    expect(register(input).ok).toBe(true);
    expect(getUsers().map((account) => account.id)).toEqual([user.id, uuid]);
    expect(getSession().userId).toBe(uuid);
  });

  it.each(['{bad', 'null', '{}', '[null]', JSON.stringify([user, { ...user, createdAt: 1 }])])('stops corrupt read %j instead of overwriting the empty fallback', (raw) => {
    setSession(userSession);
    localStorage.setItem('writespace_users', raw);
    const before = { ...localStorage };
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    expect(register(input)).toMatchObject({ ok: false, code: 'STORAGE_READ' });
    expect(writes).not.toHaveBeenCalled();
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(before);
    expect(getSession()).toEqual(userSession);
  });

  it('guards denied users access and performs neither account nor session write', () => {
    saveUsers([user]);
    const before = { ...localStorage };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('secret'); });
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    expect(register(input)).toMatchObject({ ok: false, code: 'STORAGE_READ' });
    expect(writes).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(before);
  });

  it.each(['QuotaExceededError', 'SecurityError'])('reports account write %s with no session attempt or persisted changes', (name) => {
    saveUsers([user]); setSession(userSession);
    const before = { ...localStorage };
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('secret', name); });
    const result = register(input);
    expect(result).toMatchObject({ ok: false, code: 'STORAGE_WRITE', accountCreated: false });
    expect(result).not.toHaveProperty('session');
    expect(writes.mock.calls.map(([key]) => key)).toEqual(['writespace_users']);
    expect({ ...localStorage }).toEqual(before);
    expect(getUsers()).toEqual([user]);
    expect(getSession()).toEqual(userSession);
  });

  it.each([null, userSession])('reports saved-account/failed-session partial state with previous session %j', (previousSession) => {
    saveUsers([user]);
    if (previousSession) setSession(previousSession);
    const nativeSet = Storage.prototype.setItem;
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'writespace_session') throw new DOMException('secret', 'QuotaExceededError');
      return nativeSet.call(this, key, value);
    });
    const result = register(input);
    expect(result).toEqual({ ok: false, code: 'STORAGE_WRITE', accountCreated: true, message: 'Your account was created, but you are not signed in. Please log in.' });
    expect(result).not.toHaveProperty('session');
    expect(writes.mock.calls.map(([key]) => key)).toEqual(['writespace_users', 'writespace_session']);
    expect(getUsers()).toEqual([user, { id: uuid, displayName: input.displayName, username: input.username, password: input.password, role: 'user', createdAt: timestamp }]);
    expect(getSession()).toEqual(previousSession);
    writes.mockRestore();
    expect(register(input).code).toBe('DUPLICATE_USERNAME');
    expect(login(input.username, input.password).ok).toBe(true);
    expect(getSession().userId).toBe(uuid);
    expect(getUsers()).toHaveLength(2);
  });

  it('reports unavailable UUID generation without writes or account creation', () => {
    vi.mocked(crypto.randomUUID).mockImplementation(() => { throw new Error('unavailable'); });
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    expect(register(input)).toMatchObject({ ok: false, code: 'STORAGE_WRITE', accountCreated: false });
    expect(writes).not.toHaveBeenCalled();
    expect(getUsers()).toEqual([]);
    expect(getSession()).toBeNull();
  });

  it('reports timestamp generation failure without creating or writing an account', () => {
    vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => { throw new RangeError('invalid time'); });
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    expect(register(input)).toMatchObject({ ok: false, code: 'STORAGE_WRITE', accountCreated: false });
    expect(writes).not.toHaveBeenCalled();
    expect(getUsers()).toEqual([]);
    expect(getSession()).toBeNull();
  });
});

describe('fail-closed role decisions and shared session exports', () => {
  it('routes valid user and Admin identities without storage access', () => {
    const reads = vi.spyOn(Storage.prototype, 'getItem');
    expect(roleHome(userSession)).toBe('/blogs');
    expect(roleHome(adminSession)).toBe('/admin');
    expect(reads).not.toHaveBeenCalled();
  });

  it.each([null, undefined, {}, [], 'admin', { role: 'admin' }, { ...userSession, role: 'Admin' }, { ...userSession, userId: null }, { ...userSession, username: 1 }, { ...userSession, displayName: false }])('denies role and mutation decisions for invalid session %j', (invalid) => {
    expect(roleHome(invalid)).toBe('/login');
    expect(canMutatePost(invalid, post)).toBe(false);
  });

  for (const field of Object.keys(userSession)) {
    it(`fails closed when a session omits ${field}`, () => {
      const invalid = { ...userSession };
      delete invalid[field];
      expect(roleHome(invalid)).toBe('/login');
      expect(canMutatePost(invalid, post)).toBe(false);
    });
  }

  it('allows Admin all valid posts and a user only exact ownership, never case-normalized IDs', () => {
    expect(canMutatePost(adminSession, post)).toBe(true);
    expect(canMutatePost(userSession, post)).toBe(true);
    expect(canMutatePost(userSession, { ...post, authorId: 'another' })).toBe(false);
    expect(canMutatePost(userSession, { ...post, authorId: user.id.toLowerCase() })).toBe(false);
    expect(canMutatePost({ ...userSession, userId: 'another' }, post)).toBe(false);
  });

  it.each([null, undefined, {}, [], 'post'])('denies Admin and user when the post is invalid %j', (invalid) => {
    expect(canMutatePost(adminSession, invalid)).toBe(false);
    expect(canMutatePost(userSession, invalid)).toBe(false);
  });

  for (const field of Object.keys(post)) {
    it(`denies mutations when the post omits or mistypes ${field}`, () => {
      const invalid = { ...post };
      delete invalid[field];
      expect(canMutatePost(adminSession, invalid)).toBe(false);
      expect(canMutatePost(userSession, invalid)).toBe(false);
      expect(canMutatePost(adminSession, { ...post, [field]: 1 })).toBe(false);
    });
  }

  it('re-exports the real session read/write/remove behavior', () => {
    expect(setSession(userSession)).toEqual({ ok: true });
    expect(getSession()).toEqual(userSession);
    expect(clearSession()).toEqual({ ok: true });
    expect(getSession()).toBeNull();
    localStorage.setItem('writespace_session', '{bad');
    expect(getSession()).toBeNull();
    expect(roleHome(getSession())).toBe('/login');
    expect(localStorage.getItem('writespace_session')).toBe('{bad');
  });
});
