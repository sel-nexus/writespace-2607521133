/** Read one exact stored post as text, keeping line breaks and safe missing/error states. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import { PostActions, sessionShape } from '../components/BlogCard.jsx';
import { formatPostDate, mutationMessage, readPosts } from '../helpers/posts.js';

/**
 * Look up the route ID and display full plain text with permitted post controls.
 * @param {object} props - Reader inputs.
 * @param {object|null} props.session - Viewer identity for ownership actions.
 * @returns {React.JSX.Element} Detail, exact Post not found, or a visible read failure.
 */
export default function ReadBlog({ session = null }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => { setSnapshot(readPosts()); }, [id]);

  /** Return to the refreshed list only after a successful deletion. */
  function deleted() {
    navigate('/blogs');
  }

  const post = snapshot?.posts.find((item) => item.id === id);
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-10">
      <Link to="/blogs" className="inline-flex min-h-11 items-center rounded-md text-violet-800 underline focus-visible:ring-2">
        Back to All Blogs
      </Link>
      {!snapshot ? (
        <p role="status" className="mt-8">
          Loading post…
        </p>
      ) : !snapshot.ok ? (
        <p role="alert" className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
          {mutationMessage(snapshot.code)}
        </p>
      ) : !post ? (
        <h1 className="mt-8 font-['Georgia',serif] text-4xl">
          Post not found
        </h1>
      ) : (
        <article className="mt-8 min-w-0">
          <h1 className="break-words font-['Georgia',serif] text-4xl leading-tight sm:text-5xl">
            {post.title}
          </h1>
          <div className="mt-6 flex items-center gap-3 border-b border-stone-300 pb-6 text-sm text-stone-600">
            <Avatar role={post.authorId === 'admin' ? 'admin' : post.authorId === session?.userId ? session.role : 'user'} />
            <div>
              <p className="break-words">
                {post.authorName}
              </p>
              <p className="mt-1">
                {formatPostDate(post.createdAt)}
              </p>
            </div>
          </div>
          <p className="mt-8 whitespace-pre-wrap break-words text-lg leading-relaxed text-stone-800">
            {post.content}
          </p>
          <PostActions post={post} session={session} onDeleted={deleted} />
        </article>
      )}
    </main>
  );
}

ReadBlog.propTypes = { session: sessionShape };
