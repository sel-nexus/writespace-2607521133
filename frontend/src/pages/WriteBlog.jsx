/** Create or edit plain-text posts with accessible validation and failure-preserving drafts. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useParams } from 'react-router-dom';
import FormField from '../components/FormField.jsx';
import { sessionShape } from '../components/BlogCard.jsx';
import { canMutatePost } from '../helpers/auth.js';
import { createPost, mutationMessage, readPosts, updatePost } from '../helpers/posts.js';

/**
 * Load an edit target or offer a blank create form; save only through checked helpers.
 * @param {object} props - Writer contract.
 * @param {'create'|'edit'} [props.mode] - Explicit route intent.
 * @param {object|null} props.session - Current viewer, freshly revalidated on submission.
 * @returns {React.JSX.Element} Controlled form, missing state or read error; failures never navigate as saved.
 */
export default function WriteBlog({ mode = 'create', session = null }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = mode === 'edit';
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [state, setState] = useState(editing ? 'loading' : 'ready');

  useEffect(() => {
    setFieldErrors({});
    setError('');
    if (!editing) {
      setTitle('');
      setContent('');
      setState('ready');
      return;
    }
    const snapshot = readPosts();
    if (!snapshot.ok) {
      setState('read-error');
      setError(mutationMessage(snapshot.code));
      return;
    }
    const post = snapshot.posts.find((item) => item.id === id);
    if (!post) {
      setState('missing');
      return;
    }
    if (!canMutatePost(session, post)) {
      navigate('/blogs', { replace: true });
      return;
    }
    setTitle(post.title);
    setContent(post.content);
    setState('ready');
  }, [editing, id, session, navigate]);

  /** Validate and save once on submit; retain exact draft values on every failed write. */
  function submit(event) {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    const input = { title, content };
    const result = editing ? updatePost(id, input, session) : createPost(input, session);
    if (result.ok) {
      navigate(`/blog/${encodeURIComponent(result.value.id)}`);
      return;
    }
    if (result.code === 'FORBIDDEN') {
      navigate('/blogs', { replace: true });
      return;
    }
    if (result.code === 'NOT_FOUND') {
      setState('missing');
      return;
    }
    if (result.code === 'VALIDATION') setFieldErrors(result.fieldErrors);
    else setError(mutationMessage(result.code));
  }

  const cancelPath = editing ? `/blog/${encodeURIComponent(id || '')}` : '/blogs';
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-10">
      {state === 'loading' ? (
        <p role="status">
          Loading post…
        </p>
      ) : state === 'missing' || state === 'read-error' ? (
        <>
          <h1 className="font-['Georgia',serif] text-4xl">
            {state === 'missing' ? 'Post not found' : 'Could not load post'}
          </h1>
          {error && (
            <p role="alert" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
              {error}
            </p>
          )}
          <Link to="/blogs" className="mt-6 inline-flex min-h-11 items-center rounded-md text-violet-800 underline focus-visible:ring-2">
            Back to All Blogs
          </Link>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-violet-800">
            Your words, in your browser
          </p>
          <h1 className="font-['Georgia',serif] text-4xl sm:text-5xl">
            {editing ? 'Edit post' : 'Write a post'}
          </h1>
          <form aria-label={editing ? 'Edit post' : 'Write a post'} noValidate onSubmit={submit} className="mt-8 space-y-6">
            {error && (
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
                {error}
              </p>
            )}
            <FormField
              id="post-title" label="Title" value={title} onChange={(event) => setTitle(event.target.value)}
              autoComplete="off" error={fieldErrors.title}
            />
            <div>
              <label htmlFor="post-content" className="mb-2 block text-sm font-semibold text-stone-900">
                Content
                <span aria-hidden="true" className="ml-1 text-violet-800">
                  *
                </span>
              </label>
              <textarea
                id="post-content" name="post-content" value={content} onChange={(event) => setContent(event.target.value)}
                required aria-required="true" aria-invalid={Boolean(fieldErrors.content)}
                aria-describedby={`post-count${fieldErrors.content ? ' post-content-error' : ''}`}
                className={[
                  'min-h-[256px] w-full min-w-0 rounded-lg border bg-white p-3 text-base leading-relaxed text-stone-900',
                  'focus:outline-none focus:ring-2 focus:ring-violet-700 focus:ring-offset-2',
                  fieldErrors.content ? 'border-red-700' : 'border-stone-400',
                ].join(' ')}
              />
              <p id="post-count" aria-live="polite" className="mt-2 text-sm tabular-nums text-stone-600">
                {content.length} characters
              </p>
              {fieldErrors.content && (
                <p id="post-content-error" role="alert" className="mt-2 text-sm text-red-800">
                  {fieldErrors.content}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                className="min-h-12 rounded-full bg-violet-800 px-6 py-3 font-semibold text-white hover:bg-violet-900 focus-visible:ring-2"
              >
                {editing ? 'Save changes' : 'Publish post'}
              </button>
              <Link to={cancelPath} className="inline-flex min-h-12 items-center rounded-md px-4 text-stone-700 underline focus-visible:ring-2">
                Cancel
              </Link>
            </div>
          </form>
        </>
      )}
    </main>
  );
}

WriteBlog.propTypes = { mode: PropTypes.oneOf(['create', 'edit']), session: sessionShape };
