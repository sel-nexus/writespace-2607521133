/** Present plain-text post summaries and reusable, permission-checked post actions. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import { canMutatePost } from '../helpers/auth.js';
import { deletePost, formatPostDate, mutationMessage, postExcerpt } from '../helpers/posts.js';

export const postShape = PropTypes.shape({
  id: PropTypes.string.isRequired, title: PropTypes.string.isRequired, content: PropTypes.string.isRequired,
  createdAt: PropTypes.string.isRequired, authorId: PropTypes.string.isRequired, authorName: PropTypes.string.isRequired,
});
export const sessionShape = PropTypes.shape({
  userId: PropTypes.string.isRequired, username: PropTypes.string.isRequired,
  displayName: PropTypes.string.isRequired, role: PropTypes.oneOf(['user', 'admin']).isRequired,
});
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700 focus-visible:ring-offset-2';
const borders = ['border-t-indigo-500', 'border-t-violet-500', 'border-t-pink-500', 'border-t-teal-500'];

/**
 * Render permitted edit/delete controls and visible mutation feedback.
 * @param {object} props - Action contract shared by cards and detail.
 * @param {object} props.post - Current rendered post; helper re-reads the real target after confirmation.
 * @param {object|null} props.session - Current UI identity, revalidated by the helper.
 * @param {(postId:string) => void} [props.onDeleted] - Success-only callback; defaults to navigating to blogs.
 * @param {(result:object) => void} [props.onFailure] - Non-cancelled failure callback for page-level handling.
 * @returns {React.JSX.Element|null} Allowed controls, never mutations during render.
 */
export function PostActions({ post, session = null, onDeleted, onFailure }) {
  const [error, setError] = useState('');
  const navigate = useNavigate();

  /** Confirm first, then repeat storage/permission checks; cancellation is a silent no-op. */
  function remove() {
    const result = deletePost(post.id, session, window.confirm('Delete this post? This cannot be undone.'));
    if (result.ok) {
      setError('');
      if (onDeleted) onDeleted(post.id);
      else navigate('/blogs');
    } else if (result.code !== 'CANCELLED') {
      setError(mutationMessage(result.code));
      if (onFailure) onFailure(result);
    }
  }

  if (!canMutatePost(session, post)) return null;
  return (
    <div className="mt-5 border-t border-stone-200 pt-4">
      <div className="flex flex-wrap gap-3">
        <Link to={`/edit/${encodeURIComponent(post.id)}`} className={`${focus} rounded-md px-3 py-3 font-semibold text-violet-800`}>
          Edit
        </Link>
        <button type="button" onClick={remove} className={`${focus} rounded-md px-3 py-3 font-semibold text-red-800 hover:bg-red-50`}>
          Delete
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

PostActions.propTypes = {
  post: postShape.isRequired, session: sessionShape, onDeleted: PropTypes.func, onFailure: PropTypes.func,
};

/**
 * Render a bordered summary with exact excerpt, date, author and permitted actions.
 * @param {object} props - Summary inputs and success/failure callbacks.
 * @param {object} props.post - Complete stored post.
 * @param {number} [props.index] - Newest-first list index used for the four-color border cycle.
 * @param {object|null} [props.session] - Current viewer identity.
 * @param {(postId:string) => void} [props.onDeleted] - Successful deletion only; refresh the consuming list.
 * @param {(result:object) => void} [props.onFailure] - Non-cancelled deletion failure only.
 * @returns {React.JSX.Element} Text-only post card. Infer author role from built-in admin or matching viewer; posts store no role.
 */
export default function BlogCard({ post, index = 0, session = null, onDeleted, onFailure }) {
  const path = `/blog/${encodeURIComponent(post.id)}`;
  const authorRole = post.authorId === 'admin' ? 'admin' : post.authorId === session?.userId ? session.role : 'user';
  return (
    <article className={`min-w-0 rounded-xl border border-stone-300 border-t-4 bg-white p-6 ${borders[index % 4]}`}>
      <div className="flex items-center gap-3 text-sm text-stone-600">
        <Avatar role={authorRole} />
        <span className="break-words">
          {post.authorName}
        </span>
      </div>
      <h2 className="mt-5 break-words font-['Georgia',serif] text-2xl leading-tight">
        <Link to={path} className={`${focus} rounded-sm hover:text-violet-800`}>
          {post.title}
        </Link>
      </h2>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-700">
        {postExcerpt(post.content)}
      </p>
      <p className="mt-5 text-xs text-stone-600">
        {formatPostDate(post.createdAt)}
      </p>
      <Link to={path} className={`${focus} mt-3 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-violet-800`}>
        Read post
        <span className="sr-only">
          : {post.title}
        </span>
      </Link>
      <PostActions post={post} session={session} onDeleted={onDeleted} onFailure={onFailure} />
    </article>
  );
}

BlogCard.propTypes = {
  post: postShape.isRequired, index: PropTypes.number, session: sessionShape, onDeleted: PropTypes.func, onFailure: PropTypes.func,
};
