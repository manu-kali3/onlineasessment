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
    hardwareCheck: jsonb("hardware_check").$type<{
      camera: boolean;
      microphone: boolean;
      downloadMbps: number;
      passed: boolean;
    }>(),
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