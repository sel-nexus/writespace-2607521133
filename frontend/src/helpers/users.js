/** Create local demo accounts as a freshly checked Admin; never persist account deletion. */
import { getUsers, getSession, isValidSession, saveUsers } from './storage.js';

/** Built-in identity is displayed only, never inserted into the saved accounts array. */
export const defaultAdmin = {
  id: 'admin', displayName: 'Admin', username: 'admin', role: 'admin', createdAt: '',
};
export const deletionPolicyMessage = 'Account deletion is disabled pending an approved post-impact policy.';

/**
 * Read accounts for display without treating corrupt storage as a genuine empty collection.
 * @returns {{ok:boolean, users:object[], storedCount:number}} Display accounts and read status.
 * Notes: Inferred totals include stored accounts plus the built-in Admin exactly once.
 * Legacy entries with built-in ID or reserved username are represented by the built-in row, not rewritten.
 */
export function readUsers() {
  let failed = false;
  const stored = getUsers(() => { failed = true; });
  const accounts = stored.filter((user) => user.id !== 'admin' && user.username !== 'admin');
  return { ok: !failed, users: [defaultAdmin, ...accounts], storedCount: accounts.length };
}

/**
 * Validate required exact strings and the recognized role without normalizing identity.
 * @param {unknown} input - Untrusted account form values.
 * @returns {Object<string,string>} Associated field errors.
 */
export function validateUserInput(input) {
  const values = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  for (const [field, label] of [['displayName', 'Display name'], ['username', 'Username'], ['password', 'Password']]) {
    if (typeof values[field] !== 'string' || !values[field].trim()) errors[field] = `${label} is required.`;
  }
  if (values.role !== 'admin' && values.role !== 'user') errors.role = 'Choose Admin or user.';
  return errors;
}

/**
 * Require a complete supplied Admin and matching freshly read durable session.
 * @param {object|null} session - UI identity snapshot.
 * @returns {{ok:boolean, code?:string}} Authorization or safe diagnostic.
 */
function currentAdmin(session) {
  if (!isValidSession(session) || session.role !== 'admin') return { ok: false, code: 'FORBIDDEN' };
  let failed = false;
  const current = getSession(() => { failed = true; });
  if (failed) return { ok: false, code: 'STORAGE_READ' };
  if (!isValidSession(current)
    || ['userId', 'username', 'displayName', 'role'].some((field) => current[field] !== session[field])) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  return { ok: true };
}

/**
 * Append one generated account only after fresh session and account diagnostics pass.
 * @param {{displayName:string, username:string, password:string, role:'admin'|'user'}} input - Exact required form values.
 * @param {object|null} session - Current Admin snapshot.
 * @returns {{ok:boolean, value?:object, code?:string, fieldErrors?:Object<string,string>}} Saved account or explicit failure.
 * Notes: Never switches or writes a session. Failed reads/generation/writes preserve existing records.
 */
export function createUser(input, session) {
  const identity = currentAdmin(session);
  if (!identity.ok) return identity;
  const fieldErrors = validateUserInput(input);
  if (Object.keys(fieldErrors).length) return { ok: false, code: 'VALIDATION', fieldErrors };
  let failed = false;
  const users = getUsers(() => { failed = true; });
  if (failed) return { ok: false, code: 'STORAGE_READ' };
  if (input.username === 'admin' || users.some((user) => user.username === input.username)) {
    return { ok: false, code: 'DUPLICATE_USERNAME', fieldErrors: { username: 'Username is already taken.' } };
  }
  let user;
  try {
    user = {
      id: crypto.randomUUID(), displayName: input.displayName, username: input.username,
      password: input.password, role: input.role, createdAt: new Date().toISOString(),
    };
  } catch {
    return { ok: false, code: 'STORAGE_WRITE' };
  }
  if (!saveUsers([...users, user]).ok) return { ok: false, code: 'STORAGE_WRITE' };
  return { ok: true, value: user };
}

/**
 * Fail closed without reading or writing either accounts or posts while policy remains unresolved.
 * @param {string} userId - Requested exact account ID.
 * @param {object|null} session - UI identity; no identity can authorize deletion yet.
 * @param {boolean} confirmed - Only literal true proceeds beyond cancellation.
 * @returns {{ok:false, code:'CANCELLED'|'FORBIDDEN'|'POLICY_PENDING'}} Explicit non-mutating result.
 */
export function deleteUser(userId, session, confirmed) {
  if (confirmed !== true) return { ok: false, code: 'CANCELLED' };
  if (!isValidSession(session) || session.role !== 'admin' || typeof userId !== 'string' || !userId
    || userId === 'admin' || userId === session.userId) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  return { ok: false, code: 'POLICY_PENDING' };
}

/**
 * Explain safe account-creation failures without exposing credentials or raw storage errors.
 * @param {string} code - Explicit operation code.
 * @returns {string} User-visible feedback; cancellation is silent.
 */
export function userMutationMessage(code) {
  const messages = {
    FORBIDDEN: 'A current Admin session is required. Please log in again.',
    STORAGE_READ: 'Could not read saved accounts or session. Your stored data has not been changed.',
    STORAGE_WRITE: 'Could not save the account. Check browser storage and try again.',
    VALIDATION: 'Please check the required fields.', DUPLICATE_USERNAME: 'Username is already taken.',
    POLICY_PENDING: deletionPolicyMessage, CANCELLED: '',
  };
  return messages[code] ?? 'Could not create the account.';
}
