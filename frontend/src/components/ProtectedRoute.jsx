/** Gate known protected destinations without implementing their pages. */
import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import { isValidSession } from '../helpers/storage.js';

/**
 * Reject guests and deny non-Admins when an Admin role is required.
 * @param {object} props - Guard inputs.
 * @param {object|null} props.session - Untrusted current session.
 * @param {string} [props.role] - Optional required role.
 * @param {React.ReactNode} props.children - Authorized route content.
 * @returns {React.JSX.Element} Child content or a replacement redirect.
 */
export default function ProtectedRoute({ session = null, role, children }) {
  if (!isValidSession(session)) {
    return <Navigate to="/login" replace />;
  }
  if (role && session.role !== role) {
    return <Navigate to="/blogs" replace />;
  }
  return children;
}

ProtectedRoute.propTypes = {
  session: PropTypes.object,
  role: PropTypes.string,
  children: PropTypes.node.isRequired,
};
