/** Frame browser-local account entry with a legible paper composition. */
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

/**
 * Present a shared form surface and illustrative, never-persisted story samples.
 * @param {{title:string, description:string, children:React.ReactNode}} props - Page heading, introduction and form.
 * @returns {React.JSX.Element} Responsive account-entry landmark.
 * Notes: App owns navigation chrome; this layout never reads or writes storage.
 */
export default function AuthLayout({ title, description, children }) {
  return (
    <main id="main-content" tabIndex={-1} className="relative isolate flex-1 overflow-hidden bg-stone-100 px-5 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div className="relative mx-auto w-full max-w-md">
          <div aria-hidden="true" className="absolute inset-0 -z-10 rotate-3 rounded-2xl border border-stone-300 bg-stone-200" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 -rotate-2 rounded-2xl border border-stone-300 bg-white" />
          <section aria-labelledby="auth-title" className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xl shadow-stone-900/10 sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-800">
              A fresh page
            </p>
            <h1 id="auth-title" className="mt-3 font-['Georgia',serif] text-4xl leading-tight tracking-tight">
              {title}
            </h1>
            <p className="mb-7 mt-3 text-sm leading-relaxed text-stone-700">
              {description}
            </p>
            {children}
            <p className="mt-6 border-t border-stone-200 pt-5 text-xs leading-relaxed text-stone-700">
              Local-only demo. Passwords are stored in plaintext in this browser. Do not use real or reused passwords or sensitive data.
            </p>
            <Link
              to="/"
              className={[
                'mt-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4',
                'focus-visible:ring-2 focus-visible:ring-violet-700',
              ].join(' ')}
            >
              Return to WriteSpace
            </Link>
          </section>
        </div>
        <section aria-labelledby="auth-samples-title" className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-600">
            Room for your next thought
          </p>
          <h2 id="auth-samples-title" className="mt-4 max-w-lg font-['Georgia',serif] text-4xl leading-tight sm:text-5xl">
            Every story starts with a blank page.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-stone-700">
            Illustrative samples, not saved posts. Your writing stays in this browser.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {['Finding your voice', 'Notes from the everyday', 'A little room to write'].map((title, index) => (
              <article
                key={title}
                className={[
                  'rounded-xl border border-stone-300 bg-white p-5',
                  index === 0 ? 'border-t-4 border-t-violet-700 sm:col-span-2' : '',
                ].join(' ')}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-800">
                  Illustrative sample
                </p>
                <h3 className="mt-3 font-['Georgia',serif] text-xl">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">
                  A thought, a sentence, a new beginning.
                </p>
                <p className="mt-5 text-xs font-medium text-stone-700">
                  Admin · Sample author
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

AuthLayout.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};
