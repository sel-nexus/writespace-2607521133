/** Manage plain-text posts with fresh, diagnostic-aware reads and fail-closed permissions. */
import { getPosts, getSession, isValidSession, savePosts } from './storage.js';
import { canMutatePost } from './auth.js';

/** @typedef {import('./storage.js').Post} Post */
/** @typedef {import('./storage.js').Session} Session */
/** @typedef {{title:string, content:string}} PostInput */
/** @typedef {'NOT_FOUND'|'FORBIDDEN'|'VALIDATION'|'CANCELLED'|'STORAGE_READ'|'STORAGE_WRITE'} MutationCode */
/** @typedef {{ok:true, value?:Post}|{ok:false, code:MutationCode, fieldErrors?:Object<string,string>}} MutationResult */

/**
 * Read posts without mistaking a corrupt fallback for an empty collection.
 * @returns {{ok:true, posts:Post[]}|{ok:false, posts:Post[], code:'STORAGE_READ'}} Fresh snapshot and diagnostics.
 */
export function readPosts() {
  let failed = false;
  const posts = getPosts(() => { failed = true; });
  return failed ? { ok: false, posts, code: 'STORAGE_READ' } : { ok: true, posts };
}

/**
 * Check required string fields without trimming the saved values.
 * @param {unknown} input - Untrusted form object.
 * @returns {Object<string,string>} Field errors, empty when valid.
 */
export function validatePostInput(input) {
  const values = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  for (const [field, label] of [['title', 'Title'], ['content', 'Content']]) {
    if (typeof values[field] !== 'string' || !values[field].trim()) errors[field] = `${label} is required.`;
  }
  return errors;
}

/**
 * Reject invalid, removed or changed sessions at operation time.
 * @param {Session|null} session - Session supplied by the activated UI.
 * @returns {{ok:true, session:Session}|{ok:false, code:'FORBIDDEN'|'STORAGE_READ'}} Current matching identity only.
 */
function currentIdentity(session) {
  if (!isValidSession(session)) return { ok: false, code: 'FORBIDDEN' };
  let failed = false;
  const current = getSession(() => { failed = true; });
  if (failed) return { ok: false, code: 'STORAGE_READ' };
  if (!isValidSession(current)
    || ['userId', 'username', 'displayName', 'role'].some((field) => current[field] !== session[field])) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  return { ok: true, session: current };
}

/**
 * Append a UUID/ISO post authored by the current session, never by input metadata.
 * @param {PostInput} input - Required exact title and content.
 * @param {Session|null} session - Valid, currently persisted identity.
 * @returns {MutationResult} Saved post or explicit failure; never navigates or repairs data.
 */
export function createPost(input, session) {
  const fieldErrors = validatePostInput(input);
  if (Object.keys(fieldErrors).length) return { ok: false, code: 'VALIDATION', fieldErrors };
  const identity = currentIdentity(session);
  if (!identity.ok) return identity;
  const snapshot = readPosts();
  if (!snapshot.ok) return { ok: false, code: 'STORAGE_READ' };
  let post;
  try {
    post = {
      id: crypto.randomUUID(), title: input.title, content: input.content, createdAt: new Date().toISOString(),
      authorId: identity.session.userId, authorName: identity.session.displayName,
    };
  } catch {
    return { ok: false, code: 'STORAGE_WRITE' };
  }
  if (!savePosts([...snapshot.posts, post]).ok) return { ok: false, code: 'STORAGE_WRITE' };
  return { ok: true, value: post };
}

/**
 * Replace only title/content after repeating target and ownership checks on fresh storage.
 * @param {string} postId - Exact existing ID.
 * @param {PostInput} input - Required exact strings.
 * @param {Session|null} session - Current matching identity.
 * @returns {MutationResult} Saved replacement retaining ID, author and creation timestamp.
 */
