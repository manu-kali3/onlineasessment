# Online Assessment Center

A virtual assessment center portal: secure test delivery for candidates,
automated screening and analytics for recruiters and assessors.

Built with **Next.js 16 (App Router) + React 19**, **Postgres on Neon**, and
**Drizzle ORM**. Frontend and API routes live in the same Next app.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 App Router, React 19 | Server components for dashboards, route handlers for the API, one deploy target |
| Database | Neon Postgres | HTTP driver (`@neondatabase/serverless`) — no persistent TCP socket, so it scales with serverless |
| ORM | Drizzle (`drizzle-orm`) | SQL-shaped schema, typed queries, lightweight migrations via `drizzle-kit` |
| Auth | `jose` HS256 JWT in an httpOnly cookie, `bcryptjs` hashes | Stateless session, no extra auth service |
| Validation | Zod at every route-handler boundary | Fail fast before touching the DB |

## Getting started

```bash
npm install
cp .env.example .env.local     # put your DATABASE_URL here
npm run db:push                # create tables from the schema
npm run db:seed                # questions, assessments, competencies
npm run dev
```

Open http://localhost:3000.

### Accounts

`db:seed` deliberately creates **no accounts** — the demo users share a published
password, so they must never exist on a public deployment. Create a real admin
once, then add recruiters from the admin area:

```bash
$env:ADMIN_EMAIL='you@yourdomain.com'
$env:ADMIN_PASSWORD='<12+ characters>'
npm run db:create-admin
```

### Signing in as staff

Registration only ever creates **candidate** accounts — deliberately, so nobody
can grant themselves recruiter or admin access by signing up. Staff accounts are
therefore created out of band:

```bash
# first admin
$env:ADMIN_EMAIL='you@yourdomain.com'
$env:ADMIN_PASSWORD='<12+ characters>'
$env:ADMIN_NAME='Site Administrator'
npm run db:create-admin

# a recruiter, optionally
$env:ADMIN_ROLE='recruiter'
npm run db:create-admin
```

Then sign in at `/login`. The role decides where you land and what you can open:

| Role | Lands on | Can open | Blocked from |
| --- | --- | --- | --- |
| `admin` | `/admin` | everything, plus candidate identities in blind review | — |
| `recruiter` | `/admin` | overview, assessments, analytics | `/admin/integrations` |
| `assessor` | `/admin` | overview, analytics | `/admin/integrations`, candidate identities |

Staff accounts are created with `email_verified = true`, so they sign in without
the confirmation step that candidates go through.

There is **no user-management screen yet** — `/admin` has overview,
assessments, analytics, and integrations, but no way to invite or promote
anyone. Every staff account therefore comes from the CLI until that exists.

For local development you can opt into the demo accounts explicitly with
`SEED_DEMO=1 npm run db:seed`. They all use the password `Passw0rd!`:

| Email | Role | Lands on |
| --- | --- | --- |
| `candidate@portal.test` | candidate | `/candidate` |
| `recruiter@portal.test` | recruiter | `/admin` |
| `assessor@portal.test` | assessor | `/admin` |
| `admin@portal.test` | admin | `/admin` |

