/** Create local demo accounts and show policy-protected responsive account rows. */
import { useState } from 'react';
import FormField from '../components/FormField.jsx';
import UserRow from '../components/UserRow.jsx';
import { sessionShape } from '../components/BlogCard.jsx';
import { createUser, deletionPolicyMessage, readUsers, userMutationMessage } from '../helpers/users.js';

const emptyForm = { displayName: '', username: '', password: '', role: 'user' };

/**
 * Render accessible Admin account creation and a desktop table with mobile stacked rows.
 * @param {object} props - Management inputs.
 * @param {object|null} props.session - Admin identity; creation freshly checks its durable counterpart.
 * @returns {React.JSX.Element} Explicit validation/read/write feedback and no enabled account-delete flow.
 */
export default function UserManagement({ session = null }) {
  const [snapshot, setSnapshot] = useState(readUsers);
  const [values, setValues] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /** Preserve exact field values while editing, including passwords and username case. */
  function change(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setSuccess('');
  }

  /** Validate and save through the real helper; never report success or clear fields on failure. */
  function submit(event) {
    event.preventDefault();
    setSuccess('');
    const result = createUser(values, session);
    setFieldErrors(result.fieldErrors ?? {});
    if (!result.ok) {
      setError(result.fieldErrors ? '' : userMutationMessage(result.code));
      return;
    }
    const next = readUsers();
    setSnapshot(next.ok ? next : {
      ...snapshot, ok: false, users: [...snapshot.users, result.value], storedCount: snapshot.storedCount + 1,
    });
    setValues({ ...emptyForm });
    setError('');
    setSuccess('Account created. Your Admin session has not changed.');
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 sm:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-800">
        Owner oversight
      </p>
      <h1 className="mt-3 font-['Georgia',serif] text-4xl leading-tight sm:text-5xl">
        User Management
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone-700">
        Local-only demo. Passwords are stored in plaintext in this browser. Do not use real or reused passwords.
      </p>
      <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        {deletionPolicyMessage} Built-in and active Admin accounts have additional protections.
      </p>
      {!snapshot.ok && (
        <p role="alert" className="mt-4 text-sm text-red-800">
          Could not read saved accounts. The list may be incomplete; stored data has not been changed.
        </p>
      )}
      <section aria-labelledby="create-user-heading" className="my-8 rounded-xl border border-stone-300 bg-white p-6 sm:p-8">
        <h2 id="create-user-heading" className="font-['Georgia',serif] text-2xl">
          Create account
        </h2>
        <form aria-label="Create account" noValidate onSubmit={submit} className="mt-6 grid gap-5 md:grid-cols-2">
          {[
            ['displayName', 'Display name', 'text', 'name'], ['username', 'Username', 'text', 'username'],
            ['password', 'Password', 'password', 'new-password'],
          ].map(([field, label, type, autoComplete]) => (
            <FormField
              key={field}
              id={`admin-${field}`}
              label={label}
              type={type}
              autoComplete={autoComplete}
              value={values[field]}
              onChange={(event) => change(field, event.target.value)}
              error={fieldErrors[field]}
            />
          ))}
          <div>
            <label htmlFor="admin-role" className="mb-2 block text-sm font-semibold">
              Role
            </label>
            <select
              id="admin-role"
              name="role"
              value={values.role}
              onChange={(event) => change('role', event.target.value)}
              required
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.role)}
              aria-describedby={fieldErrors.role ? 'admin-role-error' : undefined}
              className="min-h-12 w-full rounded-lg border border-stone-400 bg-white px-3 py-3 focus:outline-none focus:ring-2 focus:ring-violet-700"
            >
              <option value="user">
                User
              </option>
              <option value="admin">
                Admin
              </option>
            </select>
            {fieldErrors.role && (
              <p id="admin-role-error" role="alert" className="mt-2 text-sm text-red-800">
                {fieldErrors.role}
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className={[
                'min-h-12 rounded-lg bg-violet-800 px-6 py-3 font-semibold text-white hover:bg-violet-900',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700 focus-visible:ring-offset-2',
              ].join(' ')}
            >
              Create account
            </button>
            {error && (
              <p role="alert" className="mt-4 text-sm text-red-800">
                {error}
              </p>
            )}
            {success && (
              <p role="status" className="mt-4 text-sm text-green-800">
                {success}
              </p>
            )}
          </div>
        </form>
      </section>
      <section aria-labelledby="accounts-heading">
        <h2 id="accounts-heading" className="mb-5 font-['Georgia',serif] text-3xl">
          Accounts
        </h2>
        {snapshot.ok && snapshot.storedCount === 0 && (
          <p className="mb-4 text-sm text-stone-600">
            No stored accounts yet. The built-in Admin is always available.
          </p>
        )}
        <table className="block w-full table-fixed text-left md:table">
          <caption className="sr-only">
            Local accounts, including the built-in Admin exactly once. Passwords are not displayed.
          </caption>
          <thead className="hidden border-b border-stone-300 text-xs uppercase tracking-wide text-stone-600 md:table-header-group">
            <tr>
              {['Display name', 'Username', 'Role', 'Created', 'Action'].map((label) => (
                <th key={label} scope="col" className="px-5 py-4">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="block md:table-row-group md:divide-y md:divide-stone-200">
            {snapshot.users.map((user) => (
              <UserRow key={user.id} user={user} session={session} />
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

UserManagement.propTypes = { session: sessionShape };
