/** Sign in to the browser-local demo without taking ownership of App's session. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { login, roleHome } from '../helpers/auth.js';
import { isValidSession } from '../helpers/storage.js';
import AuthLayout from '../components/AuthLayout.jsx';
import FormField from '../components/FormField.jsx';

/**
 * Submit exact credentials and adopt only a successfully persisted session.
 * @param {{session?:import('../helpers/storage.js').Session|null, onAuthenticated:function}} props - App-owned identity and callback.
 * @returns {React.JSX.Element} Guest form or recognized-session role redirect.
 * Notes: Authentication runs only on submit. Failure never clears the current session.
 */
export default function LoginPage({ session = null, onAuthenticated }) {
  const [values, setValues] = useState({ username: '', password: '' });
  const [feedback, setFeedback] = useState({});
  const navigate = useNavigate();

  /**
   * Submit local credentials; preserve controlled values on every failure.
   * @param {React.FormEvent<HTMLFormElement>} event - Explicit form submission.
   * @returns {void} Notify App and navigate only after session persistence succeeds.
   */
  function onSubmit(event) {
    event.preventDefault();
    const result = login(values.username, values.password);
    if (!result.ok) {
      setFeedback(result);
      return;
    }
    onAuthenticated(result.session);
    navigate(roleHome(result.session), { replace: true });
  }

  if (isValidSession(session)) return <Navigate to={roleHome(session)} replace />;

  return (
    <AuthLayout title="Welcome back" description="Log in to your local writing space. A new thought is waiting.">
      <form aria-label="Login" noValidate onSubmit={onSubmit} className="space-y-5">
        <FormField
          id="login-username"
          label="Username"
          value={values.username}
          onChange={(event) => setValues({ ...values, username: event.target.value })}
          autoComplete="username"
          error={feedback.fieldErrors?.username}
        />
        <FormField
          id="login-password"
          label="Password"
          type="password"
          value={values.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
          autoComplete="current-password"
          error={feedback.fieldErrors?.password}
        />
        {feedback.message && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-900">
            {feedback.message}
          </p>
        )}
        <button
          type="submit"
          className={[
            'min-h-12 w-full rounded-full bg-violet-800 px-5 py-3 font-semibold text-white hover:bg-violet-900',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700 focus-visible:ring-offset-4',
          ].join(' ')}
        >
          Log in
        </button>
      </form>
      <p className="mt-5 rounded-lg bg-stone-100 p-3 text-sm leading-relaxed text-stone-800">
        Demo Admin: username <strong>admin</strong> / password <strong>admin</strong>.
      </p>
      <p className="mt-5 text-sm text-stone-700">
        New here?{' '}
        <Link to="/register" className="font-semibold text-violet-800 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-violet-700">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}

LoginPage.propTypes = {
  session: PropTypes.shape({
    userId: PropTypes.string,
    username: PropTypes.string,
    displayName: PropTypes.string,
    role: PropTypes.string,
  }),
  onAuthenticated: PropTypes.func.isRequired,
};
