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
npm run db:seed                # demo users, questions, assessments, attempts
npm run dev
```

Open http://localhost:3000.

### Demo accounts

All use the password `Passw0rd!`.

| Email | Role | Lands on |
| --- | --- | --- |
| `candidate@portal.test` | candidate | `/candidate` |
| `recruiter@portal.test` | recruiter | `/admin` |
| `assessor@portal.test` | assessor | `/admin` |
| `admin@portal.test` | admin | `/admin` |

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
| `npm run db:seed` | Idempotent demo data |

`db:seed` uses `onConflictDoNothing` throughout, so it is safe to re-run.

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
3. `/candidate/assessment/[id]` — accessibility controls, recording consent, and
   the **system check**: camera + microphone via `getUserMedia` and a timed
   download from `/api/system-check/payload` against a 5 Mbps floor.
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

**Blind review is enforced server-side.** `blindReview` on an assessment strips
name, email, DOB, and gender from assessor queries, not just the UI. Candidates
appear as stable per-attempt pseudonyms (`004-a7f2c1`). Free-text and video
answers are withheld entirely during blind review, because candidates often
identify themselves inside the answer.

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
| POST | `/api/attempts/start` | System-check gate; creates/resumes attempt, stamps `startedAt` |
| POST | `/api/attempts/response` | Autosave one answer, accumulate time-on-task |
| POST | `/api/attempts/submit` | Auto-grade, score, percentile, competency rollup |
| POST | `/api/attempts/proctor` | Ingest integrity signals, recompute integrity score |
| GET | `/api/system-check/payload` | 256 KB stream for the bandwidth probe |
| GET | `/api/admin/attempts/[id]` | Per-question analytics, redacted per blind review |
| POST | `/api/admin/proctor/resolve` | Assessor adjudication of proctoring events |

## Security notes

- `.env*` is gitignored; only `.env.example` is tracked. Keep the Neon URL local
  and rotate it if it is ever exposed.
- Login returns one generic message for both unknown users and wrong passwords,
  to avoid account enumeration.
- All candidate routes verify `attempts.candidateId` matches the session user, so
  one candidate cannot read or write another's attempt by guessing an ID.
- Proctoring media is stored behind a `consentGranted` flag with
  `retentionExpiresAt`, reflecting that recordings are personal data.

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
- **Real-time websockets.** Results are read on navigation, not pushed.