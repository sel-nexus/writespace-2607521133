/** Exercise every post mutation outcome against the real guarded browser storage helpers. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPost, deletePost, formatPostDate, mutationMessage, postExcerpt, readPosts,
  sortPostsNewest, updatePost, validatePostInput,
} from './posts.js';

const writer = { userId: 'writer', username: 'writer', displayName: 'Writer', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const input = { title: '  Exact title  ', content: 'First line\nSecond line  ' };
const original = {
  id: 'post', title: 'Original', content: 'Original body', createdAt: '2025-04-03T00:00:00.000Z',
  authorId: 'writer', authorName: 'Original Author',
};
const other = { ...original, id: 'other', authorId: 'someone-else' };
const mutations = [
  ['create', (values = input, session = writer) => createPost(values, session)],
  ['update', (values = input, session = writer) => updatePost('post', values, session)],
  ['delete', (_values = input, session = writer) => deletePost('post', session, true)],
];

/** Seed complete records before spies so no-write assertions cover only the operation. */
function seed(session = writer, posts = [original, other]) {
  localStorage.setItem('writespace_session', JSON.stringify(session));
  localStorage.setItem('writespace_posts', JSON.stringify(posts));
}

/** Inspect persisted state rather than a mocked save response. */
function storedPosts() {
  return JSON.parse(localStorage.getItem('writespace_posts'));
}

