/** Verify real account helpers against browser storage, including every fail-closed mutation branch. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUser, defaultAdmin, deleteUser, readUsers, userMutationMessage, validateUserInput } from './users.js';

const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const storedAdmin = { userId: 'owner', username: 'owner', displayName: 'Owner', role: 'admin' };
const input = { displayName: 'New Writer', username: 'new-writer', password: 'demo-only', role: 'user' };
const existing = {
  id: 'legacy', displayName: 'Legacy Writer', username: 'taken', password: 'keep-secret', role: 'user', createdAt: 'legacy date',
};
const uuid = '8c2b9645-2e18-42e4-a165-1ca03fd90816';

/** Persist fixtures before mutation spies so preservation assertions cover all three keys. */
function seed(session = admin) {
  localStorage.setItem('writespace_session', JSON.stringify(session));
  localStorage.setItem('writespace_users', JSON.stringify([existing]));
  localStorage.setItem('writespace_posts', '[{"keep":"untouched"}]');
}

/** Snapshot exact bytes, including corrupt records, without relying on helper fallbacks. */
function bytes() {
  return { ...localStorage };
}

/** Assert explicit failure and preservation of every durable byte and no session switch. */
function expectFailure(result, code, before, write) {
  expect(result).toMatchObject({ ok: false, code });
  expect(bytes()).toEqual(before);
  if (write) expect(write).not.toHaveBeenCalled();
}

beforeEach(() => { seed(); });

describe('account display and validation', () => {
  it('adds built-in Admin exactly once without writing and preserves legacy records', () => {
    localStorage.setItem('writespace_users', JSON.stringify([existing, { ...existing, id: 'admin', username: 'admin', role: 'admin' }]));
    const before = bytes();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(readUsers()).toEqual({ ok: true, users: [defaultAdmin, existing], storedCount: 1 });
    expect(bytes()).toEqual(before);
    expect(write).not.toHaveBeenCalled();
  });

  it('deduplicates either legacy built-in ID or exact reserved username without normalizing other accounts', () => {
    localStorage.setItem('writespace_users', JSON.stringify([
      { ...existing, id: 'admin', username: 'legacy-admin' }, { ...existing, id: 'other', username: 'admin' },
      { ...existing, id: 'case', username: 'Admin', role: 'admin' },
    ]));
    expect(readUsers().users.map((user) => user.username)).toEqual(['admin', 'Admin']);
  });

  it('treats absence as an ordinary empty saved collection', () => {
    localStorage.removeItem('writespace_users');
    expect(readUsers()).toEqual({ ok: true, users: [defaultAdmin], storedCount: 0 });
  });

  it.each(['{broken', '{}', '[{}]', '[null]', JSON.stringify([{ ...existing, role: 'owner' }])])(
    'diagnoses corrupt accounts %s without repair', (raw) => {
      localStorage.setItem('writespace_users', raw);
      const before = bytes();
      expect(readUsers()).toEqual({ ok: false, users: [defaultAdmin], storedCount: 0 });
      expect(bytes()).toEqual(before);
    },
  );

  it('reports denied display reads without attempting a write', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readUsers().ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it.each([null, undefined, [], 'text', 1, true, {}])('rejects non-form or missing fields %j', (value) => {
    expect(validateUserInput(value)).toEqual({
      displayName: 'Display name is required.', username: 'Username is required.', password: 'Password is required.',
      role: 'Choose Admin or user.',
    });
  });

  for (const field of ['displayName', 'username', 'password']) {
    it.each([undefined, null, '', '   ', 1, false, [], {}])(`rejects required/type error for ${field}: %j`, (value) => {
      const before = bytes();
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const result = createUser({ ...input, [field]: value }, admin);
      expectFailure(result, 'VALIDATION', before, write);
      expect(result.fieldErrors[field]).toContain('required');
    });
  }

  it.each([undefined, null, '', 'Admin', 'owner', 1, [], {}])('rejects invalid role %j', (role) => {
    const before = bytes();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const result = createUser({ ...input, role }, admin);
    expectFailure(result, 'VALIDATION', before, write);
    expect(result.fieldErrors.role).toBe('Choose Admin or user.');
  });
});

describe('Admin account creation', () => {
  it.each(['user', 'admin'])('appends a complete UUID/ISO %s account without switching session or altering old records', (role) => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(uuid);
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2025-07-06T12:00:00.000Z');
    const before = bytes();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const result = createUser({ ...input, role }, admin);
    const expected = { ...input, role, id: uuid, createdAt: '2025-07-06T12:00:00.000Z' };
    expect(result).toEqual({ ok: true, value: expected });
    expect(JSON.parse(localStorage.getItem('writespace_users'))).toEqual([existing, expected]);
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][0]).toBe('writespace_users');
    expect(JSON.parse(write.mock.calls[0][1])).toEqual([existing, expected]);
    expect(localStorage.getItem('writespace_session')).toBe(before.writespace_session);
    expect(localStorage.getItem('writespace_posts')).toBe(before.writespace_posts);
  });

  it('accepts a stored Admin session and absent accounts with real generated UUID/ISO', () => {
    seed(storedAdmin);
    localStorage.removeItem('writespace_users');
    const result = createUser(input, storedAdmin);
    expect(result.ok).toBe(true);
    expect(result.value.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
    expect(new Date(result.value.createdAt).toISOString()).toBe(result.value.createdAt);
    expect(JSON.parse(localStorage.getItem('writespace_session'))).toEqual(storedAdmin);
  });

  it('preserves exact whitespace and case; uniqueness does not invent normalization', () => {
    const exact = { ...input, username: ' admin ', displayName: ' Writer ', password: ' demo ', role: 'admin' };
    expect(createUser(exact, admin).value).toMatchObject(exact);
    expect(createUser({ ...input, username: 'Admin' }, admin).ok).toBe(true);
    expect(createUser({ ...input, username: 'Taken' }, admin).ok).toBe(true);
  });

  it.each(['admin', 'taken'])('rejects exact reserved/duplicate username %s without a write', (username) => {
    const before = bytes();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const result = createUser({ ...input, username }, admin);
    expectFailure(result, 'DUPLICATE_USERNAME', before, write);
    expect(result.fieldErrors.username).toBe('Username is already taken.');
  });

  it('checks fresh accounts rather than an earlier rendered list', () => {
    readUsers();
    localStorage.setItem('writespace_users', JSON.stringify([existing, { ...existing, id: 'fresh', username: input.username }]));
    const before = bytes();
    expectFailure(createUser(input, admin), 'DUPLICATE_USERNAME', before);
  });

  it.each([null, undefined, {}, [], { ...admin, role: 'user' }, { ...admin, role: 'owner' }, { role: 'admin' }])(
    'rejects incomplete or non-Admin supplied session %j', (session) => {
      const before = bytes();
      const write = vi.spyOn(Storage.prototype, 'setItem');
      expectFailure(createUser(input, session), 'FORBIDDEN', before, write);
    },
  );

  it.each([null, { ...admin, userId: 'changed' }, { ...admin, username: 'changed' },
    { ...admin, displayName: 'changed' }, { ...admin, role: 'user' }])('rejects stale Admin identity %j', (current) => {
    if (current) localStorage.setItem('writespace_session', JSON.stringify(current));
    else localStorage.removeItem('writespace_session');
    const before = bytes();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expectFailure(createUser(input, admin), 'FORBIDDEN', before, write);
  });

  for (const key of ['writespace_users', 'writespace_session']) {
    it.each(['{broken', '{}', '[null]'])(`fails closed on malformed/shape ${key}: %s`, (raw) => {
      localStorage.setItem(key, raw);
      const before = bytes();
      const write = vi.spyOn(Storage.prototype, 'setItem');
      expectFailure(createUser(input, admin), 'STORAGE_READ', before, write);
    });

    it(`fails closed on denied ${key} read`, () => {
      const before = bytes();
      const original = Storage.prototype.getItem;
      const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(name) {
        if (name === key) throw new Error('denied');
        return original.call(this, name);
      });
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const result = createUser(input, admin);
      read.mockRestore();
      expectFailure(result, 'STORAGE_READ', before, write);
    });
  }

  it.each(['uuid', 'date', 'shape', 'write'])('preserves all records on generation/shape/storage failure: %s', (failure) => {
    const before = bytes();
    if (failure === 'uuid') vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('unavailable'); });
    if (failure === 'date') vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => { throw new Error('unavailable'); });
    if (failure === 'shape') vi.spyOn(crypto, 'randomUUID').mockReturnValue(42);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    if (failure === 'write') write.mockImplementation(() => { throw new Error('quota'); });
    expectFailure(createUser(input, admin), 'STORAGE_WRITE', before, failure === 'write' ? undefined : write);
    if (failure === 'write') expect(write).toHaveBeenCalledOnce();
  });
});

