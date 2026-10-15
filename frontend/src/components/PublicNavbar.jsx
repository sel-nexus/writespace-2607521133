/** Offer public navigation and a validated role-home destination. */
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { roleHome } from '../helpers/auth.js';
import { isValidSession } from '../helpers/storage.js';
import Avatar from './Avatar.jsx';

const linkStyle = [
  'inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium',
  'hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-violet-700 focus-visible:ring-offset-2',
].join(' ');

/**
 * Render a sticky header on the public landing page.
 * @param {object} props - Header inputs.
 * @param {object|null} props.session - Current untrusted identity.
 * @returns {React.JSX.Element} Public header with guest or role-aware links.
 */
export default function PublicNavbar({ session = null }) {
  const signedIn = isValidSession(session);

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
      <nav aria-label="Public navigation" className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3 sm:px-10">
        <Link to="/" aria-label="WriteSpace home" className={`${linkStyle} font-serif text-xl font-bold sm:text-2xl`}>
          WriteSpace
          <span className="text-violet-700">
            .
          </span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-4">
          {signedIn ? (
            <>
              <span className="hidden text-sm text-stone-700 sm:inline">
                {session.displayName}
              </span>
              <Avatar role={session.role} />
              <Link to={roleHome(session)} className={linkStyle}>
                {session.role === 'admin' ? 'Dashboard' : 'All Blogs'}
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className={linkStyle}>
                Login
              </Link>
              <Link to="/register" className={`${linkStyle} border border-stone-300 bg-white`}>
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

PublicNavbar.propTypes = {
  session: PropTypes.object,
};
