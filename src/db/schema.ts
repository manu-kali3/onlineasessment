import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", [
  "candidate",
  "recruiter",
  "assessor",
  "admin",
]);

export const assessmentStatus = pgEnum("assessment_status", [
  "draft",
  "published",
  "archived",
]);

export const attemptStatus = pgEnum("attempt_status", [
  "invited",
  "in_progress",
  "submitted",
  "expired",
  "graded",
]);

export const questionType = pgEnum("question_type", [
  "multiple_choice",
  "multi_select",
  "true_false",
  "free_text",
  "coding",
  "video",
]);

export const deliveryMode = pgEnum("delivery_mode", ["timed", "untimed"]);

export const proctorEventType = pgEnum("proctor_event_type", [
  "tab_switch",
  "fullscreen_exit",
  "window_blur",
  "copy_attempt",
  "paste_attempt",
  "face_missing",
  "multiple_faces",
  "gaze_off_screen",
  "audio_noise",
  "fullscreen_enter",
]);

export const proctorSeverity = pgEnum("proctor_severity", [
  "info",
  "warning",
  "critical",
]);

export const tokenPurpose = pgEnum("token_purpose", [
  "email_verification",
  "password_reset",
]);

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "completed",
  "failed",
]);

export const referenceStatus = pgEnum("reference_status", [
  "pending",
  "verified",
  "rejected",
]);

export const integrationProvider = pgEnum("integration_provider", [
  "workday",
  "greenhouse",
  "lever",
  "icims",
  "smartrecruiters",
]);

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    role: userRole("role").notNull().default("candidate"),
    // PII kept separate so blind-review mode can strip it from assessor views
    dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
    gender: text("gender"),
    /**
     * Candidates must confirm ownership of the address before they can sign in.
     * Staff accounts created by an admin are marked verified directly, so this
     * gate applies only to self-registration.
     */
    emailVerified: boolean("email_verified").notNull().default(false),
    /** Bumped on password change so every existing session cookie stops working. */
    sessionVersion: integer("session_version").notNull().default(1),
    /**
     * Set once a completed payment is recorded, granting permanent access.
     * Kept on the user rather than derived from the payments table so the access
     * check on every request is a column read we are already making.
     */
    accessGrantedAt: timestamp("access_granted_at", { withTimezone: true }),
    accessibilityProfile: jsonb("accessibility_profile")
      .$type<{
        textToSpeech?: boolean;
        highContrast?: boolean;
        timeExtensionPct?: number;
        screenReaderVerified?: boolean;
      }>()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    index("users_role_idx").on(t.role),
  ],
);

/**
 * Single-use tokens for email verification and password reset.
 *
 * Only a SHA-256 hash of the token is stored, so a database leak cannot be
 * replayed against the live service. Tokens are short-lived, and `consumedAt`
 * makes them single-use even if one is somehow reused before expiry.
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: tokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_tokens_hash_idx").on(t.tokenHash),
    index("auth_tokens_user_idx").on(t.userId),
    index("auth_tokens_expiry_idx").on(t.expiresAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

/**
 * One row per checkout attempt.
 *
 * Amounts are stored as integer minor units (cents) rather than floats, because
 * a float cannot represent 10.50 exactly and reconciliation against a provider
 * ledger will eventually disagree by a cent. The VAT rate is stored alongside
 * the computed VAT amount so a later price change cannot retroactively alter
 * what was actually charged.
 */
export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("payhero"),
    status: paymentStatus("status").notNull().default("pending"),
    /** Net charge before VAT, in minor units. */
    amountMinor: integer("amount_minor").notNull(),
    /** VAT in minor units. */
    vatMinor: integer("vat_minor").notNull(),
    /** amountMinor + vatMinor — what the customer was asked to pay. */
    totalMinor: integer("total_minor").notNull(),
    currency: text("currency").notNull().default("KES"),
    /** The reference we send to the provider and receive back on the callback. */
    externalReference: text("external_reference").notNull(),
    /**
     * Which course this payment unlocks. Null means site-wide access, which is
     * what the original global paywall recorded.
     */
    assessmentId: text("assessment_id").references(() => assessments.id, {
      onDelete: "set null",
    }),
    /** The provider's own transaction id, once known. */
    providerReference: text("provider_reference"),
    channelId: text("channel_id"),
    phoneNumber: text("phone_number"),
    /** Raw provider payload, kept for reconciliation and disputes. */
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("payments_external_reference_idx").on(t.externalReference),
    index("payments_user_idx").on(t.userId),
    index("payments_status_idx").on(t.status),
  ],
);

