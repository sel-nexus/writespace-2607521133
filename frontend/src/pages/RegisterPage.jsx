/** Create a user-only local account and explain non-transactional partial saves. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { register, roleHome } from '../helpers/auth.js';
import { isValidSession } from '../helpers/storage.js';
import AuthLayout from '../components/AuthLayout.jsx';
import FormField from '../components/FormField.jsx';

const fields = [
  { name: 'displayName', label: 'Display name', type: 'text', autoComplete: 'nickname' },
  { name: 'username', label: 'Username', type: 'text', autoComplete: 'username' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
  { name: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' },
];

/**
 * Register exact form values, calling App only after both account and session save.
 * @param {{session?:import('../helpers/storage.js').Session|null, onAuthenticated:function}} props - App-owned identity and callback.
 * @returns {React.JSX.Element} Guest form, partial-save recovery or role redirect.
 * Notes: A saved account with failed sign-in remains on this page with a login link.
 */
export default function RegisterPage({ session = null, onAuthenticated }) {
  const [values, setValues] = useState({ displayName: '', username: '', password: '', confirmPassword: '' });
  const [feedback, setFeedback] = useState({});
  const navigate = useNavigate();

  /**
   * Create only on explicit submit, never mutate storage during render or mount.
   * @param {React.FormEvent<HTMLFormElement>} event - Explicit form submission.
   * @returns {void} Keep partial saves on-page; notify App only after persisted sign-in.
   */
  function onSubmit(event) {
    event.preventDefault();
    const result = register(values);
    if (!result.ok) {
      setFeedback(result);
      return;
    }
    onAuthenticated(result.session);
    navigate(roleHome(result.session), { replace: true });
  }

  if (isValidSession(session)) return <Navigate to={roleHome(session)} replace />;

  return (
    <AuthLayout title="Make room for words" description="Create a demo account for this browser. Your first blank page starts here.">
      <form aria-label="Register" noValidate onSubmit={onSubmit} className="space-y-5">
        {fields.map(({ name, label, type, autoComplete }) => (
          <FormField
            key={name}
            id={`register-${name}`}
            label={label}
            type={type}
            autoComplete={autoComplete}
            value={values[name]}
            onChange={(event) => setValues({ ...values, [name]: event.target.value })}
            error={feedback.fieldErrors?.[name]}
          />
        ))}
        {feedback.message && (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">
            {feedback.message}
          </p>
        )}
        {feedback.accountCreated === true && (
          <Link
            to="/login"
            className={[
              'inline-flex min-h-11 items-center font-semibold text-violet-800 underline',
              'focus-visible:ring-2 focus-visible:ring-violet-700',
            ].join(' ')}
          >
            Log in to your created account
          </Link>
        )}
        <button
          type="submit"
          className={[
            'min-h-12 w-full rounded-full bg-violet-800 px-5 py-3 font-semibold text-white hover:bg-violet-900',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700 focus-visible:ring-offset-4',
          ].join(' ')}
        >
          Create account
        </button>
      </form>
      <p className="mt-5 text-sm text-stone-700">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-violet-800 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-violet-700">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

RegisterPage.propTypes = {
  session: PropTypes.shape({
    userId: PropTypes.string,
    username: PropTypes.string,
    displayName: PropTypes.string,
    role: PropTypes.string,
  }),
  onAuthenticated: PropTypes.func.isRequired,
};
