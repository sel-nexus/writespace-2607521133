/** Render role-aware active navigation with a click-controlled mobile menu. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { List, X } from '@phosphor-icons/react';
import { Link, NavLink } from 'react-router-dom';
import { isValidSession } from '../helpers/storage.js';
import Avatar from './Avatar.jsx';
import PublicNavbar from './PublicNavbar.jsx';

const controlStyle = [
  'inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700 focus-visible:ring-offset-2',
].join(' ');

/**
 * Style active destinations without replacing native link semantics.
 * @param {object} state - Router active state.
 * @returns {string} Active or resting utility classes.
 */
function activeStyle({ isActive }) {
  return `${controlStyle} ${isActive ? 'bg-violet-100 text-violet-900' : 'text-stone-700 hover:bg-stone-100'}`;
}

/**
 * Expose authenticated destinations and delegate durable logout to App.
 * @param {object} props - Navigation inputs.
 * @param {object|null} props.session - Untrusted session.
 * @param {Function} props.onLogout - Click-only logout callback.
 * @param {string} [props.logoutError] - Sanitized removal failure feedback.
 * @returns {React.JSX.Element} Sticky navigation, or public navigation for guests.
 */
export default function Navbar({ session = null, onLogout, logoutError = '' }) {
  const [open, setOpen] = useState(false);
  if (!isValidSession(session)) {
    return <PublicNavbar />;
  }
  const links = [
    { to: '/', label: 'Home' },
    { to: '/blogs', label: 'All Blogs' },
    { to: '/write', label: 'Write' },
  ];
  if (session.role === 'admin') {
    links.push({ to: '/admin', label: 'Dashboard' }, { to: '/users', label: 'Users' });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
      <nav aria-label="Account navigation" className="mx-auto max-w-7xl px-5 py-3 sm:px-10">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/"
            aria-label="WriteSpace home"
            onClick={() => setOpen(false)}
            className={`${controlStyle} font-serif text-2xl font-bold`}
          >
            WriteSpace
            <span className="text-violet-700">
              .
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-stone-700 sm:inline">
              {session.displayName}
            </span>
            <Avatar role={session.role} />
            <button
              type="button"
              aria-label={open ? 'Close navigation' : 'Open navigation'}
              aria-expanded={open}
              aria-controls="account-links"
              onClick={() => setOpen(!open)}
              className={`${controlStyle} border border-stone-300 md:hidden`}
            >
              {open ? <X size={24} aria-hidden="true" /> : <List size={24} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <div id="account-links" className={`${open ? 'flex' : 'hidden'} mt-3 flex-col gap-1 md:flex md:flex-row md:items-center`}>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end onClick={() => setOpen(false)} className={activeStyle}>
              {link.label}
            </NavLink>
          ))}
          <button type="button" onClick={onLogout} className={`${controlStyle} text-stone-700 hover:bg-stone-100 md:ml-auto`}>
            Logout
          </button>
        </div>
        {logoutError && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {logoutError}
          </p>
        )}
      </nav>
    </header>
  );
}

Navbar.propTypes = {
  session: PropTypes.object,
  onLogout: PropTypes.func.isRequired,
  logoutError: PropTypes.string,
};
