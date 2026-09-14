import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import {
  diagnosticCases,
  outboxEvents,
  questionnaireSubmissions,
  type OutboxEvent,
  type QuestionnaireSubmission,
} from "../../../drizzle/schema";
import type { R1Database, R1Executor } from "../database";
import { newR1Id } from "../ids";
import {
  outboxDedupeKey,
  parseOutboxEnvelope,
  parseOutboxEvent,
  type AppendOutboxEvent,
} from "../events/contracts";
import {
  canonicalSerialize,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";

export type { AppendOutboxEvent } from "../events/contracts";

type ScoringSubmissionEvent = Extract<
  AppendOutboxEvent,
  { eventType: "questionnaire.submitted_for_scoring" }
>;

export type ClaimedScoringEvent = {
  outboxEvent: OutboxEvent;
  submission: QuestionnaireSubmission;
  event: ScoringSubmissionEvent;
};

export type QuarantinedScoringEvent = {
  quarantined: true;
  outboxEventId: string;
  errorCode: "input_inconsistent";
};

export type ScoringClaimResult = ClaimedScoringEvent | QuarantinedScoringEvent;

export type ScoringOutboxLeaseFence = {
  outboxEventId: string;
  customerAccountId: string;
  diagnosticCaseId: string;
  submissionId: string;
  leaseOwner: string;
  leaseVersion: number;
  now: Date;
};

export type LockedScoringLeaseTarget = {
  outboxEvent: OutboxEvent;
  submission: QuestionnaireSubmission;
  caseStatus: string;
  caseStateVersion: number;
};

export type ScoringOutboxErrorCode =
  | "configuration_unavailable"
  | "input_inconsistent"
  | "persistence_conflict"
  | "technical_failure"
  | "retry_exhausted";

export class OutboxDedupeConflictError extends Error {
  constructor() {
    super("Outbox dedupe key already exists with divergent event facts");
    this.name = "OutboxDedupeConflictError";
  }
}

export class ScoringOutboxPersistenceError extends Error {
  constructor(message: string) {
    super(`Scoring outbox persistence is inconsistent: ${message}`);
    this.name = "ScoringOutboxPersistenceError";
  }
}

function decodeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ScoringOutboxPersistenceError("payload is not valid JSON");
  }
}

function persistedEvent(row: OutboxEvent): AppendOutboxEvent {
  return parseOutboxEvent({
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventType: row.eventType,
    privacySafePayload: decodeJson(row.privacySafePayload),
    createdAt: row.createdAt,
  });
}

function sameEventFacts(left: AppendOutboxEvent, right: AppendOutboxEvent): boolean {
  return left.aggregateType === right.aggregateType &&
    left.aggregateId === right.aggregateId &&
    left.eventType === right.eventType &&
    canonicalSerialize(left.privacySafePayload as CanonicalJsonValue) ===
      canonicalSerialize(right.privacySafePayload as CanonicalJsonValue);
}

export async function appendOutboxEvent(
  executor: R1Executor,
  event: AppendOutboxEvent,
): Promise<void> {
  const parsed = parseOutboxEvent(event);
  const now = parsed.createdAt ?? new Date();
  const envelope = parseOutboxEnvelope({
    ...parsed,
    id: newR1Id("outbox"),
    eventId: newR1Id("event"),
    dedupeKey: outboxDedupeKey(parsed),
    status: "pending",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  // A status-transition collision must still abort its surrounding command.
  // Only the immutable questionnaire scoring command has a safe replay
  // contract: its dedupe key is anchored to one submission snapshot.
  if (parsed.eventType !== "questionnaire.submitted_for_scoring") {
    await executor.insert(outboxEvents).values(envelope);
    return;
  }
  await executor
    .insert(outboxEvents)
    .values(envelope)
    .onDuplicateKeyUpdate({ set: { id: sql`${outboxEvents.id}` } });

  const rows = await executor
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.dedupeKey, envelope.dedupeKey))
    .limit(1);
  const persisted = rows[0];
  if (!persisted || !sameEventFacts(persistedEvent(persisted), parsed)) {
    throw new OutboxDedupeConflictError();
  }
}

function scoringEvent(row: OutboxEvent): ScoringSubmissionEvent {
  const event = persistedEvent(row);
  if (event.eventType !== "questionnaire.submitted_for_scoring") {
    throw new ScoringOutboxPersistenceError("event is not a scoring submission");
  }
  return event;
}

