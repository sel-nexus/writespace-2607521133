/** Compose discovery routes and keep local session transitions explicit. */
import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getSession } from './helpers/auth.js';
import { isValidSession } from './helpers/storage.js';
import PublicNavbar from './components/PublicNavbar.jsx';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

/**
 * Read the session without repairing corrupt or inaccessible storage.
 * @returns {{session:object|null, warning:string}} Identity and safe diagnostic.
 */
function readIdentity() {
  let warning = '';
  const session = getSession(() => {
    warning = 'Could not read your saved session. You are browsing as a guest; stored data has not been changed.';
  });
  return { session, warning };
}

/**
 * Recover unknown and not-yet-implemented routes with a public home link.
 * @returns {React.JSX.Element} Usable not-found content, never a fake feature page.
 */
function NotFoundEntry() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-5 py-20 sm:px-10">
      <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-violet-800">
        Page not found
      </p>
      <h1 className="max-w-2xl font-['Georgia',serif] text-5xl leading-tight sm:text-6xl">
        This page wandered off.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-700">
        We couldn’t find that page. Come back to WriteSpace and discover a fresh page.
      </p>
      <Link
        to="/"
        className={[
          'mt-8 inline-flex min-h-12 items-center rounded-full bg-violet-800 px-6 py-3 font-medium text-white hover:bg-violet-900',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700 focus-visible:ring-offset-4',
        ].join(' ')}
      >
        Return to WriteSpace
      </Link>
    </main>
  );
}

/**
 * Resolve discovery and account-entry routes, guarding known future destinations.
 * @returns {React.JSX.Element} Content inside the caller-owned router.
 * @note Auth pages receive session and onAuthenticated(nextSession).
 * The callback accepts only a valid, already-persisted session; it does not write.
 */
export default function App() {
  const [identity, setIdentity] = useState(readIdentity);
  const [logoutError, setLogoutError] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { session, warning } = identity;

  /**
   * Adopt only a complete, already-persisted successful authentication result.
   * @param {object} nextSession - Session returned by successful login/register.
   * @returns {boolean} Whether the identity was accepted.
   */
  function onAuthenticated(nextSession) {
    if (!isValidSession(nextSession)) return false;
    setIdentity({ session: nextSession, warning: '' });
    setLogoutError('');
    return true;
  }

  useEffect(() => {
    /** Refresh identity only when another tab changes this demo's session key. */
    function refreshSession(event) {
      if (event.key !== 'writespace_session' && event.key !== null) return;
      const nextIdentity = readIdentity();
      if (isValidSession(nextIdentity.session)) {
        onAuthenticated(nextIdentity.session);
      } else {
        setIdentity(nextIdentity);
      }
    }
    window.addEventListener('storage', refreshSession);
    return () => window.removeEventListener('storage', refreshSession);
  }, []);

  useEffect(() => {
    if (!logoutPending || location.pathname !== '/') return;
    // Commit home navigation before clearing identity so concurrent routing cannot
    // briefly render the old protected route as a guest and redirect to login.
    setIdentity({ session: null, warning: '' });
    setLogoutError('');
    setLogoutPending(false);
  }, [logoutPending, location.pathname]);

  /**
   * Remove the durable session before navigating home and clearing UI identity.
   * @returns {void} Keep identity intact and report a failure when removal fails.
   */
  function onLogout() {
    const result = clearSession();
    if (!result.ok) {
      setLogoutError('Could not log out. Your session is still active. Please try again.');
      return;
    }
    setLogoutPending(true);
    navigate('/');
  }

  const futurePostPaths = ['/blogs', '/blog/:id', '/write', '/edit/:id'];
  const futureAdminPaths = ['/admin', '/users'];

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 font-['Arial',sans-serif] text-stone-900">
      <a
        href="#main-content"
        className={[
          'sr-only rounded-lg bg-white p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50',
          'focus:ring-2 focus:ring-violet-700',
        ].join(' ')}
      >
        Skip to content
      </a>
      {location.pathname === '/' || !isValidSession(session) ? (
        <PublicNavbar session={session} />
      ) : (
        <Navbar session={session} onLogout={onLogout} logoutError={logoutError} />
      )}
      {warning && (
        <p role="alert" className="mx-auto mt-4 w-full max-w-7xl rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          {warning}
        </p>
      )}
      <Routes>
        <Route path="/" element={<LandingPage session={session} />} />
        <Route path="/login" element={<LoginPage session={session} onAuthenticated={onAuthenticated} />} />
        <Route path="/register" element={<RegisterPage session={session} onAuthenticated={onAuthenticated} />} />
        {futurePostPaths.map((path) => (
          <Route
            key={path}
            path={path}
            element={(
              <ProtectedRoute session={session}>
                <NotFoundEntry />
              </ProtectedRoute>
            )}
          />
        ))}
        {futureAdminPaths.map((path) => (
          <Route
            key={path}
            path={path}
            element={(
              <ProtectedRoute session={session} role="admin">
                <NotFoundEntry />
              </ProtectedRoute>
            )}
          />
        ))}
        <Route path="*" element={<NotFoundEntry />} />
      </Routes>
    </div>
  );
}
