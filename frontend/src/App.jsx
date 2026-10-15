/** Present the public WriteSpace entry without reading or changing browser data. */
import PropTypes from 'prop-types';
import { Link, Route, Routes } from 'react-router-dom';

/**
 * Frame public content with a home link and an accessible main landmark.
 * @param {object} props - Layout inputs.
 * @param {React.ReactNode} props.children - Public route content.
 * @returns {React.JSX.Element} The shared entry frame.
 */
function EntryLayout({ children }) {
  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-white p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:ring-2 focus:ring-indigo-700"
      >
        Skip to content
      </a>
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-stone-300 px-6 py-6 sm:px-10">
        <Link
          to="/"
          aria-label="WriteSpace home"
          className="rounded-sm font-serif text-2xl font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 focus-visible:ring-offset-4"
        >
          WriteSpace<span className="text-indigo-700">.</span>
        </Link>
        <p className="text-sm text-stone-600">A space for your words</p>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-16 sm:px-10 sm:py-24">
        {children}
      </main>
      <footer className="mx-auto max-w-6xl border-t border-stone-300 px-6 py-8 text-sm text-stone-600 sm:px-10">
        Thoughtful words. Fresh perspectives. Your WriteSpace.
      </footer>
    </div>
  );
}

EntryLayout.propTypes = {
  children: PropTypes.node.isRequired,
};

/**
 * Welcome visitors with real introductory content and working in-page navigation.
 * @returns {React.JSX.Element} The public welcome page.
 */
function WelcomeEntry() {
  return (
    <EntryLayout>
      <section aria-labelledby="welcome-title" className="max-w-3xl">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">
          Welcome to WriteSpace
        </p>
        <h1 id="welcome-title" className="font-serif text-5xl leading-tight tracking-tight sm:text-7xl">
          A little space for big ideas.
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-stone-700">
          A passing thought, a story worth telling, a perspective that stays with you.
          WriteSpace is a home for words that deserve a little room.
        </p>
        <a
          href="#about"
          className="mt-10 inline-flex min-h-12 items-center rounded-full bg-indigo-700 px-6 py-3 font-medium text-white hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 focus-visible:ring-offset-4"
        >
          Meet WriteSpace
        </a>
      </section>
      <section
        id="about"
        aria-labelledby="about-title"
        className="mt-20 grid gap-6 border-t border-stone-300 pt-10 sm:mt-28 sm:grid-cols-[1fr_2fr] sm:gap-12"
      >
        <h2 id="about-title" className="font-serif text-3xl">Words begin here.</h2>
        <div className="max-w-xl space-y-5 text-base leading-relaxed text-stone-700">
          <p>
            WriteSpace brings reading and writing together: a place to discover fresh
            voices, shape your own stories, and return to ideas that matter.
          </p>
          <p>
            This is a browser-local writing demo, not a publishing service or a secure
            account system. This welcome page does not create accounts or save posts.
          </p>
          <a
            href="#main-content"
            className="inline-flex min-h-11 items-center rounded-sm font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-4 hover:decoration-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 focus-visible:ring-offset-4"
          >
            Back to welcome
          </a>
        </div>
      </section>
    </EntryLayout>
  );
}

/**
 * Recover unknown URLs without assuming an account or a stored session.
 * @returns {React.JSX.Element} A usable not-found page with a home destination.
 */
function NotFoundEntry() {
  return (
    <EntryLayout>
      <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Page not found</p>
      <h1 className="max-w-2xl font-serif text-5xl leading-tight sm:text-6xl">This page wandered off.</h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-700">
        We couldn’t find that page. Come back to WriteSpace and start from the welcome page.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-12 items-center rounded-full bg-indigo-700 px-6 py-3 font-medium text-white hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 focus-visible:ring-offset-4"
      >
        Return to WriteSpace
      </Link>
    </EntryLayout>
  );
}

/**
 * Resolve only the implemented entry route and the unknown-route fallback.
 * @returns {React.JSX.Element} Public route content inside the caller's router.
 * @note The browser router belongs exclusively to main.jsx.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomeEntry />} />
      <Route path="*" element={<NotFoundEntry />} />
    </Routes>
  );
}