export async function claimOneScoringEvent(
  database: R1Database,
  input: { leaseOwner: string; now: Date; leaseExpiresAt: Date },
): Promise<ScoringClaimResult | null> {
  if (input.leaseExpiresAt.getTime() <= input.now.getTime()) {
    throw new ScoringOutboxPersistenceError("lease expiry must be in the future");
  }
  return database.transaction(async tx => {
    const candidates = await tx
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.eventType, "questionnaire.submitted_for_scoring"),
          or(
            and(
              eq(outboxEvents.status, "pending"),
              or(isNull(outboxEvents.nextAttemptAt), lte(outboxEvents.nextAttemptAt, input.now)),
            ),
            and(
              eq(outboxEvents.status, "processing"),
              lte(outboxEvents.leaseExpiresAt, input.now),
            ),
          ),
        ),
      )
      .orderBy(asc(outboxEvents.createdAt), asc(outboxEvents.id))
      .limit(1)
      .for("update");
    const candidate = candidates[0];
    if (!candidate) return null;

    let event: ScoringSubmissionEvent | null = null;
    let submission: QuestionnaireSubmission | null = null;
    try {
      event = scoringEvent(candidate);
      const submissionRows = await tx
        .select()
        .from(questionnaireSubmissions)
        .where(eq(questionnaireSubmissions.id, candidate.aggregateId))
        .limit(1);
      submission = submissionRows[0] ?? null;
      if (!submission) throw new ScoringOutboxPersistenceError("submission linkage is absent");
      const caseRows = await tx
        .select({
          id: diagnosticCases.id,
          customerAccountId: diagnosticCases.customerAccountId,
        })
        .from(diagnosticCases)
        .where(
          and(
            eq(diagnosticCases.id, submission.diagnosticCaseId),
            eq(diagnosticCases.customerAccountId, submission.customerAccountId),
          ),
        )
        .limit(1);
      const caseRow = caseRows[0];
      if (
        !caseRow ||
        event.aggregateId !== submission.id ||
        event.privacySafePayload.caseId !== submission.diagnosticCaseId
      ) {
        throw new ScoringOutboxPersistenceError("event target is outside its owner/case fence");
      }
    } catch {
      const quarantined = await tx
        .update(outboxEvents)
        .set({
          status: "failed",
          attemptCount: sql`${outboxEvents.attemptCount} + 1`,
          leaseOwner: null,
          leaseVersion: candidate.leaseVersion + 1,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          lastAttemptAt: input.now,
          publishedAt: null,
          lastErrorCode: "input_inconsistent",
          updatedAt: input.now,
        })
        .where(
          and(
            eq(outboxEvents.id, candidate.id),
            eq(outboxEvents.leaseVersion, candidate.leaseVersion),
            or(
              and(
                eq(outboxEvents.status, "pending"),
                or(isNull(outboxEvents.nextAttemptAt), lte(outboxEvents.nextAttemptAt, input.now)),
              ),
              and(
                eq(outboxEvents.status, "processing"),
                lte(outboxEvents.leaseExpiresAt, input.now),
              ),
            ),
          ),
        );
      if (Number(quarantined[0].affectedRows) !== 1) return null;
      return {
        quarantined: true,
        outboxEventId: candidate.id,
        errorCode: "input_inconsistent",
      } as const;
    }

    const nextLeaseVersion = candidate.leaseVersion + 1;
    const result = await tx
      .update(outboxEvents)
      .set({
        status: "processing",
        attemptCount: sql`${outboxEvents.attemptCount} + 1`,
        leaseOwner: input.leaseOwner,
        leaseVersion: nextLeaseVersion,
        leaseExpiresAt: input.leaseExpiresAt,
        lastAttemptAt: input.now,
        lastErrorCode: null,
        updatedAt: input.now,
      })
        .where(
          and(
            eq(outboxEvents.id, candidate.id),
            eq(outboxEvents.leaseVersion, candidate.leaseVersion),
          or(
            and(
              eq(outboxEvents.status, "pending"),
              or(isNull(outboxEvents.nextAttemptAt), lte(outboxEvents.nextAttemptAt, input.now)),
            ),
            and(
              eq(outboxEvents.status, "processing"),
              lte(outboxEvents.leaseExpiresAt, input.now),
            ),
          ),
        ),
      );
    if (Number(result[0].affectedRows) !== 1) return null;

    const claimed = await tx
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.id, candidate.id),
          eq(outboxEvents.status, "processing"),
          eq(outboxEvents.leaseOwner, input.leaseOwner),
          eq(outboxEvents.leaseVersion, nextLeaseVersion),
          gt(outboxEvents.leaseExpiresAt, input.now),
        ),
      )
      .limit(1);
    const outboxEvent = claimed[0];
    if (!outboxEvent) {
      throw new ScoringOutboxPersistenceError("claimed lease could not be reloaded");
    }
    return { outboxEvent, submission, event };
  });
}

