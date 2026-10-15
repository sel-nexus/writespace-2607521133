/** Summarize real local activity and reuse permission-checked recent-post actions. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import BlogCard, { sessionShape } from '../components/BlogCard.jsx';
import StatCard from '../components/StatCard.jsx';
import { readPosts, sortPostsNewest } from '../helpers/posts.js';
import { readUsers } from '../helpers/users.js';

/**
 * Read independent post/account snapshots without repairing either collection.
 * @returns {{posts:object, accounts:object}} Diagnostic-aware local data.
 */
function readDashboard() {
  return { posts: readPosts(), accounts: readUsers() };
}

/**
 * Render four exact metrics, recent five real posts and role workflow links.
 * @param {object} props - Dashboard inputs.
 * @param {object|null} props.session - Admin identity passed through to real PostActions.
 * @returns {React.JSX.Element} Paper-neutral dashboard with localized gradient banner.
 */
export default function AdminDashboard({ session = null }) {
  const [snapshot, setSnapshot] = useState(readDashboard);
  const { posts, accounts } = snapshot;
  const totalUsers = accounts.ok ? accounts.users.length : '—';
  const totalAdmins = accounts.ok ? accounts.users.filter((user) => user.role === 'admin').length : '—';
  const metrics = [
    ['Total Posts', posts.ok ? posts.posts.length : '—'], ['Total Users', totalUsers],
    ['Total Admins', totalAdmins], ['Total users', totalUsers],
  ];
  const recent = sortPostsNewest(posts.posts).slice(0, 5);

  /** Remove from the rendered snapshot only after the real delete helper succeeds. */
  function onDeleted(postId) {
    setSnapshot((current) => ({
      ...current, posts: { ...current.posts, posts: current.posts.posts.filter((post) => post.id !== postId) },
    }));
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 sm:px-10">
      <header className="rounded-2xl bg-gradient-to-r from-violet-800 to-indigo-800 p-7 text-white sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-100">
          Owner oversight
        </p>
        <h1 className="mt-3 font-['Georgia',serif] text-4xl leading-tight sm:text-5xl">
          Admin Dashboard
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-violet-100">
          Review the stories and accounts saved in this browser. This is a local-only demo, not production administration.
        </p>
      </header>
      {(!posts.ok || !accounts.ok) && (
        <p role="alert" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Could not read saved { !posts.ok && !accounts.ok ? 'posts and accounts' : !posts.ok ? 'posts' : 'accounts' }.
          {' '}Affected totals are unavailable. Your stored data has not been changed.
        </p>
      )}
      <dl aria-label="Dashboard totals" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <StatCard key={label} label={label} value={value} />
        ))}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-stone-600">
        Inferred totals: Total Users and Total users both count all stored accounts plus the built-in Admin exactly once.
        {' '}Total Admins counts Admin-role accounts including that built-in Admin. Total Posts counts all saved posts.
      </p>
      <nav aria-label="Quick actions" className="my-8 flex flex-wrap gap-3">
        {[['/blogs', 'All Blogs'], ['/write', 'Write'], ['/users', 'Users']].map(([to, label]) => (
          <Link
            key={to}
            to={to}
            className={[
              'inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-5 py-3 font-semibold text-violet-800',
              'hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700',
            ].join(' ')}
          >
            {label}
          </Link>
        ))}
      </nav>
      <section aria-labelledby="recent-posts-heading">
        <h2 id="recent-posts-heading" className="font-['Georgia',serif] text-3xl">
          Recent Posts
        </h2>
        <p className="mb-6 mt-2 text-sm text-stone-600">
          The five newest saved stories. Admins can edit or delete any post.
        </p>
        {recent.length ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {recent.map((post, index) => (
              <BlogCard key={post.id} post={post} index={index} session={session} onDeleted={onDeleted} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-stone-300 p-8 text-stone-700">
            {posts.ok ? 'No posts yet. Write the first story or visit All Blogs.' : 'Recent posts are unavailable until storage can be read.'}
          </p>
        )}
      </section>
    </main>
  );
}

AdminDashboard.propTypes = { session: sessionShape };