export function updatePost(postId, input, session) {
  const fieldErrors = validatePostInput(input);
  if (Object.keys(fieldErrors).length) return { ok: false, code: 'VALIDATION', fieldErrors };
  if (typeof postId !== 'string' || !postId) return { ok: false, code: 'NOT_FOUND' };
  const identity = currentIdentity(session);
  if (!identity.ok) return identity;
  const snapshot = readPosts();
  if (!snapshot.ok) return { ok: false, code: 'STORAGE_READ' };
  const target = snapshot.posts.find((post) => post.id === postId);
  if (!target) return { ok: false, code: 'NOT_FOUND' };
  if (!canMutatePost(identity.session, target)) return { ok: false, code: 'FORBIDDEN' };
  const replacement = { ...target, title: input.title, content: input.content };
  const posts = snapshot.posts.map((post) => post.id === postId ? replacement : post);
  if (!savePosts(posts).ok) return { ok: false, code: 'STORAGE_WRITE' };
  return { ok: true, value: replacement };
}

/**
 * Delete only after explicit confirmation, then re-read identity, target and ownership.
 * @param {string} postId - Exact target ID.
 * @param {Session|null} session - Current matching identity.
 * @param {boolean} confirmed - Only literal true authorizes a write; cancellation does not even read.
 * @returns {MutationResult} Success without value or explicit failure; cancelled operations never write.
 */
export function deletePost(postId, session, confirmed) {
  if (confirmed !== true) return { ok: false, code: 'CANCELLED' };
  if (typeof postId !== 'string' || !postId) return { ok: false, code: 'NOT_FOUND' };
  const identity = currentIdentity(session);
  if (!identity.ok) return identity;
  const snapshot = readPosts();
  if (!snapshot.ok) return { ok: false, code: 'STORAGE_READ' };
  const target = snapshot.posts.find((post) => post.id === postId);
  if (!target) return { ok: false, code: 'NOT_FOUND' };
  if (!canMutatePost(identity.session, target)) return { ok: false, code: 'FORBIDDEN' };
  if (!savePosts(snapshot.posts.filter((post) => post.id !== postId)).ok) return { ok: false, code: 'STORAGE_WRITE' };
  return { ok: true };
}

/**
 * Convert invalid legacy dates to the oldest sort value.
 * @param {string} value - Stored creation date.
 * @returns {number} Timestamp or negative infinity, never a fabricated date.
 */
function dateValue(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

/**
 * Sort newest first without mutating the supplied collection; invalid dates sort last stably.
 * @param {Post[]} posts - Valid storage records.
 * @returns {Post[]} Ordered copy.
 */
export function sortPostsNewest(posts) {
  return [...posts].sort((a, b) => {
    const left = dateValue(a.createdAt);
    const right = dateValue(b.createdAt);
    return left === right ? 0 : left > right ? -1 : 1;
  });
}

/**
 * Format a stored date as MMM DD, YYYY in UTC, safely handling legacy invalid dates.
 * @param {string} value - Creation date string.
 * @returns {string} Readable date or Date unavailable.
 */
export function formatPostDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

/**
 * Take exactly the first 120 content characters without ellipsis or normalization.
 * @param {string} content - Stored plain text.
 * @returns {string} Exact prefix.
 */
export function postExcerpt(content) {
  return content.slice(0, 120);
}

/**
 * Map local failure codes to safe feedback, with silent cancellation.
 * @param {MutationCode} code - Explicit mutation result code.
 * @returns {string} Human-readable feedback without stored data or exception text.
 */
export function mutationMessage(code) {
  const messages = {
    NOT_FOUND: 'Post not found', FORBIDDEN: 'You no longer have permission to change this post.',
    VALIDATION: 'Please check the required fields.', CANCELLED: '',
    STORAGE_READ: 'Could not read saved posts or session. Your stored data has not been changed.',
    STORAGE_WRITE: 'Could not save your changes. Check browser storage and try again.',
  };
  return messages[code] ?? 'Could not change this post.';
}