beforeEach(() => { seed(); });
afterEach(() => { vi.useRealTimers(); });

 describe('post validation and fresh reads', () => {
  it.each([undefined, null, false, 12, 'text', [], {}])('rejects a non-input or missing fields: %j', (value) => {
    const fieldErrors = { title: 'Title is required.', content: 'Content is required.' };
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(validatePostInput(value)).toEqual(fieldErrors);
    expect(createPost(value, writer)).toEqual({ ok: false, code: 'VALIDATION', fieldErrors });
    expect(updatePost('post', value, writer)).toEqual({ ok: false, code: 'VALIDATION', fieldErrors });
    expect(storedPosts()).toEqual([original, other]);
    expect(write).not.toHaveBeenCalled();
  });

  for (const field of ['title', 'content']) {
    it.each([undefined, null, false, 0, {}, [], '', ' \n\t '])(`rejects invalid ${field} type or whitespace: %j`, (value) => {
      expect(validatePostInput({ ...input, [field]: value })).toEqual({ [field]: `${field === 'title' ? 'Title' : 'Content'} is required.` });
      for (const operation of [createPost, (values, session) => updatePost('post', values, session)]) {
        const write = vi.spyOn(Storage.prototype, 'setItem');
        const before = localStorage.getItem('writespace_posts');
        expect(operation({ ...input, [field]: value }, writer)).toEqual({
          ok: false, code: 'VALIDATION', fieldErrors: { [field]: `${field === 'title' ? 'Title' : 'Content'} is required.` },
        });
        expect(write).not.toHaveBeenCalled();
        expect(localStorage.getItem('writespace_posts')).toBe(before);
      }
    });
  }

  it('accepts exact non-whitespace values and ignores extra author/identity input', () => {
    expect(validatePostInput(input)).toEqual({});
    expect(createPost({ ...input, authorId: 'forged', id: 'forged' }, writer).value).toMatchObject({
      title: input.title, content: input.content, authorId: writer.userId,
    });
  });

  it('distinguishes ordinary absence from corruption without writing', () => {
    localStorage.removeItem('writespace_posts');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(readPosts()).toEqual({ ok: true, posts: [] });
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['{broken', '{}', 'null', '[{}]'])('diagnoses unreadable posts %s and never repairs them', (raw) => {
    localStorage.setItem('writespace_posts', raw);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    expect(readPosts()).toEqual({ ok: false, code: 'STORAGE_READ', posts: [] });
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

 describe.each(mutations)('%s mutation trust boundaries', (_name, mutate) => {
  it.each([null, {}, false, 42, [], { ...writer, role: 'owner' }, { userId: 'writer', role: 'user' }])(
    'rejects invalid supplied session %j', (session) => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(mutate(input, session)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(storedPosts()).toEqual([original, other]);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['userId', 'username', 'displayName', 'role'])('rejects a stale supplied session after stored %s changes', (field) => {
    seed({ ...writer, [field]: field === 'role' ? 'admin' : 'changed' });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(mutate()).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(write).not.toHaveBeenCalled();
    expect(storedPosts()).toEqual([original, other]);
  });

  it('rejects removed current session instead of trusting the UI snapshot', () => {
    localStorage.removeItem('writespace_session');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(mutate()).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['{broken', '{}', 'null', JSON.stringify({ ...writer, role: 'owner' })])('returns STORAGE_READ for corrupt session %s', (raw) => {
    localStorage.setItem('writespace_session', raw);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(mutate()).toEqual({ ok: false, code: 'STORAGE_READ' });
    expect(localStorage.getItem('writespace_session')).toBe(raw);
    expect(storedPosts()).toEqual([original, other]);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['{broken', '{}', 'null', '[{}]'])('returns STORAGE_READ without overwriting corrupt posts %s', (raw) => {
    localStorage.setItem('writespace_posts', raw);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    expect(mutate()).toEqual({ ok: false, code: 'STORAGE_READ' });
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(['writespace_session', 'writespace_posts'])('fails closed when %s read access is denied', (key) => {
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(name) {
      if (name === key) throw new DOMException('Denied', 'SecurityError');
      return read.call(this, name);
    });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(mutate()).toEqual({ ok: false, code: 'STORAGE_READ' });
    expect(write).not.toHaveBeenCalled();
    expect(read.call(localStorage, 'writespace_posts')).toBe(JSON.stringify([original, other]));
  });

  it.each(['QuotaExceededError', 'SecurityError'])('returns STORAGE_WRITE and preserves old storage on %s', (errorName) => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('No capacity', errorName); });
    expect(mutate()).toEqual({ ok: false, code: 'STORAGE_WRITE' });
    expect(storedPosts()).toEqual([original, other]);
  });
});

/** Build a repeatable stress collection, not a supported-size limit or timing gate. */
function stressPosts() {
  return Array.from({ length: 500 }, (_, index) => ({
    ...original, id: index === 250 ? 'post' : `stress-${index}`,
    title: `Story ${index}`, content: `Body ${index}\n  Original spacing  `,
    createdAt: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
  }));
}

const longInput = {
  title: `  ${'Long title — '.repeat(1024)}  `,
  content: `\n  ${'Long body with Ω and line breaks\n'.repeat(4096)}  \n`,
};

 describe('large post inputs and collections', () => {
  it('accepts long title/body on create and update without trimming or truncating persisted text', () => {
    expect(validatePostInput(longInput)).toEqual({});
    const created = createPost(longInput, writer);
    expect(created).toEqual({ ok: true, value: {
      id: expect.any(String), createdAt: expect.any(String),
      authorId: writer.userId, authorName: writer.displayName, ...longInput,
    } });
    expect(readPosts()).toEqual({ ok: true, posts: [original, other, created.value] });
    const replacement = { ...original, ...longInput };
    expect(updatePost('post', longInput, writer)).toEqual({ ok: true, value: replacement });
    expect(storedPosts()).toEqual([replacement, other, created.value]);
    expect(postExcerpt(replacement.content)).toBe(longInput.content.slice(0, 120));
  });

  it('preserves all records and metadata across create, update and immutable newest-first sorting of 500 seeded posts', () => {
    const records = stressPosts();
    const originalRecords = JSON.parse(JSON.stringify(records));
    seed(writer, records);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000500');
    const created = {
      id: '00000000-0000-4000-8000-000000000500', createdAt: '2026-01-02T03:04:05.000Z',
      authorId: writer.userId, authorName: writer.displayName, ...longInput,
    };
    expect(createPost(longInput, writer)).toEqual({ ok: true, value: created });
    expect(storedPosts()).toEqual([...originalRecords, created]);
    const revisedInput = { title: `${longInput.title}Revised`, content: `${longInput.content}Final line\n` };
    const replacement = { ...originalRecords[250], ...revisedInput };
    expect(updatePost('post', revisedInput, writer)).toEqual({ ok: true, value: replacement });
    const expected = originalRecords.map((record) => record.id === 'post' ? replacement : record);
    expected.push(created);
    expect(readPosts()).toEqual({ ok: true, posts: expected });
    const snapshot = readPosts().posts;
    const durable = localStorage.getItem('writespace_posts');
    const sorted = sortPostsNewest(snapshot);
    expect(sorted).toEqual([created, ...expected.slice(0, 500).reverse()]);
    expect(sorted).not.toBe(snapshot);
    expect(snapshot).toEqual(expected);
    expect(records).toEqual(originalRecords);
    expect(localStorage.getItem('writespace_posts')).toBe(durable);
  });

  it.each(mutations)('preserves the complete 500-record durable state when %s is quota denied', (_name, mutate) => {
    const records = stressPosts();
    seed(writer, records);
    const durable = localStorage.getItem('writespace_posts');
    const session = localStorage.getItem('writespace_session');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('No capacity', 'QuotaExceededError');
    });
    expect(mutate(longInput, writer)).toEqual({ ok: false, code: 'STORAGE_WRITE' });
    expect(localStorage.getItem('writespace_posts')).toBe(durable);
    expect(localStorage.getItem('writespace_session')).toBe(session);
    expect(readPosts()).toEqual({ ok: true, posts: records });
    expect(sortPostsNewest(readPosts().posts)).toEqual([...records].reverse());
    expect(localStorage.getItem('writespace_posts')).toBe(durable);
  });
});

 describe('createPost', () => {
  it.each([writer, admin])('creates a complete UUID/ISO post from the current identity %j and appends once', (session) => {
    seed(session);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const result = createPost(input, session);
    const created = {
      id: '00000000-0000-4000-8000-000000000001', title: input.title, content: input.content,
      createdAt: '2026-01-02T03:04:05.000Z', authorId: session.userId, authorName: session.displayName,
    };
    expect(result).toEqual({ ok: true, value: created });
    expect(storedPosts()).toEqual([original, other, created]);
    expect(write).toHaveBeenCalledExactlyOnceWith('writespace_posts', JSON.stringify([original, other, created]));
    expect(Object.keys(localStorage).sort()).toEqual(['writespace_posts', 'writespace_session']);
  });

  it('creates when posts are absent without replacing any other key', () => {
    localStorage.removeItem('writespace_posts');
    localStorage.setItem('writespace_users', 'keep');
    expect(createPost(input, writer).ok).toBe(true);
    expect(storedPosts()).toHaveLength(1);
    expect(localStorage.getItem('writespace_users')).toBe('keep');
  });

  it('uses a fresh collection, preserving posts added since a prior read', () => {
    readPosts();
    seed(writer, [other]);
    const result = createPost(input, writer);
    expect(storedPosts()).toEqual([other, result.value]);
  });

  it('returns explicit failure when UUID generation is unavailable, without writing', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('Unavailable'); });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(createPost(input, writer)).toEqual({ ok: false, code: 'STORAGE_WRITE' });
    expect(storedPosts()).toEqual([original, other]);
    expect(write).not.toHaveBeenCalled();
  });
});

 describe.each([
  ['update', (id, session = writer) => updatePost(id, input, session)],
  ['delete', (id, session = writer) => deletePost(id, session, true)],
])('%s target and permission repeat', (name, mutate) => {
  it.each([undefined, null, 1, {}, [], '', 'missing'])('rejects missing or invalid target %j without writes', (id) => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(mutate(id)).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(write).not.toHaveBeenCalled();
    expect(storedPosts()).toEqual([original, other]);
  });

  it('does not match a different-case ID or an absent collection', () => {
    expect(mutate('POST')).toEqual({ ok: false, code: 'NOT_FOUND' });
    localStorage.removeItem('writespace_posts');
    expect(mutate('post')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(localStorage.getItem('writespace_posts')).toBeNull();
  });

  it('rejects a regular nonowner even with complete valid identity', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(mutate('other')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(write).not.toHaveBeenCalled();
    expect(storedPosts()).toEqual([original, other]);
  });

  it('rechecks ownership against a newly changed target, not the previously rendered record', () => {
    readPosts();
    const changed = { ...original, authorId: 'new-owner' };
    seed(writer, [changed, other]);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(mutate('post')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(storedPosts()).toEqual([changed, other]);
    expect(write).not.toHaveBeenCalled();
  });

  it('rechecks target existence after a prior snapshot', () => {
    readPosts();
    seed(writer, [other]);
    expect(mutate('post')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(storedPosts()).toEqual([other]);
  });

  it.each([writer, admin])('allows the owner or Admin and preserves unaffected records for %j', (session) => {
    seed(session);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const result = mutate('post', session);
    if (name === 'update') {
      const replacement = { ...original, title: input.title, content: input.content };
      expect(result).toEqual({ ok: true, value: replacement });
      expect(storedPosts()).toEqual([replacement, other]);
    } else {
      expect(result).toEqual({ ok: true });
      expect(storedPosts()).toEqual([other]);
    }
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe('writespace_posts');
  });

  it('allows Admin to mutate another author without reassigning authorship on edits', () => {
    seed(admin);
    const result = mutate('other', admin);
    expect(result.ok).toBe(true);
    expect(storedPosts()[0]).toEqual(original);
    if (name === 'update') expect(storedPosts()[1]).toEqual({ ...other, title: input.title, content: input.content });
    else expect(storedPosts()).toEqual([original]);
  });
});

 describe('delete confirmation', () => {
  it.each([false, undefined, null, 0, 1, 'true', {}])('cancels without reads or writes unless confirmed is literal true: %j', (confirmed) => {
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(deletePost('post', writer, confirmed)).toEqual({ ok: false, code: 'CANCELLED' });
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(storedPosts()).toEqual([original, other]);
  });
});

 describe('post formatting', () => {
  it('sorts an immutable copy newest-first, equal dates stably and invalid dates last even before epoch', () => {
    const records = [
      { ...original, id: 'bad-1', createdAt: 'bad' },
      { ...original, id: 'old', createdAt: '1965-01-01' },
      { ...original, id: 'new' }, { ...original, id: 'equal' },
      { ...original, id: 'bad-2', createdAt: 'also bad' },
    ];
    const before = [...records];
    expect(sortPostsNewest(records).map((post) => post.id)).toEqual(['new', 'equal', 'old', 'bad-1', 'bad-2']);
    expect(records).toEqual(before);
    expect(sortPostsNewest([])).toEqual([]);
  });

  it.each([['2025-04-03T23:59:00-07:00', 'Apr 04, 2025'], ['bad', 'Date unavailable'], ['', 'Date unavailable']])(
    'formats %s safely as %s', (value, expected) => { expect(formatPostDate(value)).toBe(expected); },
  );

  it.each(['', 'Short\ntext', 'x'.repeat(120), `${'x'.repeat(120)}tail`])('takes exactly the first 120 characters: %s', (content) => {
    expect(postExcerpt(content)).toBe(content.slice(0, 120));
    expect(postExcerpt(content).length).toBe(Math.min(content.length, 120));
  });

  it.each(['NOT_FOUND', 'FORBIDDEN', 'VALIDATION', 'STORAGE_READ', 'STORAGE_WRITE', 'unknown'])('maps %s to visible safe feedback', (code) => {
    expect(mutationMessage(code)).toBeTruthy();
  });
  it('keeps cancellation silent and not-found exact', () => {
    expect(mutationMessage('CANCELLED')).toBe('');
    expect(mutationMessage('NOT_FOUND')).toBe('Post not found');
  });
});
