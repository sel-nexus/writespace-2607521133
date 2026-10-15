/** Render a role icon without implying identity for invalid roles. */
import PropTypes from 'prop-types';
import { ShieldCheck, UserCircle } from '@phosphor-icons/react';

/**
 * Show a compact, accessible role marker.
 * @param {object} props - Avatar inputs.
 * @param {string|null} props.role - Recognized role or an unknown value.
 * @returns {React.JSX.Element} Role icon with a readable label.
 */
export default function Avatar({ role = null }) {
  const admin = role === 'admin';
  const label = admin ? 'Admin avatar' : role === 'user' ? 'User avatar' : 'Guest avatar';
  const Icon = admin ? ShieldCheck : UserCircle;

  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-900"
    >
      <Icon size={24} weight="regular" aria-hidden="true" />
    </span>
  );
}

Avatar.propTypes = {
  role: PropTypes.string,
};
