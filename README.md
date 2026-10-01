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
| `npm run db:create-admin` | Create a real admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| `npm run db:revoke-demo` | Delete the seeded demo accounts and their attempts |
| `npm run smoke` | Auth, role separation, and blind-review checks against a running server |
| `npm run smoke:flow` | Full candidate journey: start, autosave, submit, score |
| `npm run smoke:auth` | Register, verification gate, and enumeration resistance |
| `npm run smoke:reset-password` | Reset success path, single-use tokens, session revocation |
| `npm run smoke:reset` | Reset the fixture the flow test consumes |
| `npm run email:test you@example.com` | Send a real email through Resend |
| `npm run smoke:login-page` | Assert the login page exposes no demo credentials |
| `npm run smoke:resend` | Resend cooldown, token rotation, and enumeration resistance |

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
`.env.local`. With no key configured the app still runs: messages are logged to
the console and the affected response includes a `devVerifyUrl` / `devResetUrl`
so the flow stays completable locally. Note that until a sending domain is
verified in the Resend dashboard, mail can only be delivered to Resend's own
test addresses (`delivered@resend.dev`, `onboarding@resend.dev`) — `example.com`
is rejected outright.

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

Neither `/register` nor `/forgot-password` reveals whether an address is
registered: both return an identical 200 for known and unknown addresses, and a
failed verification or reset returns one generic message that cannot be used to
probe which tokens were ever valid.

**Resending a verification link** is offered in two places: on the register
confirmation screen, and on the sign-in page for an account that exists but is
still unverified. Because it is unauthenticated, it carries a 60-second cooldown
per address — a second request inside that window is a silent no-op returning the
same response, so the endpoint cannot be used to mail-bomb someone. Issuing a new
link supersedes every outstanding verification token, so only the most recent
email works and an intercepted older link is useless.

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

Verification resend (15 assertions): an immediate resend after registration is a
no-op, a resend past the cooldown rotates the token and consumes the previous
one, a second resend is silently suppressed, and unknown or already-verified
addresses return the identical response.

Real email delivery was confirmed through the Resend API (`email:test`).

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

- **No rate limiting.** The register, forgot-password, and reset endpoints are
  unauthenticated and unbounded, so they can be used for credential stuffing or
  to mail-bomb an address. The resend-verification endpoint has a 60-second
  per-address cooldown, but that is a single guard rather than a real limiter.
  All of these need per-IP and per-account limits, ideally durable across
  instances rather than in-process.
- **Unverified accounts are only gated at login.** A self-registered but
  unverified user still occupies a row and can trigger verification emails.
- **Duplicate registration does not resend.** It returns the generic response
  without mailing again, which avoids turning the endpoint into a mail relay but
  leaves a user who lost the first email to use the reset flow instead.

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
- **Real-time websockets.** Results are read on navigation, not pushed.

## Environment notes

- Pin `next` to `>=16.3.8`. On 16.3.6 the build wrote NUL bytes into
  `.next/BUILD_ID`, `.next/server/pages-manifest.json`, and
  `.next/server/functions-config-manifest.json`, which made `next start` die at
  startup with `SyntaxError: Unexpected token`. Reproduced on Windows with Node
  24; 16.3.8 writes valid JSON.
- `AUTH_SECRET` must be set for anything real. The dev default triggers a
  console warning in production builds rather than failing silently.