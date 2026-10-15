# WriteSpace

A browser-local writing and reading demonstration built with React 18, Vite 5, JavaScript JSX, React Router 6 and Tailwind 3. There is no backend, application API, shared database or server-owned account store.

## Start locally

Requires Node 22 and npm. From the repository root:

```sh
cd frontend
npm ci --no-bin-links
npm run dev -- --host 127.0.0.1 --port 5173
```

Open the URL printed by Vite. Tooling port examples are in `frontend/.env.example`; there are no application secrets or API environment variables. Use loopback interfaces for development, not a public development server.

## Demo journeys

- Discover the public landing, illustrative cards and up to three actual saved posts.
- Register a demo writer or sign in with the built-in **admin / admin** account.
- Read, create, edit and delete plain-text posts. Writers can change only their own posts; Admins can change any post. Deletion asks for browser confirmation.
- Admins can review four dashboard counters and five recent posts, and create writer/Admin accounts.
- User deletion is deliberately disabled for every account until the owner approves what should happen to its authored posts. Built-in and current-Admin safeguards are displayed separately. No retention/cascade/reassignment policy is invented.

## Important limitations

**Do not enter real or reused passwords, confidential writing, or sensitive personal information.** Passwords are stored in plaintext, and local sessions/roles can be forged with browser tools. Client route/ownership checks are usability safeguards, not production authorization. HTTPS and AWS do not change this trust boundary.

Only three localStorage keys are used: `writespace_posts`, `writespace_users`, `writespace_session`. Records remain in the current browser profile and origin, survive reloads when storage permits, and never synchronize between devices/users. Clearing site data can permanently remove them. Concurrent tabs can overwrite newer changes; there is no locking, backup or recovery. Illustrative cards are not persisted or counted as real posts.

Corrupt or unavailable storage renders safe empty/warning states. A mutation refuses to overwrite a collection after a failed read and displays a failure instead of claiming success. If registration saves an account but cannot save its session, the form explains that partial outcome and offers login. Logout failure leaves a visible retry message.

Username comparison is exact (including case); the literal `admin` is reserved. Built-in Admin has ID `admin`; stored accounts use UUIDs. Dashboard labels preserve the source's duplicate `Total users` slot rather than invent a new metric.

## Verification

```sh
cd frontend
npm test
npm run build
node node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```

Vitest tests use isolated browser-storage test doubles at the storage boundary. Playwright tests run a real production preview and assert on browser records and complete click-driven journeys; no API is mocked because no API exists. Playwright configuration is tier-local, single-worker, and supports `PLAYWRIGHT_BASE_URL` (default `http://localhost:4173`). Screenshots and text-based accessibility/HTML/style evidence are saved for reviewer inspection. The pipeline's `test_report.yaml` records actual results; authored tests alone do not prove a run passed.

## Static container and deployment

```sh
docker build -t writespace:local frontend
docker run --rm -p 8080:80 writespace:local
```

A two-stage Node/nginx image serves `frontend/dist`. The container binds port 80 and `GET /` serves the entry point. React routes fall back to index.html; missing `/assets/` paths return 404. The container holds only static files; replacing it does not back up or delete browser records.

The assembled pipeline targets an AWS static frontend service through ECR/ECS/ALB/CloudFront. Developer supplies source/image configuration; downstream DevOps owns deployment and platform infrastructure. No AWS account, region, sizing or release success is assumed here.

The root `vercel.json` preserves the exact source-required rewrite only. If Vercel is used as an alternative, configure its project root to `frontend` externally; this file deliberately has no build/framework keys. An operator must clarify whether Vercel wording is alternative or additional to the AWS run target.

## Implementation notes and remaining decisions

- `frontend/src/helpers/` centralizes local persistence and permission-checked operations.
- `frontend/src/components/` contains shallow reusable controls; `frontend/src/pages/` owns route content.
- BrowserRouter is defined once in `src/main.jsx`. No Context API, state library, rich-text insertion or custom CSS stylesheet is introduced.
- The editorial paper-neutral landing with localized color accents follows the stage's UI prohibition on full-page indigo/violet/pink gradient wallpaper; this is an explicit deviation from the upstream wallpaper treatment. The functional routes, named content, record shapes and storage boundary are retained.
- Numeric performance thresholds and AWS sizing are unspecified; do not treat observations as contractual SLOs.
- Compatible dependency updates reduce audit findings, but the clean container install still reports 16 advisories (6 moderate, 8 high, 2 critical), including build/test tooling. Do not expose development or test servers publicly. Production Router 6 residual advisories require an approved major upgrade to fully resolve; review `npm audit` before any real release.
- All six feature slices passed scoped unit/component verification. All 51 browser journeys passed cumulatively after browser provisioning and a whitespace-only Admin test correction. The Vite production bundle and static Docker image both built successfully. These results verify a demo, not production security or an AWS deployment.

The pipeline plan, worklist, test report and metadata are workspace handoff artifacts, intentionally excluded from Git. The repository includes the final source graph for downstream specification synthesis.
