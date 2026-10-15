/** Verify guarded three-key storage, complete shapes, and non-destructive failures. */
import { describe, expect, it, vi } from 'vitest';
import { clearSession, getPosts, getSession, getUsers, isValidPost, isValidSession, savePosts, saveUsers, setSession } from './storage.js';

const post = { id: 'Legacy-ID', title: 'Title', content: '<b>Plain text</b>', createdAt: 'legacy-date', authorId: 'Writer-ID', authorName: 'Writer' };
const user = { id: 'Writer-ID', displayName: 'Writer', username: 'Writer', password: 'demo-only', role: 'user', createdAt: 'legacy-date' };
const session = { userId: 'Writer-ID', username: 'Writer', displayName: 'Writer', role: 'user' };
const collections = [
  { name: 'posts', key: 'writespace_posts', get: getPosts, save: savePosts, record: post },
  { name: 'users', key: 'writespace_users', get: getUsers, save: saveUsers, record: user },
];
const stores = [...collections, { name: 'session', key: 'writespace_session', get: getSession, save: setSession, record: session }];

/**
 * Build a same-shaped record with one required field removed.
 * @param {object} record - Valid fixture.
 * @param {string} field - Required field to omit.
 * @returns {object} Incomplete fixture.
 */
function omit(record, field) {
  const copy = { ...record };
  delete copy[field];
  return copy;
}