describe('account deletion remains non-mutating in every branch', () => {
  it.each([false, undefined, null, 1, 'true'])('returns CANCELLED for confirmation %j without any storage access', (confirmed) => {
    const before = bytes();
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expectFailure(deleteUser('legacy', admin, confirmed), 'CANCELLED', before, write);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ['admin', admin], ['owner', storedAdmin], ['legacy', null], ['legacy', {}], ['legacy', { ...admin, role: 'user' }],
    ['legacy', { ...admin, role: 'owner' }], ['', admin], [null, admin], [42, admin], [undefined, admin],
  ])('returns FORBIDDEN for protected/invalid account %j and session %j', (id, session) => {
    const before = bytes();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const clear = vi.spyOn(Storage.prototype, 'clear');
    expectFailure(deleteUser(id, session, true), 'FORBIDDEN', before, write);
    expect(remove).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it.each(['legacy', 'missing'])('returns POLICY_PENDING for %s even when confirmed; never accesses storage', (id) => {
    const before = bytes();
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    expectFailure(deleteUser(id, admin, true), 'POLICY_PENDING', before, write);
    expect(read).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(['FORBIDDEN', 'STORAGE_READ', 'STORAGE_WRITE', 'VALIDATION', 'DUPLICATE_USERNAME', 'POLICY_PENDING', 'unknown'])(
    'exposes safe feedback for %s', (code) => { expect(userMutationMessage(code)).toBeTruthy(); },
  );
  it('keeps cancellation silent', () => { expect(userMutationMessage('CANCELLED')).toBe(''); });
});