export async function loadScoringLeaseTargetForUpdate(
  executor: R1Executor,
  input: ScoringOutboxLeaseFence,
): Promise<LockedScoringLeaseTarget | null> {
  const rows = await executor
    .select({
      outboxEvent: outboxEvents,
      submission: questionnaireSubmissions,
      caseStatus: diagnosticCases.status,
      caseStateVersion: diagnosticCases.stateVersion,
    })
    .from(outboxEvents)
    .innerJoin(
      questionnaireSubmissions,
      and(
        eq(questionnaireSubmissions.id, outboxEvents.aggregateId),
        eq(questionnaireSubmissions.id, input.submissionId),
        eq(questionnaireSubmissions.customerAccountId, input.customerAccountId),
        eq(questionnaireSubmissions.diagnosticCaseId, input.diagnosticCaseId),
      ),
    )
    .innerJoin(
      diagnosticCases,
      and(
        eq(diagnosticCases.id, questionnaireSubmissions.diagnosticCaseId),
        eq(diagnosticCases.customerAccountId, questionnaireSubmissions.customerAccountId),
      ),
    )
    .where(
      and(
        eq(outboxEvents.id, input.outboxEventId),
        eq(outboxEvents.aggregateType, "questionnaire_submission"),
        eq(outboxEvents.eventType, "questionnaire.submitted_for_scoring"),
        eq(outboxEvents.status, "processing"),
        eq(outboxEvents.leaseOwner, input.leaseOwner),
        eq(outboxEvents.leaseVersion, input.leaseVersion),
        gt(outboxEvents.leaseExpiresAt, input.now),
      ),
    )
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

async function lockScoringLease(
  executor: R1Executor,
  input: ScoringOutboxLeaseFence,
): Promise<OutboxEvent | null> {
  const target = await loadScoringLeaseTargetForUpdate(executor, input);
  if (!target) return null;
  const event = scoringEvent(target.outboxEvent);
  if (
    event.privacySafePayload.caseId !== input.diagnosticCaseId ||
    event.privacySafePayload.submissionId !== input.submissionId ||
    event.privacySafePayload.submissionVersion !== target.submission.submissionVersion ||
    event.privacySafePayload.inputSnapshotHash !== target.submission.inputSnapshotHash
  ) {
    throw new ScoringOutboxPersistenceError("leased event payload is outside its fence");
  }
  return target.outboxEvent;
}

async function finalizeScoringLeaseInTransaction(
  executor: R1Executor,
  input: ScoringOutboxLeaseFence & {
    status: "pending" | "published" | "failed";
    nextAttemptAt?: Date;
    errorCode?: ScoringOutboxErrorCode;
  },
): Promise<boolean> {
  const target = input.status === "failed"
    ? await loadScoringLeaseTargetForUpdate(executor, input)
    : null;
  const row = target?.outboxEvent ?? await lockScoringLease(executor, input);
  if (!row) return false;
  const result = await executor
      .update(outboxEvents)
      .set({
        status: input.status,
        nextAttemptAt: input.status === "pending" ? input.nextAttemptAt ?? null : null,
        publishedAt: input.status === "published" ? input.now : null,
        lastAttemptAt: input.now,
        lastErrorCode: input.errorCode ?? null,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(outboxEvents.id, row.id),
          eq(outboxEvents.aggregateId, input.submissionId),
          eq(outboxEvents.status, "processing"),
          eq(outboxEvents.leaseOwner, input.leaseOwner),
          eq(outboxEvents.leaseVersion, input.leaseVersion),
          gt(outboxEvents.leaseExpiresAt, input.now),
        ),
      );
  return Number(result[0].affectedRows) === 1;
}

export async function acknowledgeScoringEventInTransaction(
  executor: R1Executor,
  input: ScoringOutboxLeaseFence,
): Promise<boolean> {
  return finalizeScoringLeaseInTransaction(executor, { ...input, status: "published" });
}

export async function retryScoringEventInTransaction(
  executor: R1Executor,
  input: ScoringOutboxLeaseFence & {
    nextAttemptAt: Date;
    errorCode: Exclude<ScoringOutboxErrorCode, "retry_exhausted">;
  },
): Promise<boolean> {
  if (input.nextAttemptAt.getTime() <= input.now.getTime()) {
    throw new ScoringOutboxPersistenceError("retry time must be in the future");
  }
  return finalizeScoringLeaseInTransaction(executor, {
    ...input,
    status: "pending",
    nextAttemptAt: input.nextAttemptAt,
    errorCode: input.errorCode,
  });
}

export async function failScoringEventInTransaction(
  executor: R1Executor,
  input: ScoringOutboxLeaseFence & { errorCode: ScoringOutboxErrorCode },
): Promise<boolean> {
  return finalizeScoringLeaseInTransaction(executor, { ...input, status: "failed" });
}

export async function acknowledgeScoringEvent(
  database: R1Database,
  input: ScoringOutboxLeaseFence,
): Promise<boolean> {
  return database.transaction(tx => acknowledgeScoringEventInTransaction(tx, input));
}

export async function retryScoringEvent(
  database: R1Database,
  input: ScoringOutboxLeaseFence & {
    nextAttemptAt: Date;
    errorCode: Exclude<ScoringOutboxErrorCode, "retry_exhausted">;
  },
): Promise<boolean> {
  return database.transaction(tx => retryScoringEventInTransaction(tx, input));
}

export async function failScoringEvent(
  database: R1Database,
  input: ScoringOutboxLeaseFence & { errorCode: ScoringOutboxErrorCode },
): Promise<boolean> {
  return database.transaction(tx => failScoringEventInTransaction(tx, input));
}
