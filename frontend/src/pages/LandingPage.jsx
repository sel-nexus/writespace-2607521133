/** Present editorial discovery without creating or modifying browser records. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Feather, LockKey, Lightning, ArrowUpRight } from '@phosphor-icons/react';
import { getPosts, isValidSession } from '../helpers/storage.js';

const focusStyle = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700 focus-visible:ring-offset-4';
const headingStyle = "font-['Georgia',serif] tracking-tight";
const features = [
  { title: 'Write Freely', icon: Feather, text: 'A blank page, a clear mind. Give your ideas room to become stories.' },
  { title: 'Private & Local', icon: LockKey, text: 'Your demo posts stay in this browser. No server, no shared feed, no production security.' },
  { title: 'Instant & Fast', icon: Lightning, text: 'Less waiting, more writing. Return to the words you saved on this device.' },
];

/**
 * Read one non-mutating snapshot and keep diagnostics alongside its fallback.
 * @returns {{posts:object[], readError:boolean}} Latest valid posts and read status.
 */
function readLatest() {
  let readError = false;
  const posts = getPosts(() => { readError = true; });
  const ordered = [...posts].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  return { posts: ordered.slice(0, 3), readError };
}

/**
 * Keep legacy invalid dates behind valid dates without throwing.
 * @param {string} value - Persisted date string.
 * @returns {number} Timestamp or a stable oldest-value fallback.
 */
function dateValue(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

/**
 * Format valid preview dates consistently regardless of browser timezone.
 * @param {string} value - Persisted creation date.
 * @returns {string} MMM DD YYYY, or explicit unavailable-date feedback.
 */
function previewDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(date).replace(',', '');
}

/**
 * Render samples, feature promises, latest previews and public footer links.
 * @param {object} props - Discovery inputs.
 * @param {object|null} props.session - Current untrusted session.
 * @returns {React.JSX.Element} Public discovery content and footer.
 */
export default function LandingPage({ session = null }) {
  const [snapshot] = useState(readLatest);
  const readingPath = isValidSession(session) ? '/blogs' : '/login';

  return (
    <>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-5 sm:px-10">
        <section aria-labelledby="landing-title" className="grid items-center gap-12 py-16 md:grid-cols-[1.15fr_1fr] md:gap-16 md:py-24">
          <div>
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.22em] text-violet-800">
              A little room for your words
            </p>
            <h1 id="landing-title" className={`${headingStyle} max-w-2xl text-5xl leading-[1.08] sm:text-6xl lg:text-7xl`}>
              Your thoughts. Your space. Beautifully simple.
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-stone-700">
              For the passing thought and the story worth keeping. Find your voice,
              turn a fresh page, and make a small space your own.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                to="/register"
                className={[focusStyle, 'inline-flex min-h-12 items-center gap-3 rounded-full bg-violet-800 px-6 py-3',
                  'font-semibold text-white hover:bg-violet-900 motion-safe:transition-transform',
                  'motion-safe:duration-200 motion-safe:hover:-translate-y-0.5'].join(' ')}
              >
                Get Started Free
                <ArrowUpRight size={20} aria-hidden="true" />
              </Link>
              <Link to={readingPath} className={`${focusStyle} inline-flex min-h-12 items-center rounded-md px-3 font-semibold underline underline-offset-4`}>
                Start Reading
              </Link>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-stone-600">
              A browser-local writing demo. Not a publishing service or a secure account system.
            </p>
          </div>
          <figure aria-labelledby="sample-caption" className="relative min-w-0 pb-5 pt-5 md:pt-12">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-stone-300 bg-stone-100 p-4 sm:gap-4 sm:p-6">
              {[0, 1, 2].map((sample) => (
                <div
                  key={sample}
                  className={[
                    'rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5',
                    sample === 0 ? 'col-span-2 border-t-4 border-t-violet-700' : '',
                  ].join(' ')}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600">
                    Illustrative sample
                  </p>
                  <h2 className={`${headingStyle} mt-4 text-2xl`}>
                    Post Title
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-stone-700">
                    Full post text...
                  </p>
                  <div className="mt-6 flex items-center gap-2 border-t border-stone-200 pt-3 text-xs text-stone-600">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-violet-900">
                      A
                    </span>
                    Admin
                  </div>
                </div>
              ))}
            </div>
            <div
              className={['absolute -top-1 right-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-lg',
                'motion-safe:rotate-3 motion-safe:transition-transform motion-safe:duration-300',
                'motion-safe:hover:-translate-y-1 motion-safe:hover:rotate-0'].join(' ')}
            >
              A thought today. A story tomorrow.
            </div>
            <figcaption id="sample-caption" className="mt-4 text-center text-xs leading-relaxed text-stone-600">
              A glimpse of the page — illustrative samples, not saved posts.
            </figcaption>
          </figure>
        </section>
        <section aria-labelledby="features-title" className="border-t border-stone-300 py-14 sm:py-16">
          <h2 id="features-title" className={`${headingStyle} text-3xl sm:text-4xl`}>
            Less noise. More room to create.
          </h2>
          <div className="mt-9 grid gap-8 md:grid-cols-3">
            {features.map(({ title, icon: Icon, text }, index) => (
              <article key={title} className="border-l border-stone-300 pl-5">
                <div className="mb-5 flex items-center gap-3 text-violet-800">
                  <Icon size={24} aria-hidden="true" />
                  <span className="text-xs tabular-nums">
                    0{index + 1}
                  </span>
                </div>
                <h3 className={`${headingStyle} text-2xl`}>
                  {title}
                </h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-700">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section aria-labelledby="latest-title" className="border-t border-stone-300 pb-20 pt-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-violet-800">
                From this browser
              </p>
              <h2 id="latest-title" className={`${headingStyle} text-3xl sm:text-4xl`}>
                Latest Posts
              </h2>
            </div>
            <Link to="/blogs" className={`${focusStyle} rounded-md py-3 text-sm font-semibold underline underline-offset-4`}>
              View all blogs
            </Link>
          </div>
          {snapshot.readError && (
            <p role="alert" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
              Could not read saved posts. Your stored data has not been changed. Try reloading when browser storage is available.
            </p>
          )}
          {snapshot.posts.length === 0 ? (
            <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-8 text-stone-700">
              No posts yet — check back soon!
            </p>
          ) : (
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {snapshot.posts.map((post) => (
                <article key={post.id} className="min-w-0 rounded-xl border border-stone-300 bg-white p-6">
                  <p className="text-xs text-stone-600">
                    {post.authorName}
                  </p>
                  <h3 className={`${headingStyle} mt-3 break-words text-2xl`}>
                    <Link to={`/blog/${encodeURIComponent(post.id)}`} className={`${focusStyle} rounded-sm hover:text-violet-800`}>
                      {post.title}
                    </Link>
                  </h3>
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-700">
                    {post.content.slice(0, 120)}
                  </p>
                  <p className="mt-6 text-xs text-stone-600">
                    {previewDate(post.createdAt)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
      <footer className="bg-slate-900 text-stone-100">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-7 px-5 py-10 sm:px-10 md:flex-row md:items-center">
          <div>
            <p className={`${headingStyle} text-2xl`}>
              WriteSpace.
            </p>
            <p className="mt-2 text-sm text-stone-300">
              © {new Date().getFullYear()} WriteSpace. A space for your words.
            </p>
          </div>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-5 text-sm">
            {[['/', 'Home'], ['/blogs', 'All Blogs'], ['/login', 'Login'], ['/register', 'Register']].map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="inline-flex min-h-11 items-center rounded-md underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-white"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </>
  );
}

LandingPage.propTypes = {
  session: PropTypes.object,
};