/**
 * Which courses a candidate can currently start.
 *
 * A row is written when a course is free, when its payment completes, or when an
 * admin grants it. Expiry is supported so a course can be rented rather than
 * owned, though nothing sets it today.
 */
export const courseAccess = pgTable(
  "course_access",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    /** How the access was obtained, for reporting. */
    source: text("source").notNull(), // "free" | "payment" | "admin"
    grantedBy: text("granted_by").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("course_access_user_course_idx").on(t.userId, t.assessmentId),
    index("course_access_user_idx").on(t.userId),
  ],
);

/**
 * A payment reference a candidate submits after paying outside the portal —
 * for example an M-Pesa confirmation code from paying the paybill directly, or
 * a bank transfer reference.
 *
 * These start as `pending` and only grant access once an admin verifies them,
 * because a reference code is trivially guessable and must never unlock a course
 * on its own.
 */
export const paymentReferences = pgTable(
  "payment_references",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    /** The code the customer pasted, e.g. an M-Pesa confirmation. */
    referenceCode: text("reference_code").notNull(),
    /** Where the customer says they paid from. */
    channel: text("channel"),
    amountMinor: integer("amount_minor"),
    status: referenceStatus("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    index("payment_references_user_idx").on(t.userId),
    index("payment_references_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Question bank + tests                                               */
/* ------------------------------------------------------------------ */

export const competencies = pgTable("competencies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});

export const questions = pgTable(
  "questions",
  {
    id: text("id").primaryKey(),
    type: questionType("type").notNull(),
    prompt: text("prompt").notNull(),
    /** Multiple choice / multi-select options */
    options: jsonb("options")
      .$type<{ id: string; label: string }[]>()
      .default([]),
    /** Reference answer for objective scoring */
    correctAnswer: jsonb("correct_answer").$type<string | string[] | boolean>(),
    /** Rubric for free text / video / SJIP-style assessments */
    rubric: jsonb("rubric").$type<
      { criterion: string; weight: number; levels: string[] }[]
    >(),
    /** For coding questions: starter code, language, test harness */
    codingSpec: jsonb("coding_spec").$type<{
      language: string;
      starterCode: string;
      functionName: string;
      testCases: { input: string; expected: string }[];
    }>(),
    competencyId: text("competency_id").references(() => competencies.id),
    /** 0-100, used for difficulty analytics and norming */
    difficulty: real("difficulty"),
    timeLimitSec: integer("time_limit_sec"),
    isValidated: boolean("is_validated").notNull().default(false),
    authorId: text("author_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("questions_type_idx").on(t.type)],
);

export const assessments = pgTable(
  "assessments",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    status: assessmentStatus("status").notNull().default("draft"),
    delivery: deliveryMode("delivery").notNull().default("timed"),
    durationMin: integer("duration_min").notNull().default(60),
    /** Percentile baseline used for ranking ("ideal baseline" or norm group) */
    normGroup: text("norm_group"),
    passMark: real("pass_mark"),
    /**
     * Per-course price in minor units. Zero means the course is free and needs
     * no payment. Replaces the earlier global sign-in paywall: a candidate pays
     * only for the specific course they enrol in.
     */
    priceMinor: integer("price_minor").notNull().default(0),
    /** VAT charged on top of priceMinor, also in minor units. */
    vatMinor: integer("vat_minor").notNull().default(0),
    requireProctoring: boolean("require_proctoring").notNull().default(false),
    blindReview: boolean("blind_review").notNull().default(true),
    shuffleQuestions: boolean("shuffle_questions").notNull().default(true),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("assessments_status_idx").on(t.status)],
);

export const assessmentQuestions = pgTable(
  "assessment_questions",
  {
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    weight: real("weight").notNull().default(1),
  },
  (t) => [
    uniqueIndex("assessment_questions_pk").on(t.assessmentId, t.questionId),
    index("assessment_questions_order_idx").on(t.assessmentId, t.position),
  ],
);

export const assessmentCompetencies = pgTable(
  "assessment_competencies",
  {
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    competencyId: text("competency_id")
      .notNull()
      .references(() => competencies.id, { onDelete: "cascade" }),
    weight: real("weight").notNull().default(1),
  },
  (t) => [uniqueIndex("assessment_competencies_pk").on(t.assessmentId, t.competencyId)],
);

/* ------------------------------------------------------------------ */
/* Candidate invitations + attempts                                     */
/* ------------------------------------------------------------------ */

export const assessmentInvitations = pgTable(
  "assessment_invitations",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by").references(() => users.id),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: attemptStatus("status").notNull().default("invited"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_token_idx").on(t.token),
    index("invitations_candidate_idx").on(t.candidateId),
    index("invitations_assessment_idx").on(t.assessmentId),
  ],
);

export const attempts = pgTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    invitationId: text("invitation_id").references(() => assessmentInvitations.id),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: attemptStatus("status").notNull().default("invited"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** Total score as percent, null until graded */
    score: real("score"),
    percentile: real("percentile"),
    passed: boolean("passed"),
    /** Snapshot of per-competency breakdown */
    competencyScores: jsonb("competency_scores").$type<
      Record<string, number>
    >(),
    integrityScore: real("integrity_score"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("attempts_candidate_idx").on(t.candidateId),
    index("attempts_assessment_idx").on(t.assessmentId),
    index("attempts_status_idx").on(t.status),
  ],
);

export const responses = pgTable(
  "responses",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    answer: jsonb("answer").$type<
      string | string[] | boolean | { code: string; language: string } | null
    >(),
    isCorrect: boolean("is_correct"),
    /** Time-on-task analytics: ms spent on this item */
    durationMs: integer("duration_ms"),
    /** Number of edits the candidate made */
    attemptsCount: integer("attempts_count").notNull().default(0),
    /** For coding: aggregated run results */
    codeResult: jsonb("code_result").$type<{
      passed: boolean;
      totalTests: number;
      failedTests: number;
      compileError?: string;
    }>(),
    awardedScore: real("awarded_score"),
    assessorComment: text("assessor_comment"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("responses_attempt_question_pk").on(t.attemptId, t.questionId),
    index("responses_attempt_idx").on(t.attemptId),
  ],
);

/* ------------------------------------------------------------------ */
/* Proctoring                                                          */
/* ------------------------------------------------------------------ */

export const proctorEvents = pgTable(
  "proctor_events",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    type: proctorEventType("type").notNull(),
    severity: proctorSeverity("severity").notNull().default("info"),
    /** Provider payload: bounding box, face count, confidence, etc. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    reviewed: boolean("reviewed").notNull().default(false),
    resolution: text("resolution"),
    reviewedBy: text("reviewed_by").references(() => users.id),
  },
  (t) => [
    index("proctor_events_attempt_idx").on(t.attemptId),
    index("proctor_events_severity_idx").on(t.severity),
  ],
);

export const recordings = pgTable("recordings", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id")
    .notNull()
    .references(() => attempts.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "webcam" | "screen" | "answer_video"
  storageKey: text("storage_key").notNull(),
  consentGranted: boolean("consent_granted").notNull().default(false),
  retentionExpiresAt: timestamp("retention_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/* ATS integration                                                     */
/* ------------------------------------------------------------------ */

export const integrations = pgTable("integrations", {
  id: text("id").primaryKey(),
  provider: integrationProvider("provider").notNull(),
  name: text("name").notNull(),
  baseUrl: text("base_url"),
  encryptedCredentials: text("encrypted_credentials"),
  active: boolean("active").notNull().default(true),
  fieldMapping: jsonb("field_mapping").$type<Record<string, string>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const syncLogs = pgTable(
  "sync_logs",
  {
    id: text("id").primaryKey(),
    integrationId: text("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    attemptId: text("attempt_id").references(() => attempts.id),
    direction: text("direction").notNull(), // "inbound" | "outbound"
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("pending"), // pending|success|failed
    error: text("error"),
    attemptsMade: integer("attempts_made").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sync_logs_integration_idx").on(t.integrationId)],
);

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_logs_entity_idx").on(t.entityType, t.entityId)],
);

/* ------------------------------------------------------------------ */
/* Relationships                                                       */
/* ------------------------------------------------------------------ */

export const usersRelations = {
  invitations: assessmentInvitations,
  attempts: attempts,
};

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type Attempt = typeof attempts.$inferSelect;
export type Response = typeof responses.$inferSelect;
export type ProctorEvent = typeof proctorEvents.$inferSelect;
export type Competency = typeof competencies.$inferSelect;
export type Invitation = typeof assessmentInvitations.$inferSelect;