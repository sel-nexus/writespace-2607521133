/** Resolve local demo credentials and fail-closed role decisions without navigation. */
import { getUsers, saveUsers, setSession, isValidSession, isValidPost } from './storage.js';

export { getSession, setSession, clearSession } from './storage.js';

/** @typedef {import('./storage.js').Session} Session */
/** @typedef {import('./storage.js').Post} Post */
/** @typedef {{displayName:string, username:string, password:string, confirmPassword:string}} RegisterInput */
/** @typedef {'INVALID_CREDENTIALS'|'VALIDATION'|'DUPLICATE_USERNAME'|'STORAGE_READ'|'STORAGE_WRITE'} AuthCode */
/** @typedef {{ok:true, session:Session} | {ok:false, code:AuthCode, message?:string, fieldErrors?:Object<string,string>, accountCreated?:boolean}} AuthResult */

/**
 * Check required form strings while preserving the original exact value.
 * @param {unknown} value - Untrusted form value.
 * @returns {boolean} Whether it is a non-whitespace string.
 */
function isRequiredString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Copy only the account fields needed by a session, never its password.
 * @param {import('./storage.js').User} user - Valid stored account.
 * @returns {Session} Session preserving the exact account identity.
 */
function sessionFrom(user) {
  return { userId: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

/**
 * Persist the identity before reporting a successful local sign-in.
 * @param {Session} session - Valid matched identity.
 * @returns {AuthResult} Session on success or explicit persistence feedback.
 */
function signIn(session) {
  if (!setSession(session).ok) {
    return { ok: false, code: 'STORAGE_WRITE', message: 'Could not save your session. Please try again.' };
  }
  return { ok: true, session };
}

/**
 * Check built-in Admin first, then exact strings in freshly read demo accounts.
 * @param {string} username - Exact entered username; no case normalization.
 * @param {string} password - Exact entered demo password.
 * @returns {AuthResult} Validated persisted session or explicit failure.
 * Notes: Corrupt account reads never lead to a session write.
 */
export function login(username, password) {
  const fieldErrors = {};
  if (!isRequiredString(username)) fieldErrors.username = 'Username is required.';
  if (!isRequiredString(password)) fieldErrors.password = 'Password is required.';
  if (Object.keys(fieldErrors).length) return { ok: false, code: 'VALIDATION', fieldErrors };
  if (username === 'admin' && password === 'admin') {
    return signIn({ userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' });
  }
  let readError;
  const users = getUsers((error) => { readError = error; });
  if (readError) return { ok: false, code: 'STORAGE_READ', message: 'Could not read saved accounts.' };
  const match = users.find((user) => user.username === username && user.password === password);
  if (!match) return { ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' };
  return signIn(sessionFrom(match));
}

/**
 * Create a user-only demo account, then sign in, preserving explicit partial state.
 * @param {RegisterInput} input - Required fields and exact password confirmation.
 * @returns {AuthResult} Persisted session or validation/read/write/partial feedback.
 * Notes: A saved account is not rolled back if the session write fails.
 */
export function register(input) {
  const fields = ['displayName', 'username', 'password', 'confirmPassword'];
  const labels = { displayName: 'Display name', username: 'Username', password: 'Password', confirmPassword: 'Password confirmation' };
  const fieldErrors = {};
  const values = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const field of fields) {
    if (!isRequiredString(values[field])) fieldErrors[field] = `${labels[field]} is required.`;
  }
  if (!fieldErrors.password && !fieldErrors.confirmPassword && values.password !== values.confirmPassword) {
    fieldErrors.confirmPassword = 'Passwords must match.';
  }
  if (Object.keys(fieldErrors).length) return { ok: false, code: 'VALIDATION', fieldErrors };
  if (values.username === 'admin') {
    return { ok: false, code: 'DUPLICATE_USERNAME', fieldErrors: { username: 'Username is already taken.' } };
  }
  let readError;
  const users = getUsers((error) => { readError = error; });
  if (readError) return { ok: false, code: 'STORAGE_READ', message: 'Could not read saved accounts.' };
  if (users.some((user) => user.username === values.username)) {
    return { ok: false, code: 'DUPLICATE_USERNAME', fieldErrors: { username: 'Username is already taken.' } };
  }
  let user;
  try {
    user = {
      id: crypto.randomUUID(), displayName: values.displayName, username: values.username,
      password: values.password, role: 'user', createdAt: new Date().toISOString(),
    };
  } catch {
    return { ok: false, code: 'STORAGE_WRITE', accountCreated: false, message: 'Could not create your account. Please try again.' };
  }
  if (!saveUsers([...users, user]).ok) {
    return { ok: false, code: 'STORAGE_WRITE', accountCreated: false, message: 'Could not save your account. Please try again.' };
  }
  const result = signIn(sessionFrom(user));
  if (!result.ok) {
    return { ok: false, code: 'STORAGE_WRITE', accountCreated: true, message: 'Your account was created, but you are not signed in. Please log in.' };
  }
  return result;
}

/**
 * Select a role destination only for a complete recognized session.
 * @param {Session|null} session - Current untrusted session snapshot.
 * @returns {string} Admin home, user blogs, or login when identity is invalid.
 */
export function roleHome(session) {
  if (!isValidSession(session)) return '/login';
  return session.role === 'admin' ? '/admin' : '/blogs';
}

/**
 * Allow mutations only for valid Admins or the exact owning user and valid post.
 * @param {Session|null} session - Current untrusted identity.
 * @param {Post|null} post - Current untrusted post.
 * @returns {boolean} False for absent, incomplete, or unknown-role inputs.
 */
export function canMutatePost(session, post) {
  if (!isValidSession(session) || !isValidPost(post)) return false;
  return session.role === 'admin' || (session.role === 'user' && session.userId === post.authorId);
}
