/** Persist browser-local demo records through exactly three guarded keys. */

/** @typedef {{id:string, title:string, content:string, createdAt:string, authorId:string, authorName:string}} Post */
/** @typedef {{id:string, displayName:string, username:string, password:string, role:'admin'|'user', createdAt:string}} User */
/** @typedef {{userId:string, username:string, displayName:string, role:'admin'|'user'}} Session */
/** @typedef {{operation:'read'|'write'|'remove', reason:'ACCESS'|'PARSE'|'SHAPE'|'SERIALIZE'}} StorageError */
/** @typedef {{ok:true} | {ok:false, error:StorageError}} StorageResult */
/** @typedef {(error:StorageError) => void} ReadErrorHandler */

const POSTS_KEY = 'writespace_posts';
const USERS_KEY = 'writespace_users';
const SESSION_KEY = 'writespace_session';

/**
 * Check every required string without normalizing stored identity or content.
 * @param {unknown} value - Untrusted record.
 * @param {string[]} fields - Minimum string fields.
 * @returns {boolean} Whether the record has all required field types.
 */
function hasStrings(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && fields.every((field) => Object.hasOwn(value, field) && typeof value[field] === 'string');
}

/**
 * Validate the minimum post shape, retaining legacy string IDs and dates.
 * @param {unknown} value - Untrusted post.
 * @returns {boolean} Whether every required post field is a string.
 */
export function isValidPost(value) {
  return hasStrings(value, ['id', 'title', 'content', 'createdAt', 'authorId', 'authorName']);
}

/**
 * Validate a stored account including its demo password and logical role.
 * @param {unknown} value - Untrusted user.
 * @returns {boolean} Whether the complete minimum account shape is valid.
 */
function isValidUser(value) {
  return hasStrings(value, ['id', 'displayName', 'username', 'password', 'role', 'createdAt'])
    && (value.role === 'admin' || value.role === 'user');
}

/**
 * Validate session fields without accepting an unknown role.
 * @param {unknown} value - Untrusted session.
 * @returns {boolean} Whether the complete minimum session shape is valid.
 */
export function isValidSession(value) {
  return hasStrings(value, ['userId', 'username', 'displayName', 'role'])
    && (value.role === 'admin' || value.role === 'user');
}

/**
 * Report only sanitized diagnostics; a consumer callback cannot break a read.
 * @param {ReadErrorHandler|undefined} callback - Optional page warning handler.
 * @param {StorageError['reason']} reason - Failure category, never raw data.
 * @returns {void}
 */
function reportReadError(callback, reason) {
  if (typeof callback === 'function') {
    try {
      callback({ operation: 'read', reason });
    } catch {
      // Consumer warning failures must not turn a safe fallback into a crash.
    }
  }
}

/**
 * Read a fresh snapshot without rewriting, removing, or logging its contents.
 * @template T
 * @param {string} key - One of the three private storage keys.
 * @param {(value:unknown) => boolean} validate - Minimum shape check.
 * @param {T} fallback - Empty collection or absent session.
 * @param {ReadErrorHandler} [onReadError] - Non-persisted diagnostic callback.
 * @returns {T} Parsed valid data or the safe fallback.
 */
function read(key, validate, fallback, onReadError) {
  let raw;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    reportReadError(onReadError, 'ACCESS');
    return fallback;
  }
  if (raw === null) return fallback;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    reportReadError(onReadError, 'PARSE');
    return fallback;
  }
  try {
    if (validate(value)) return value;
  } catch {
    // Treat unexpected record access failures as invalid shape.
  }
  reportReadError(onReadError, 'SHAPE');
  return fallback;
}

/**
 * Require a complete collection; one corrupt record invalidates the whole array.
 * @param {unknown} value - Untrusted collection.
 * @param {(record:unknown) => boolean} validate - Per-record minimum check.
 * @returns {boolean} Whether every array slot is a valid record.
 */
function isCollection(value, validate) {
  return Array.isArray(value) && Array.from(value).every(validate);
}

/**
 * Validate and serialize a deliberate write, reporting failure explicitly.
 * @param {string} key - One of the three private storage keys.
 * @param {unknown} value - Complete replacement value.
 * @param {(value:unknown) => boolean} validate - Minimum shape check.
 * @returns {StorageResult} Success only after setItem returns successfully.
 */
function write(key, value, validate) {
  try {
    if (!validate(value)) return { ok: false, error: { operation: 'write', reason: 'SHAPE' } };
  } catch {
    return { ok: false, error: { operation: 'write', reason: 'SHAPE' } };
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, error: { operation: 'write', reason: 'SERIALIZE' } };
  }
  try {
    window.localStorage.setItem(key, serialized);
    return { ok: true };
  } catch {
    return { ok: false, error: { operation: 'write', reason: 'ACCESS' } };
  }
}

/**
 * Read posts, returning an empty list on absence or diagnosed corruption.
 * @param {ReadErrorHandler} [onReadError] - Check this before any derived mutation.
 * @returns {Post[]} Fresh valid posts; never writes on read.
 */
export function getPosts(onReadError) {
  return read(POSTS_KEY, (value) => isCollection(value, isValidPost), [], onReadError);
}

/**
 * Persist a complete post array without changing stored IDs.
 * @param {Post[]} posts - Valid replacement collection.
 * @returns {StorageResult} Explicit validation, serialization or access result.
 */
export function savePosts(posts) {
  return write(POSTS_KEY, posts, (value) => isCollection(value, isValidPost));
}

/**
 * Read accounts, returning an empty list on absence or diagnosed corruption.
 * @param {ReadErrorHandler} [onReadError] - Check this before any derived mutation.
 * @returns {User[]} Fresh valid accounts; never writes on read.
 */
export function getUsers(onReadError) {
  return read(USERS_KEY, (value) => isCollection(value, isValidUser), [], onReadError);
}

/**
 * Persist a complete demo account array without normalizing identities.
 * @param {User[]} users - Valid replacement collection.
 * @returns {StorageResult} Explicit validation, serialization or access result.
 */
export function saveUsers(users) {
  return write(USERS_KEY, users, (value) => isCollection(value, isValidUser));
}

/**
 * Read the session, treating absent or corrupt data as unauthenticated.
 * @param {ReadErrorHandler} [onReadError] - Optional sanitized diagnostic extension.
 * @returns {Session|null} Fresh valid session or null; never repairs storage.
 */
export function getSession(onReadError) {
  return read(SESSION_KEY, isValidSession, null, onReadError);
}

/**
 * Persist a validated session before a caller reports authentication success.
 * @param {Session} session - Complete identity and recognized role.
 * @returns {StorageResult} Explicit validation, serialization or access result.
 */
export function setSession(session) {
  return write(SESSION_KEY, session, isValidSession);
}

/**
 * Remove only the session; do not claim durable logout if removal fails.
 * @returns {StorageResult} Success only after removeItem completes.
 */
export function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
    return { ok: true };
  } catch {
    return { ok: false, error: { operation: 'remove', reason: 'ACCESS' } };
  }
}
