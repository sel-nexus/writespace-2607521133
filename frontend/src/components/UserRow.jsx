/** Display account identity in a responsive table row with protected, disabled deletion. */
import PropTypes from 'prop-types';
import Avatar from './Avatar.jsx';
import { sessionShape } from './BlogCard.jsx';
import { formatPostDate } from '../helpers/posts.js';
import { deletionPolicyMessage } from '../helpers/users.js';

export const userShape = PropTypes.shape({
  id: PropTypes.string.isRequired, displayName: PropTypes.string.isRequired, username: PropTypes.string.isRequired,
  role: PropTypes.oneOf(['admin', 'user']).isRequired, createdAt: PropTypes.string.isRequired,
});

/**
 * Show identity, role and date without rendering passwords or enabling account deletion.
 * @param {object} props - Account display inputs.
 * @param {object} props.user - Built-in or stored account, preserving existing identity.
 * @param {object|null} props.session - Active Admin used only to explain self protection.
 * @returns {React.JSX.Element} Desktop table row styled as a stacked card on mobile.
 */
export default function UserRow({ user, session = null }) {
  const builtin = user.id === 'admin' || user.username === 'admin';
  const self = user.id === session?.userId;
  const reason = builtin ? 'Default admin cannot be deleted.'
    : self ? 'You cannot delete your active Admin account.' : deletionPolicyMessage;
  const descriptionId = `delete-account-${encodeURIComponent(user.id)}`;
  return (
    <tr className="mb-4 block rounded-xl border border-stone-300 bg-white p-5 md:mb-0 md:table-row md:rounded-none md:border-0 md:p-0">
      <td className="block py-3 md:table-cell md:px-5">
        <div className="flex items-center gap-3">
          <Avatar role={user.role} />
          <span className="break-words font-semibold">
            {user.displayName}
          </span>
        </div>
      </td>
      <td className="block break-words py-3 text-sm md:table-cell md:px-5">
        <span className="mr-2 font-semibold md:hidden">
          Username
        </span>
        {user.username}
      </td>
      <td className="block py-3 md:table-cell md:px-5">
        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-900">
          {user.role === 'admin' ? 'Admin' : 'User'}
        </span>
      </td>
      <td className="block py-3 text-sm text-stone-600 md:table-cell md:px-5">
        <span className="mr-2 font-semibold md:hidden">
          Created
        </span>
        {builtin ? 'Built-in account' : formatPostDate(user.createdAt)}
      </td>
      <td className="block py-3 md:table-cell md:px-5">
        <span
          tabIndex={0}
          title={reason}
          aria-label={`Deletion protection for ${user.username}`}
          aria-describedby={descriptionId}
          className="group relative inline-block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700"
        >
          <button
            type="button"
            disabled
            title={reason}
            aria-describedby={descriptionId}
            className="min-h-11 cursor-not-allowed rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-500"
          >
            Delete
          </button>
          <span
            id={descriptionId}
            role="tooltip"
            className={[
              'sr-only group-hover:not-sr-only group-focus:not-sr-only',
              'group-hover:absolute group-focus:absolute right-0 z-20 w-56 rounded-lg bg-stone-900 p-3 text-xs text-white',
            ].join(' ')}
          >
            {reason}
          </span>
        </span>
      </td>
    </tr>
  );
}

UserRow.propTypes = { user: userShape.isRequired, session: sessionShape };