If demo accounts were ever seeded against a real database, remove them with
`npm run db:revoke-demo` (preview it first with `db:revoke-demo:dry-run`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate SQL migrations from schema changes |
| `npm run db:push` | Push schema straight to the database (no migration files) |
| `npm run db:migrate` | Apply generated migration files |
| `npm run db:studio` | Browse data in Drizzle Studio |
| `npm run db:seed` | Idempotent content seed (competencies, questions, assessments) |
| `npm run db:seed:webdev` | Add the Web Development Fundamentals pack and invite every candidate |
| `npm run db:seed:ai` | Add the AI Fundamentals quiz (auto-graded) and invite every candidate |
| `npm run db:seed:design` | Add the Graphic Design Fundamentals pack and invite every candidate |
| `npm run db:create-admin` | Create a real admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| `npm run db:revoke-demo` | Delete the seeded demo accounts and their attempts |
| `npm run smoke` | Auth, role separation, and blind-review checks against a running server |
| `npm run smoke:flow` | Full candidate journey: start, autosave, submit, score |
| `npm run smoke:auth` | Register, verification gate, and enumeration resistance |
| `npm run smoke:reset-password` | Reset success path, single-use tokens, session revocation |
| `npm run smoke:reset` | Reset the fixture the flow test consumes |
| `npm run email:test you@example.com` | Send a real email through Resend |
| `npm run email:diagnose` | Resend domain status, recent send outcomes, live delivery probe |
| `npm run email:prove` | Register a real address and confirm the mail was delivered |
| `npm run smoke:login-page` | Assert the login page exposes no demo credentials |
| `npm run smoke:resend` | Resend cooldown, token rotation, and enumeration resistance |
| `npm run smoke:diagnose` | Registration/resend status reporting and rate limits |
| `npm run smoke:verify-link` | Follow the emailed verification link and confirm it verifies |
| `npm run smoke:staff` | Staff sign-in and per-role page access |
| `npm run db:prune-unverified` | Delete unverified accounts left by test runs |

The smoke scripts expect a server on `$BASE` (default `http://localhost:3120`),
and several sign in as the seeded demo accounts, so run `SEED_DEMO=1 npm run
db:seed` first if you are starting from a clean database.

`db:seed` uses `onConflictDoNothing` throughout, so it is safe to re-run. The
invitation tokens are deterministic for the same reason: the unique index is on
`token`, so random tokens would append duplicates each run.

The smoke scripts expect a server on `$BASE` (default `http://localhost:3120`).
`smoke:flow` consumes a seeded attempt and submits it, so re-run
`smoke:reset` before running it again.

## Data model

```
users ──< assessmentInvitations >── assessments ──< assessmentQuestions >── questions
  │                                        │                                   │
  └──< attempts >──────────────────────────┘                          competency
         ├──< responses >── questions
         ├──< proctorEvents
         └──< recordings
```

- **questions** hold the six item types (multiple choice, multi-select,
  true/false, free text, coding, video), with `correctAnswer` for objective
  grading and a weighted `rubric` for human-scored items.
- **attempts** carry `startedAt` (server-authoritative clock anchor), `score`,
  `percentile`, `competencyScores`, `integrityScore`, and the hardware check
  result.
- **responses** accumulate `durationMs` and `attemptsCount` per item, which is
  what powers the time-on-task analytics.
- **proctorEvents** are append-only signals with a reviewer `resolution`.
- **integrations** / **syncLogs** are the outbound ATS queue with retry state.
- **auditLogs** records every consequential action.

## Candidate flow

1. `/login` → role-based redirect.
2. `/candidate` — invitations with deadlines, status, and any score.
3. `/candidate/assessment/[id]` — accessibility controls, proctoring consent
   where required, and the timer summary. Pressing start begins the attempt.
4. `/api/attempts/start` freezes `startedAt` server-side and returns the
   attempt. Refreshing mid-test resumes the same attempt rather than restarting.
5. `/candidate/test/[id]` — the runner. One question at a time, per-type inputs,
   flag-for-review, autosave on navigation and every 15s, server-derived
   countdown, auto-submit at zero.
6. `/api/attempts/submit` auto-grades objective items, computes the weighted
   score and percentiles, and leaves subjective items queued for review.
7. `/candidate/results/[id]` — score, percentile, competency bars.

Accessibility: text-to-speech per prompt, high-contrast mode, and a time
extension percentage that scales the deadline client-side and is stored on the
user's profile.

## Recruiter / assessor flow

- `/admin` — pipeline counts, assessment pass rates, recent attempts, and an
  **integrity risk queue**.
- `/admin/assessments` — test authoring view: composition, pass mark, proctoring
  and blind-review flags, plus the question bank with validation state.
- `/admin/analytics` — per-item correct rate and median time-on-task, and the
  review queue.
- `/admin/attempts/[id]` — granular drill-down: time per question, edit counts,
  correctness, code test results, and the full proctoring timeline.
- `/admin/integrations` — ATS connections and the sync log.

## Design decisions worth knowing

**Blind review is enforced in the data layer, not the view.** `blindReview` on
an assessment strips name, email, DOB, and gender from the query results, not
just the UI. Candidates appear as stable per-attempt pseudonyms (`004-a7f2c1`).
Free-text and video answers are withheld entirely during blind review, because
candidates often identify themselves inside the answer.

This matters more than it first appears: a React Server Component payload is
serialised into the HTML, so hiding a name in JSX is not enough — an assessor
could read it in view-source. Names are therefore only ever selected for an
admin viewer. The smoke script asserts this and checks three pages × three
roles.

**Integrity signals flag, they never auto-fail.** Tab switches, fullscreen
exits, and clipboard attempts are recorded by `ProctorLock` and rolled into a
0-100 integrity score weighted by severity. `RiskQueue` routes anything under 90
to a human who clears or upholds it. Client-side JS is bypassable by anyone
motivated, so treating these as evidence rather than truth is the honest
position.

**The clock is server-side.** The countdown derives from
`startedAt + durationMin * extension`, not from a client timer, so refreshing,
clock-tampering, or opening a new tab cannot buy extra time.

**Free-text and video responses are left unscored deliberately.** Objective
items auto-grade on submit; everything with a rubric stays `submitted` until an
assessor scores it, and the attempt's overall score reflects only what has been
graded so far.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Credential check, sets session cookie |
| POST | `/api/auth/logout` | Clears session |
| POST | `/api/auth/register` | Create a candidate account, email a verification link |
| GET | `/api/auth/verify-email` | Consume a verification token, then redirect |
| GET | `/verify-email` | Result page; also forwards a bare `token` to the API route |
| POST | `/api/auth/resend-verification` | Re-send a verification link, rate limited |
| POST | `/api/auth/forgot-password` | Email a reset link (never reveals whether an account exists) |
| POST | `/api/auth/reset-password` | Consume a reset token, set a new password, revoke sessions |
| POST | `/api/attempts/start` | Creates/resumes the attempt, stamps `startedAt` |
| POST | `/api/attempts/response` | Autosave one answer, accumulate time-on-task |
| POST | `/api/attempts/submit` | Auto-grade, score, percentile, competency rollup |
| POST | `/api/attempts/proctor` | Ingest integrity signals, recompute integrity score |
| GET | `/api/admin/attempts/[id]` | Per-question analytics, redacted per blind review |
| POST | `/api/admin/proctor/resolve` | Assessor adjudication of proctoring events |

## Accounts, email, and password reset

Self-service registration creates **candidate accounts only**. Recruiter and
assessor access is granted by an admin, so nobody can escalate by signing up.

A new candidate must confirm their address before signing in. Staff accounts
provisioned by an admin are marked verified from the start, so the gate applies
only to self-registration.

**Email** goes through Resend. `RESEND_API_KEY` and `RESEND_FROM` live in
`.env.local` and **must also be set in the deployment environment**.

`RESEND_FROM` has to be an address on a domain verified in the Resend dashboard
(`no-reply@brevansoftwares.co.ke` is). Do **not** use `onboarding@resend.dev`:
that is a test-only address restricted to the account owner, and mail from it
will not pass SPF/DKIM for real candidates.

With no `RESEND_API_KEY` the app still runs, but mail is only logged to the
console — the response then carries a `devVerifyUrl` / `devResetUrl` and the
login page shows an "Email not configured" banner. That fallback exists for
local development only. A deployed instance missing the key silently discards
every verification and reset email, which is why the missing-key case is now
logged at `error` level and surfaced in the UI rather than swallowed.

Diagnose delivery with `npm run email:diagnose` (domain status, recent
`last_event` values, live probe) and `npm run email:prove` (registers a real
address and polls Resend until the event is `delivered`). Note that Resend
returning an id means *accepted*, not *delivered*; the `last_event` field is the
real signal, and a `bounced` result usually means the recipient mailbox does not
exist.

**Emailed links resolve against the real deployment, never localhost.**
`resolveAppUrl()` prefers an explicitly configured `NEXT_PUBLIC_APP_URL`, but
treats a localhost value as untrustworthy and falls back to `VERCEL_URL` and
then the incoming `Host` / `X-Forwarded-Proto` headers. A stale local value left
in the environment would otherwise send every candidate a dead link. Verified by
pointing the app at `http://localhost:3000` and confirming the emitted link
followed the request host instead.

**Tokens** are 256 bits of randomness, of which only a SHA-256 digest is stored.
A database leak therefore cannot be replayed against the live service. Digests
use SHA-256 rather than bcrypt deliberately: the input already has full entropy,
so a slow KDF would only add latency. Tokens expire after 60 minutes, are
single-use via `consumedAt`, and issuing a new one supersedes any earlier
unconsumed token for the same purpose.

**A password reset revokes existing sessions.** `users.sessionVersion` is
embedded in the session JWT and compared on every read, so a reset increments it
and every cookie issued under the old password stops working immediately.

**Passwords** have one hard rule — at least 12 characters — plus a 72-byte cap,
because bcrypt silently truncates beyond that. Character-class composition is
scored as feedback rather than enforced, following NIST's preference for length
over composition rules. Both the server and the reset form compute the same
strength score so the meter cannot disagree with what is accepted.

`/register` and `/resend-verification` **report whether an address is
registered**, returning a `status` of `registered`, `already_registered`,
`awaiting_verification`, `already_verified`, `not_registered`, or `rate_limited`.
This is a deliberate product decision — it turns "I registered but nothing
happened" into a specific, actionable answer — but it does mean anyone who can
reach those endpoints can test whether a given address holds an account here,
which is useful for targeted phishing or credential stuffing. `/forgot-password`
deliberately still returns a generic response, since a reset has no equivalent
"already exists" case worth exposing.

**Rate limiting** is the only thing bounding that exposure:

- per IP: 10 registrations and 20 resends per 10 minutes, returning 429 with a
  `Retry-After` header
- per address: 3 resends per 10 minutes, plus a 60-second mail cooldown so a
  link cannot be re-sent faster than that

Issuing a new link supersedes every outstanding verification token, so only the
most recent email works and an intercepted older link is useless. The resend
button appears in the two places a candidate gets stuck: the register
confirmation screen, and the sign-in page for an account that exists but is
still unverified.

### Seeded demo accounts cannot receive email

The seeded accounts use the `@portal.test` domain, which is reserved and does not
resolve. Any verification or reset email addressed to them is accepted by the
mail provider and then bounces or disappears, so an email-dependent flow cannot
be exercised with them. Use a real address — register one — when testing
verification or password reset. `npm run db:prune-unverified` clears the
unverified accounts that leave behind.

**Forgot-password stays generic on purpose.** It returns the same message whether
or not the address exists, which is the standard guidance for reset endpoints
because it is the one most often used to enumerate accounts. The trade-off is
that a user who mistypes their address gets no signal, so the page now spells
out the two things that actually help: check spam, or register if they never had
an account.

## Web Development Fundamentals

`npm run db:seed:webdev` adds a nine-item assessment covering HTML fundamentals,
CSS layout, JavaScript semantics, and web architecture. It is untimed and
unproctored, and every candidate account is invited automatically. Re-running is
safe: existing rows are left alone and only missing invitations are added.

The supplied content contained one interactive request — a model showing how
padding, border, and margin change an element's footprint. That is implemented as
a **coding** item (`totalWidth(box)`) with three test cases rather than as static
prose, since the runner already renders a code editor for `coding` questions.

All nine items are written responses with rubrics, so they auto-grade to nothing:
a submitted attempt stays `submitted` until an assessor scores it. That is the
known grading-UI gap, not a defect in the content. New candidates created after
the seed have to be invited separately, or re-run the seed.

## Content packs

Three question packs ship as separate, idempotent seed scripts. Each invites
every candidate account on every run, deriving invitation ids from a hash of the
user id so re-running cannot duplicate.

| Script | Assessment | Items | Grading |
| --- | --- | --- | --- |
| `db:seed:ai` | AI Fundamentals | 5 multiple-choice | **Fully auto-graded** — a score appears on submit |
| `db:seed:webdev` | Web Development Fundamentals | 1 coding, 8 written | Written items need an assessor |
| `db:seed:design` | Graphic Design Fundamentals | 1 coding, 5 written | Written items need an assessor |

Two supplied items asked for interactive demos — a box-model viewer and an
additive-vs-subtractive colour mixer. Both are implemented as **coding** items
(`totalWidth(box)` and `rgbToCmyk(r, g, b)`) with test cases rather than as
static prose, because the runner already renders a code editor and a coding item
can then be graded automatically. A live slider widget would need a new question
type plus a sandboxed runtime, which is not built.

The colour-conversion test cases are verified against a reference implementation
by `verify-graphic-design.cjs`, so no candidate is asked to hit an expectation
that standard CMYK conversion does not produce.

## Mobile

Navigation collapses to a toggle below `md`. The sheet closes on Escape, on an
outside click, and on navigation, and locks body scroll while open. Wide
assessment tables are wrapped in `TableWrap`, a focusable `role="region"`
container that scrolls horizontally instead of pushing the page sideways — six
columns do not fit a phone.

## Payments and site access

Access is **per course**, not per site. Each course has a `priceMinor` of zero
(free) or a positive amount, and a candidate pays only for the course they enrol
in — free courses start immediately, paid ones route to a per-course checkout.
This replaced the earlier global sign-in paywall, which charged everyone once
and unlocked everything.

A course's price is set from **Assessments → Pricing** in the admin area, and
questions are added from **Assessments → Add a question**. Both write through
`/api/admin/*` routes; the question form creates the bank row and the assessment
link in one step, and derives position from the current length so there is no
off-by-one or duplicate-position bug.

The checkout reads the price from the course row, never from the request, so a
client cannot pay less than a course costs. Amounts are integer minor units and
VAT is recorded per payment row.

### The gate is server-side, and it is per course

A client-side overlay is defeated by disabling JavaScript or reading
view-source, so it protects nothing. There is no overlay here. Two independent
checks enforce access:

- **Pages.** `requirePageUser` no longer checks payment at all, because the
  answer now depends on which course is being opened. The test runner page calls
  `canAccessCourse` itself and redirects to `/paywall?course=<id>` when access is
  missing, so a locked runner is never rendered.
- **APIs.** `/api/attempts/{start,response,submit,proctor}` each call
  `coursePaymentDenied`, which returns `402 PAYMENT_REQUIRED` with a
  `checkoutUrl`. This is not redundant: the APIs are reachable directly, and
  holding an invitation is *not* proof of payment — an admin can invite someone
  to a paid course, a seed can do it, or a course can be repriced after
  invitations went out. `smoke:granted` builds exactly that state and asserts
  every attempt API refuses it.

`smoke:paywall` asserts the absence of question text in the HTML of a locked
page, which is the check that would fail if this regressed to an overlay.

Amounts are integer minor units and the total is computed on the server from the
course row — a client-supplied amount is never trusted. VAT is stored per
payment row so a later price change cannot rewrite what was already charged.
There are deliberately no global price constants in `pricing.ts`; a module
constant is exactly how a stale price would silently get charged again.

### Enrolling in a course

On sign-in a candidate sees **Browse courses** (`/candidate/courses`), which lists
every published course whether or not they were invited, annotated with whether
they can start it. Enrolling is what creates the invitation:

- a free course enrols in place and is granted `course_access` with source `free`
- a paid course is **not** enrolled. The API returns the checkout URL and writes
  nothing, because taking money belongs to the payment endpoint and must never be
  triggered by a plain POST
- re-enrolling is a no-op rather than an error, so a double-click cannot create a
  duplicate invitation

### Paying outside the portal

A customer who paid the paybill or bank account directly has no portal payment to
show, so `/paywall?course=<id>` carries an **Already paid?** form that accepts the
confirmation code. Those rows land in `payment_references` as `pending`.

**Submitting a reference grants nothing by itself.** An M-Pesa confirmation code
is not secret — anyone who has ever paid you has seen one and the format is well
known — so an admin must verify it at **Payments** (`/admin/payments`), which
shows the candidate's name and email next to the code so it can be matched against
the real notification. Only `verify` calls `grantCourseAccess`. One open request
per course per candidate is allowed, so the queue cannot be spammed.

There is no undo on a verified reference: a mistake is corrected by granting
access directly, because revoking it after the candidate has started the test
would be worse.

**Completion comes from the webhook, never from the request that started it.**
An STK push returning 2xx only means the prompt was accepted; the customer still
has to authorise on their handset. The webhook requires the PayHero
`Authorization` header (failing closed if `PAYHERO_AUTH_TOKEN` is unset), is
idempotent because PayHero retries until it sees a 2xx, and compares the
reported amount against the recorded total — a partial or tampered callback is
refused rather than granting access. The client polls `/api/payments/status`
until access appears.

### PayHero endpoints

Taken from PayHero's own PHP SDK rather than a blog post, because a secondary
write-up gave `POST /api/v2/payments/initiate-stk-push`, which does not exist —
every call returned `Endpoint not found` and the failure looked identical to bad
credentials. The real paths are:

| Operation | Request |
| --- | --- |
| STK push | `POST https://backend.payhero.co.ke/api/v2/payments` |
| Transaction status | `GET /api/v2/transaction-status?reference=REF` |
| Account transactions | `GET /api/v2/transactions?page=N&per_page=M` |
| Service wallet balance | `GET /api/v2/wallets?wallet_type=service_wallet` |

STK body: `amount`, `phone_number`, `channel_id`, `external_reference`,
`callback_url`, `provider: "m-pesa"`.

### Operational caveat: the service wallet

The service wallet on account 8685 holds **50 KES and is in `PENDING` status**.
PayHero deducts its per-transaction service charge from this wallet, so it needs
topping up before real traffic. Check it with `npm run payments:check`, which
also lists recent transactions — useful for reconciling callbacks against the
provider ledger.

### Granting access without payment

For the operator's own accounts and test users, course access can be granted
directly. Given no course ids it grants every published course:

```bash
npm run db:grant-access you@example.com                     # all published
npm run db:grant-access you@example.com asmt-web-fundamentals  # just one
npm run db:grant-access -- --revoke you@example.com
npm run db:set-password you@example.com '<12+ chars>'
```

A manual grant writes a `course_access` row with source `admin`, plus a `payments`
row with `provider = 'manual'` and a payload naming the courses and the reason, so
access that did not come from money is distinguishable in reporting rather than
inflating revenue. The amounts on that row are zero for the same reason.

`set-password` bumps `sessionVersion`, so changing a password signs out existing
sessions as it should. Note that on Windows, pass the password via **stdin** if it
contains `$` or other characters the shell would otherwise eat:

```bash
echo 'your-password-here' | npm run db:set-password you@example.com
```

## Security notes

- `.env*` is gitignored; only `.env.example` is tracked. Keep the Neon URL and
  the Resend key local, and rotate either if it is ever exposed. The Resend key
  was pasted into this session, so treat it as compromised and rotate it in the
  Resend dashboard before going live.
- Login returns one generic message for both unknown users and wrong passwords,
  and hashes against a dummy value when the email is unknown so the two branches
  take comparable time. Request bodies are capped at 4KB and passwords at 72
  bytes, since bcrypt silently truncates beyond that.
- All candidate routes verify `attempts.candidateId` matches the session user, so
  one candidate cannot read or write another's attempt by guessing an ID.
- The autosave endpoint verifies the question belongs to the attempt's
  assessment, so a candidate cannot submit answers against arbitrary bank items.
- Proctoring media is stored behind a `consentGranted` flag with
  `retentionExpiresAt`, reflecting that recordings are personal data.
- Registration and password-reset bodies are capped at 8 KB and 2 KB
  respectively, and reset tokens are compared in constant time.

## Verified

`npm run typecheck` and `npm run build` both pass clean.

Registration and verification (20 assertions): weak passwords rejected, role
forced to candidate, account starts unverified, login blocked until verified,
bogus verification links rejected, tokens persisted as 64-character hex digests,
and duplicate registration returning byte-identical responses.

Password reset (18 assertions): weak new passwords rejected, reset accepted,
`sessionVersion` incremented, token marked consumed, a reused token rejected,
a pre-reset session cookie no longer reaching the dashboard, the new password
working and the old one failing.

Verification link (10 assertions, `smoke:verify-link`): the emailed URL points at
`/api/auth/verify-email` rather than the result page, following it sets
`email_verified` and marks the token consumed, the page reports "Email
confirmed" instead of "pending", and replaying the link is rejected. Run it
against a server with a deliberately invalid Resend key so the API hands back the
link it would have emailed.

Diagnosis and rate limiting (15 assertions): an unregistered address reports
`not_registered`, a fresh signup reports `registered`, an unverified address
reports `sent` and rotates its token, a repeat within the cooldown reports
`rate_limited` without issuing a second token, a duplicate signup reports
`awaiting_verification`, a confirmed address reports `already_verified`, and
exceeding the per-IP budget returns 429.

Real email delivery was confirmed through the Resend API (`email:test`).

Mobile and content packs (33 + 15 assertions, `smoke:mobile` and `smoke:ai`):
the menu toggle is wired with `aria-expanded`, `aria-controls` and
`aria-label`, the sheet is absent until opened, every table on every admin page
sits inside a focusable labelled scroll region, and the AI quiz auto-grades —
a three-of-five run returns 60, is marked `graded` with nothing awaiting review,
and fails the 80 pass mark.

Staff access (20 assertions, `smoke:staff`): each of admin, recruiter, and
assessor signs in, is redirected to `/admin`, receives a session cookie, can
open the pages its role allows, and is redirected away from
`/admin/integrations`, which is admin-only.

The rest is covered by the candidate, recruiter, and blind-review checks below,
all of which pass against the live database:

## Verified

`npm run typecheck` and `npm run build` both pass clean. Against a real Neon
database with the seeded data, the smoke scripts confirm:

- sign-in for all four roles, and session cookies
- role separation: a candidate hitting `/admin/integrations` is redirected to
  `/candidate`, a recruiter hitting `/candidate` to `/admin`
- 401 on every API route without a session, and 404 on another candidate's
  attempt
- blind review holds in the serialised payload for recruiters and assessors
  across `/admin`, `/admin/analytics`, and `/admin/attempts/[id]`, while admins
  still see names
- start → resume returns the same attempt and does not restart the timer
- autosave accumulates time-on-task across repeated saves
- submitting returns a score with `passed: null` and `itemsPendingReview: 1`
  while the free-text item is unreviewed
- resubmission returns 409, and proctor signals after submission return 409
- an attempt deadline is enforced server-side, not just by the client countdown

### Known gaps in the auth work

- **Rate limiting is in-process and therefore not a security boundary.** See the
  warning at the top of `src/lib/rate-limit.ts`: counters live in module memory,
  so on Vercel each instance keeps its own and the effective limit scales with
  instance count. An attacker can also spread requests across cold starts. For
  real protection this needs a shared store — Redis or a Postgres table keyed by
  IP plus action. The call sites need no changes to swap it.
- **`/forgot-password` has no rate limit at all.** It stays generic about
  existence, but it will happily send mail repeatedly for a known address.
- **Unverified accounts are only gated at login.** A self-registered but
  unverified user still occupies a row and can trigger verification emails.
- **Duplicate registration does not resend.** It reports the address is already
  registered and points at the resend flow, rather than mailing again from that
  endpoint.

## Not built yet

Honest gaps, in rough priority order:

- **Coding execution.** The runner stores code, but nothing runs it. `q-code-1`
  already carries test cases and a `codeResult` column with a compile-error
  field; wiring those to a sandbox (Judge0 or a firecracker container) is the
  next piece.
- **Video recording.** The video item is a placeholder button. Needs
  `MediaRecorder` plus object storage and a `recordings` row.
- **Live proctoring provider.** AI face and gaze detection would post to the
  existing `/api/attempts/proctor` endpoint with the `face_missing`,
  `multiple_faces`, and `gaze_off_screen` types that are already defined.
- **Outbound ATS push.** `integrations`, `syncLogs`, and the schema exist; the
  worker that drains the queue into Workday/Greenhouse/Lever does not.
- **Assessor grading UI.** Subjective responses are withheld during blind review
  and there is a `responses.assessorComment` column, but no screen to award a
  rubric score. This is the main gap: a submitted attempt stays `submitted`
  until someone can grade it.
- **No user management.** There is no screen for an admin to invite a
  recruiter, promote someone, deactivate an account, or reset another user's
  password. Staff accounts can only be created by running
  `db:create-admin` with database access.
- **Real-time websockets.** Results are read on navigation, not pushed.

## Environment notes

- Pin `next` to `>=16.3.8`. On 16.3.6 the build wrote NUL bytes into
  `.next/BUILD_ID`, `.next/server/pages-manifest.json`, and
  `.next/server/functions-config-manifest.json`, which made `next start` die at
  startup with `SyntaxError: Unexpected token`. Reproduced on Windows with Node
  24; 16.3.8 writes valid JSON.
- `AUTH_SECRET` must be set for anything real. The dev default triggers a
  console warning in production builds rather than failing silently.