for (const store of stores) {
  describe(store.name, () => {
    const wrap = (record) => store.name === 'session' ? record : [record];
    const fallback = store.name === 'session' ? null : [];

    it('treats absence as ordinary empty data without diagnostics or writes', () => {
      const callback = vi.fn();
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const remove = vi.spyOn(Storage.prototype, 'removeItem');
      expect(store.get(callback)).toEqual(fallback);
      expect(callback).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('saves and re-reads complete records preserving exact IDs and extra fields', () => {
      const value = wrap({ ...store.record, extra: 'retained' });
      expect(store.save(value)).toEqual({ ok: true });
      expect(JSON.parse(localStorage.getItem(store.key))).toEqual(value);
      expect(store.get()).toEqual(value);
      const next = wrap({ ...store.record, displayName: 'changed' });
      localStorage.setItem(store.key, JSON.stringify(next));
      expect(store.get()).toEqual(next);
    });

    it.each(['{broken secret-password', '', 'undefined'])('returns safe fallback and sanitized PARSE error for %j', (raw) => {
      localStorage.setItem(store.key, raw);
      const callback = vi.fn();
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const remove = vi.spyOn(Storage.prototype, 'removeItem');
      expect(store.get(callback)).toEqual(fallback);
      expect(callback.mock.calls).toEqual([[{ operation: 'read', reason: 'PARSE' }]]);
      expect(store.get()).toEqual(fallback);
      expect(localStorage.getItem(store.key)).toBe(raw);
      expect(write).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it.each([null, true, 42, 'secret', {}, store.name === 'session' ? [] : store.record])('rejects top-level wrong shape %j', (value) => {
      const raw = JSON.stringify(value);
      localStorage.setItem(store.key, raw);
      const callback = vi.fn();
      expect(store.get(callback)).toEqual(fallback);
      expect(callback.mock.calls).toEqual([[{ operation: 'read', reason: 'SHAPE' }]]);
      expect(localStorage.getItem(store.key)).toBe(raw);
    });

    for (const field of Object.keys(store.record)) {
      it(`rejects missing ${field} on reads and writes`, () => {
        const value = wrap(omit(store.record, field));
        const raw = JSON.stringify(value);
        localStorage.setItem(store.key, raw);
        const callback = vi.fn();
        const write = vi.spyOn(Storage.prototype, 'setItem');
        expect(store.get(callback)).toEqual(fallback);
        expect(callback.mock.calls).toEqual([[{ operation: 'read', reason: 'SHAPE' }]]);
        expect(store.save(value)).toEqual({ ok: false, error: { operation: 'write', reason: 'SHAPE' } });
        expect(write).not.toHaveBeenCalled();
        expect(localStorage.getItem(store.key)).toBe(raw);
      });

      it.each([null, undefined, 1, false, {}, []])(`rejects non-string ${field} = %j`, (invalid) => {
        const value = wrap({ ...store.record, [field]: invalid });
        localStorage.setItem(store.key, JSON.stringify(value));
        const callback = vi.fn();
        expect(store.get(callback)).toEqual(fallback);
        expect(callback.mock.calls).toEqual([[{ operation: 'read', reason: 'SHAPE' }]]);
        const write = vi.spyOn(Storage.prototype, 'setItem');
        expect(store.save(value)).toEqual({ ok: false, error: { operation: 'write', reason: 'SHAPE' } });
        expect(write).not.toHaveBeenCalled();
      });
    }

    it('guards getItem failures and reveals no raw exception', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('secret-password'); });
      const callback = vi.fn();
      expect(store.get(callback)).toEqual(fallback);
      expect(callback.mock.calls).toEqual([[{ operation: 'read', reason: 'ACCESS' }]]);
      expect(store.get()).toEqual(fallback);
    });

    it('guards access to the localStorage property itself', () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Denied secret'); });
      const callback = vi.fn();
      expect(store.get(callback)).toEqual(fallback);
      expect(callback.mock.calls).toEqual([[{ operation: 'read', reason: 'ACCESS' }]]);
      expect(store.save(wrap(store.record))).toEqual({ ok: false, error: { operation: 'write', reason: 'ACCESS' } });
    });

    it.each(['QuotaExceededError', 'SecurityError'])('reports %s writes and preserves the prior snapshot', (name) => {
      const original = JSON.stringify(wrap(store.record));
      localStorage.setItem(store.key, original);
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('secret', name); });
      expect(store.save(wrap(store.record))).toEqual({ ok: false, error: { operation: 'write', reason: 'ACCESS' } });
      expect(localStorage.getItem(store.key)).toBe(original);
    });

    it('reports cyclic serialization without calling setItem', () => {
      const record = { ...store.record };
      record.extra = record;
      const write = vi.spyOn(Storage.prototype, 'setItem');
      expect(store.save(wrap(record))).toEqual({ ok: false, error: { operation: 'write', reason: 'SERIALIZE' } });
      expect(write).not.toHaveBeenCalled();
    });

    it('reports a throwing field getter as invalid write input', () => {
      const record = { ...store.record };
      Object.defineProperty(record, Object.keys(store.record)[0], { get() { throw new Error('secret'); } });
      expect(store.save(wrap(record))).toEqual({ ok: false, error: { operation: 'write', reason: 'SHAPE' } });
    });

    it('reports throwing serialization without disclosing its exception', () => {
      const value = wrap({ ...store.record, toJSON() { throw new Error('secret'); } });
      expect(store.save(value)).toEqual({ ok: false, error: { operation: 'write', reason: 'SERIALIZE' } });
    });

    it('keeps fallback safe when the diagnostic callback throws or is not a function', () => {
      localStorage.setItem(store.key, 'bad');
      expect(store.get(() => { throw new Error('UI warning failed'); })).toEqual(fallback);
      expect(store.get('not a callback')).toEqual(fallback);
    });
  });
}

for (const collection of collections) {
  describe(`${collection.name} collection integrity`, () => {
    it('supports an explicitly saved empty collection', () => {
      expect(collection.save([])).toEqual({ ok: true });
      const callback = vi.fn();
      expect(collection.get(callback)).toEqual([]);
      expect(callback).not.toHaveBeenCalled();
      expect(localStorage.getItem(collection.key)).toBe('[]');
    });

    it.each([null, 7, 'bad', {}, []])('rejects the whole mixed array when one member is %j', (invalid) => {
      const raw = JSON.stringify([collection.record, invalid, collection.record]);
      localStorage.setItem(collection.key, raw);
      const callback = vi.fn();
      expect(collection.get(callback)).toEqual([]);
      expect(callback.mock.calls).toEqual([[{ operation: 'read', reason: 'SHAPE' }]]);
      expect(collection.save([collection.record, invalid])).toEqual({ ok: false, error: { operation: 'write', reason: 'SHAPE' } });
      expect(localStorage.getItem(collection.key)).toBe(raw);
    });

    it.each([null, undefined, {}, '[]', 1, true])('rejects non-array write input %j', (value) => {
      expect(collection.save(value)).toEqual({ ok: false, error: { operation: 'write', reason: 'SHAPE' } });
      expect(localStorage.getItem(collection.key)).toBeNull();
    });

    it('rejects sparse array slots rather than serializing invalid null records', () => {
      expect(collection.save(new Array(1))).toEqual({ ok: false, error: { operation: 'write', reason: 'SHAPE' } });
    });
  });
}

