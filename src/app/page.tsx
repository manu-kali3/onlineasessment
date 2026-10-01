import Link from "next/link";

const features = [
  {
    title: "Guided test delivery",
    body: "Timed modules, autosave, and a server-locked clock so nothing depends on the candidate's browser.",
  },
  {
    title: "Objective + assessor grading",
    body: "Instant scoring for objective items, rubric-based human review for video and written responses.",
  },
  {
    title: "Normed benchmarking",
    body: "Every score is percentile-ranked against a norm group so recruiters see relative standing, not just raw marks.",
  },
  {
    title: "Blind review",
    body: "Assessor views hide name, email, and demographics until the review phase is closed.",
  },
  {
    title: "Integrity signals",
    body: "Browser lockdown events and webcam AI flags roll up into an integrity score for human adjudication.",
  },
  {
    title: "ATS integration",
    body: "Scores push to Workday, Greenhouse, or Lever through an auditable outbound sync queue.",
  },
];

export default function Home() {
  return (
    <main className="min-h-dvh">
      <header className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-sm font-bold tracking-tight">
            Assessment Center
          </span>
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <p className="tag mb-4">Virtual testing room</p>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-5xl">
          High-stakes evaluation, without a room to book.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
          One platform for the candidate experience and the recruiter back office:
          secure delivery, automated scoring, and the analytics that make a hiring
          decision defensible.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <article key={f.title} className="panel p-5">
            <h2 className="text-base font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{f.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}