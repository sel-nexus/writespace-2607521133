/** List browser-local posts newest first without mutating storage during reads. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BlogCard, { sessionShape } from '../components/BlogCard.jsx';
import { mutationMessage, readPosts, sortPostsNewest } from '../helpers/posts.js';

/**
 * Render a responsive newest-first grid, empty CTA and non-destructive read warning.
 * @param {object} props - Listing inputs.
 * @param {object|null} props.session - Viewer identity for permitted card actions.
 * @returns {React.JSX.Element} Authenticated post listing.
 */
export default function Home({ session = null }) {
  const [snapshot, setSnapshot] = useState(() => readPosts());

  /** Refresh only on entry or successful deletion, preserving explicit read diagnostics. */
  function refresh() {
    setSnapshot(readPosts());
  }

  useEffect(() => { refresh(); }, []);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-5 py-12 sm:px-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-violet-800">
            From this browser
          </p>
          <h1 className="font-['Georgia',serif] text-4xl sm:text-5xl">
            All Blogs
          </h1>
        </div>
        <Link to="/write" className="rounded-full bg-violet-800 px-6 py-3 font-semibold text-white hover:bg-violet-900 focus-visible:ring-2">
          Write a post
        </Link>
      </header>
      {!snapshot.ok && (
        <p role="alert" className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
          {mutationMessage(snapshot.code)}
        </p>
      )}
      {snapshot.posts.length === 0 ? (
        <section aria-label="No posts" className="rounded-xl border border-dashed border-stone-300 p-8 sm:p-12">
          <h2 className="font-['Georgia',serif] text-3xl">
            No posts yet
          </h2>
          <p className="mb-6 mt-3 text-stone-700">
            Give your first thought a home.
          </p>
          <Link to="/write" className="inline-flex min-h-11 items-center rounded-md font-semibold text-violet-800 underline focus-visible:ring-2">
            Write your first post
          </Link>
        </section>
      ) : (
        <div aria-label="Posts" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sortPostsNewest(snapshot.posts).map((post, index) => (
            <BlogCard key={post.id} post={post} index={index} session={session} onDeleted={refresh} />
          ))}
        </div>
      )}
    </main>
  );
}

Home.propTypes = { session: sessionShape };