describe('role validation and exact key boundary', () => {
  it.each(['Admin', 'USER', '', 'owner'])('rejects unknown role %j on both accounts and session', (role) => {
    const callback = vi.fn();
    localStorage.setItem('writespace_users', JSON.stringify([{ ...user, role }]));
    localStorage.setItem('writespace_session', JSON.stringify({ ...session, role }));
    expect(getUsers(callback)).toEqual([]);
    expect(getSession(callback)).toBeNull();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(saveUsers([{ ...user, role }]).ok).toBe(false);
    expect(setSession({ ...session, role }).ok).toBe(false);
  });

  it('accepts recognized Admin role without rewriting its stored ID', () => {
    expect(saveUsers([{ ...user, role: 'admin' }])).toEqual({ ok: true });
    expect(setSession({ ...session, role: 'admin' })).toEqual({ ok: true });
    expect(getUsers()[0].id).toBe('Writer-ID');
    expect(getSession().userId).toBe('Writer-ID');
  });

  it.each([null, undefined, [], {}, true])('validators reject incomplete or non-record %j', (value) => {
    expect(isValidPost(value)).toBe(false);
    expect(isValidSession(value)).toBe(false);
  });

  it('accepts minimum string types without imposing UUID/date normalization', () => {
    expect(isValidPost(post)).toBe(true);
    expect(isValidSession(session)).toBe(true);
    expect(isValidPost(Object.fromEntries(Object.keys(post).map((field) => [field, ''])))).toBe(true);
  });

  it.each([null, undefined, [], {}, false, 1, 'session'])('rejects invalid setSession input %j', (value) => {
    expect(setSession(value)).toEqual({ ok: false, error: { operation: 'write', reason: 'SHAPE' } });
    expect(getSession()).toBeNull();
  });

  it('accesses exactly the three permitted keys and never uses clear', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const clear = vi.spyOn(Storage.prototype, 'clear');
    savePosts([post]); saveUsers([user]); setSession(session);
    getPosts(); getUsers(); getSession(); clearSession();
    expect(get.mock.calls.map(([key]) => key)).toEqual(['writespace_posts', 'writespace_users', 'writespace_session']);
    expect(set.mock.calls.map(([key]) => key)).toEqual(['writespace_posts', 'writespace_users', 'writespace_session']);
    expect(remove.mock.calls).toEqual([['writespace_session']]);
    expect(clear).not.toHaveBeenCalled();
  });
});

describe('explicit durable logout', () => {
  it('removes only the session, preserves both collections, and tolerates absence', () => {
    savePosts([post]); saveUsers([user]); setSession(session);
    expect(clearSession()).toEqual({ ok: true });
    expect(getSession()).toBeNull();
    expect(getPosts()).toEqual([post]);
    expect(getUsers()).toEqual([user]);
    expect(clearSession()).toEqual({ ok: true });
  });

  it('reports removeItem failure and keeps the readable persisted session', () => {
    setSession(session);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('secret'); });
    expect(clearSession()).toEqual({ ok: false, error: { operation: 'remove', reason: 'ACCESS' } });
    expect(getSession()).toEqual(session);
  });

  it('guards localStorage property denial during removal', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('secret'); });
    expect(clearSession()).toEqual({ ok: false, error: { operation: 'remove', reason: 'ACCESS' } });
  });
});
