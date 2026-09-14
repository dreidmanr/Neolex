import { createHmac } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type {
  DiagnosticCase,
  QuestionnaireDraft,
} from "../../../drizzle/schema";
import type {
  QuestionDto,
  QuestionnaireAnswerDto,
  QuestionnaireProjectionDto,
  SaveQuestionnaireAnswerResponseDto,
  SubmitQuestionnaireResponseDto,
} from "../../../shared/r1/questionnaire";
import { ENV } from "../../_core/env";
import { appendAuditEvent } from "../audit/auditRepository";
import { findActiveOwnedAccessGrantForUpdate } from "../billing/accessPolicy";
import {
  compareAndSwapCaseStatus,
  touchCaseAtStateVersion,
} from "../cases/caseRepository";
import { requireR1Database, type R1Database, type R1Executor } from "../database";
import {
  claimIdempotencyRecord,
  completeIdempotencyRecord,
} from "../idempotency/idempotencyRepository";
import { newR1Id } from "../ids";
import { appendOutboxEvent } from "../outbox/outboxRepository";
import { throwConflict, throwNeutralNotFound } from "../policy/errors";
import { canonicalSerialize, sha256Hex, type CanonicalJsonValue } from "./canonicalJson";
import { buildQuestionnaireSnapshot } from "./canonicalSnapshot";
import {
  assertTechnicalQuestionnaireBundleAllowed,
  technicalQuestionnaireBundle,
  type QuestionnaireBundle,
} from "./configBundle";
import {
  compareAndSwapDraftRevision,
  compareAndSwapDraftSubmitted,
  decodeStringArray,
  effectiveAnswersFromRevisionRows,
  findExactCustomerAnswerRevision,
  findOwnedQuestionnaireCaseForUpdate,
  findOwnedDraftByCaseId,
  findOwnedSubmissionById,
  insertAnswerRevisions,
  insertQuestionnaireDraft,
  insertQuestionnaireSubmission,
  listAnswerRevisionsAtDraftRevision,
  QuestionnairePersistenceError,
} from "./questionnaireRepository";
import {
  validateAndNormalizeAnswer,
  type CanonicalAnswer,
  type EffectiveAnswers,
} from "./validation";
import { deriveQuestionnaireState, type DerivedQuestionnaireState } from "./visibility";

export const SAVE_ANSWER_SCOPE = "pilot.questionnaire.save_answer.v1" as const;
export const SUBMIT_QUESTIONNAIRE_SCOPE = "pilot.questionnaire.submit.v1" as const;
const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;
const MUTATION_KEY_DOMAIN = "lexy:r1:questionnaire:mutation-key:v1\u0000";
const SAVE_REQUEST_DOMAIN = "lexy:r1:questionnaire:save-request:v1\u0000";
const SYSTEM_REVISION_DOMAIN = "lexy:r1:questionnaire:system-revision:v1\u0000";
const SUBMIT_KEY_DOMAIN = "lexy:r1:questionnaire:submit-key:v1\u0000";
const SUBMIT_REQUEST_DOMAIN = "lexy:r1:questionnaire:submit-request:v1\u0000";

class StructuredSaveConflict extends Error {
  constructor(readonly questionnaire: QuestionnaireProjectionDto) {
    super("Questionnaire revision conflict");
    this.name = "StructuredSaveConflict";
  }
}

export type QuestionnaireActorInput = {
  customerAccountId: string;
  customerSessionId: string;
  requestId: string;
  publicId: string;
  now?: Date;
};

export type SaveQuestionnaireAnswerInput = QuestionnaireActorInput & {
  questionId: string;
  value: unknown;
  clientMutationId: string;
  expectedDraftRevision: number;
};

export type SubmitQuestionnaireInput = QuestionnaireActorInput & {
  idempotencyKey: string;
};

export type QuestionnaireServiceDependencies = {
  requireDatabase: () => Promise<R1Database>;
  appendAuditEvent: typeof appendAuditEvent;
  appendOutboxEvent: typeof appendOutboxEvent;
};

const DEFAULT_DEPENDENCIES: QuestionnaireServiceDependencies = {
  requireDatabase: requireR1Database,
  appendAuditEvent,
  appendOutboxEvent,
};

function questionnaireIdempotencyPepper(): string {
  if (ENV.questionnaireIdempotencyPepper.length < 32) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Questionnaire security configuration is unavailable",
    });
  }
  return ENV.questionnaireIdempotencyPepper;
}

function keyedHash(domain: string, value: string): string {
  return createHmac("sha256", questionnaireIdempotencyPepper())
    .update(domain)
    .update(value, "utf8")
    .digest("hex");
}

function canonicalAnswerJson(answer: CanonicalAnswer | null): CanonicalJsonValue {
  if (answer === null) return null;
  if (answer.kind === "single") return { kind: "single", optionId: answer.optionId };
  if (answer.kind === "multi") return { kind: "multi", optionIds: [...answer.optionIds] };
  return { kind: "text", text: answer.text };
}

function safeUnavailable(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Questionnaire is unavailable",
  });
}

function assertCaseCanOpen(caseRow: DiagnosticCase): void {
  if (caseRow.status !== "access_granted" && caseRow.status !== "in_progress") {
    throwConflict("Questionnaire is not open for this case");
  }
}

function assertDraftPinned(draft: QuestionnaireDraft, bundle: QuestionnaireBundle): void {
  if (
    draft.questionnaireReleaseId !== bundle.releaseId ||
    draft.questionnaireVersion !== bundle.version ||
    draft.questionnaireContentHash !== bundle.contentHash
  ) {
    throw new QuestionnairePersistenceError("draft bundle pins do not match");
  }
}

function decodeAndValidateDraftState(
  bundle: QuestionnaireBundle,
  draft: QuestionnaireDraft,
  effectiveAnswers: EffectiveAnswers,
): DerivedQuestionnaireState {
  assertDraftPinned(draft, bundle);
  const persistedVisibleIds = decodeStringArray(draft.visibleQuestionIds, "visibleQuestionIds");
  const persistedTriggerIds = decodeStringArray(
    draft.manualFollowUpTriggerIds,
    "manualFollowUpTriggerIds",
  );
  let state: DerivedQuestionnaireState;
  try {
    state = deriveQuestionnaireState(bundle, effectiveAnswers);
  } catch {
    throw new QuestionnairePersistenceError("effective answers cannot derive state");
  }
  if (
    canonicalSerialize([...persistedVisibleIds]) !==
      canonicalSerialize([...state.visibleQuestionIds]) ||
    draft.visibleSetHash !== state.visibleSetHash ||
    draft.manualFollowUpRequired !== state.manualFollowUpRequired ||
    canonicalSerialize([...persistedTriggerIds]) !==
      canonicalSerialize([...state.manualFollowUpTriggerIds])
  ) {
    throw new QuestionnairePersistenceError("derived state does not match the draft");
  }
  return state;
}

function questionDto(bundle: QuestionnaireBundle, questionId: string): QuestionDto {
  const question = bundle.questionById[questionId];
  if (!question || question.type === "file" || !question.activeInPilot) {
    throw new QuestionnairePersistenceError("visible question is not client-safe");
  }
  return {
    id: question.id,
    blockId: question.blockId,
    text: question.text,
    ...(question.hint === undefined ? {} : { hint: question.hint }),
    input: question.type,
    required: question.required,
    ...(question.options.length === 0
      ? {}
      : { options: question.options.map(option => ({ id: option.id, label: option.label })) }),
  };
}

function answerDto(answer: CanonicalAnswer): QuestionnaireAnswerDto {
  if (answer.kind === "single") return { kind: "single", optionId: answer.optionId };
  if (answer.kind === "multi") return { kind: "multi", optionIds: [...answer.optionIds] };
  return { kind: "text", text: answer.text };
}

function nextCurrentQuestionId(
  bundle: QuestionnaireBundle,
  state: DerivedQuestionnaireState,
  persistedCurrentQuestionId: string | null,
): string | null {
  const unansweredRequired = state.requiredVisibleQuestionIds.find(
    questionId => state.activeAnswers[questionId] === undefined,
  );
  if (unansweredRequired) return unansweredRequired;
  if (
    persistedCurrentQuestionId !== null &&
    state.visibleQuestionIds.includes(persistedCurrentQuestionId)
  ) {
    return persistedCurrentQuestionId;
  }
  return state.visibleQuestionIds[0] ?? null;
}

export function buildQuestionnaireProjection(
  publicId: string,
  draft: QuestionnaireDraft,
  bundle: QuestionnaireBundle,
  effectiveAnswers: EffectiveAnswers,
  state: DerivedQuestionnaireState,
): QuestionnaireProjectionDto {
  const answers: Record<string, QuestionnaireAnswerDto> = {};
  for (const questionId of state.visibleQuestionIds) {
    const answer = state.activeAnswers[questionId];
    if (answer !== undefined) answers[questionId] = answerDto(answer);
  }
  return {
    publicId,
    status: draft.status,
    draftRevision: draft.draftRevision,
    release: { releaseId: bundle.releaseId, version: bundle.version },
    visibleQuestions: state.visibleQuestionIds.map(questionId => questionDto(bundle, questionId)),
    visibleQuestionCount: state.visibleQuestionIds.length,
    answers,
    activeAnsweredCount: state.progress.activeAnsweredCount,
    requiredActiveCount: state.progress.requiredActiveCount,
    currentQuestionId: nextCurrentQuestionId(
      bundle,
      state,
      draft.currentQuestionId,
    ),
    manualFollowUpRequired: state.manualFollowUpRequired,
  };
}

async function loadProjection(
  executor: R1Executor,
  publicId: string,
  draft: QuestionnaireDraft,
  bundle: QuestionnaireBundle,
): Promise<QuestionnaireProjectionDto> {
  const rows = await listAnswerRevisionsAtDraftRevision(executor, draft);
  const effectiveAnswers = effectiveAnswersFromRevisionRows(bundle, draft, rows);
  const state = decodeAndValidateDraftState(bundle, draft, effectiveAnswers);
  return buildQuestionnaireProjection(publicId, draft, bundle, effectiveAnswers, state);
}

function initialDraft(
  caseRow: DiagnosticCase,
  bundle: QuestionnaireBundle,
  now: Date,
): QuestionnaireDraft {
  const state = deriveQuestionnaireState(bundle, {});
  return {
    id: newR1Id("qdraft"),
    customerAccountId: caseRow.customerAccountId,
    diagnosticCaseId: caseRow.id,
    questionnaireReleaseId: bundle.releaseId,
    questionnaireVersion: bundle.version,
    questionnaireContentHash: bundle.contentHash,
    status: "open",
    draftRevision: 0,
    currentQuestionId: state.requiredVisibleQuestionIds[0] ?? state.visibleQuestionIds[0] ?? null,
    visibleQuestionIds: [...state.visibleQuestionIds],
    visibleSetHash: state.visibleSetHash,
    manualFollowUpRequired: state.manualFollowUpRequired,
    manualFollowUpTriggerIds: [...state.manualFollowUpTriggerIds],
    createdAt: now,
    updatedAt: now,
  };
}

type QuestionnaireAction = "get_draft" | "save_answer" | "submit";

async function appendAccessDeniedAudit(
  executor: R1Executor,
  input: QuestionnaireActorInput,
  action: QuestionnaireAction,
  dependencies: QuestionnaireServiceDependencies,
): Promise<void> {
  try {
    await dependencies.appendAuditEvent(executor, {
      actorType: "customer_session",
      actorId: input.customerSessionId,
      aggregateType: "diagnostic_case",
      aggregateId: "unresolved_case",
      eventType: "questionnaire.access_denied",
      outcome: "denied",
      reasonCode: "owner_or_entitlement_miss",
      requestId: input.requestId,
      privacySafeMetadata: { resourceClass: "questionnaire", action },
    });
  } catch {
    // Neutral denial must not depend on security-trail availability.
  }
}

async function requireAuthorizedCase(
  executor: R1Executor,
  input: QuestionnaireActorInput,
  action: QuestionnaireAction,
  auditDenied: (action: QuestionnaireAction) => Promise<void>,
): Promise<DiagnosticCase> {
  // Global transaction lock order: owned case first, then grant + payment.
  const caseRow = await findOwnedQuestionnaireCaseForUpdate(
    executor,
    input.customerAccountId,
    input.publicId,
  );
  if (!caseRow) {
    await auditDenied(action);
    throwNeutralNotFound();
  }
  const access = await findActiveOwnedAccessGrantForUpdate(
    executor,
    input.customerAccountId,
    caseRow.id,
  );
  if (!access) {
    await auditDenied(action);
    throwNeutralNotFound();
  }
  return caseRow;
}

async function getOrCreateDraft(
  executor: R1Executor,
  caseRow: DiagnosticCase,
  bundle: QuestionnaireBundle,
  now: Date,
): Promise<QuestionnaireDraft> {
  const existing = await findOwnedDraftByCaseId(
    executor,
    caseRow.customerAccountId,
    caseRow.id,
    true,
  );
  if (existing) return existing;
  await insertQuestionnaireDraft(executor, initialDraft(caseRow, bundle, now));
  const reloaded = await findOwnedDraftByCaseId(
    executor,
    caseRow.customerAccountId,
    caseRow.id,
    true,
  );
  if (!reloaded) throw new QuestionnairePersistenceError("draft creation could not be loaded");
  return reloaded;
}

export async function getQuestionnaireDraft(
  input: QuestionnaireActorInput,
  dependencies: QuestionnaireServiceDependencies = DEFAULT_DEPENDENCIES,
): Promise<QuestionnaireProjectionDto> {
  try {
    const bundle = technicalQuestionnaireBundle;
    assertTechnicalQuestionnaireBundleAllowed(bundle);
    const now = input.now ?? new Date();
    const database = await dependencies.requireDatabase();
    return await database.transaction(async tx => {
      const caseRow = await requireAuthorizedCase(
        tx,
        input,
        "get_draft",
        action => appendAccessDeniedAudit(database, input, action, dependencies),
      );
      assertCaseCanOpen(caseRow);
      const draft = await getOrCreateDraft(tx, caseRow, bundle, now);
      if (draft.status !== "open") throwConflict("Questionnaire has already been submitted");
      return loadProjection(tx, input.publicId, draft, bundle);
    });
  } catch (error) {
    return safeUnavailable(error);
  }
}

function saveRequestHash(input: {
  draft: QuestionnaireDraft;
  caseRow: DiagnosticCase;
  questionId: string;
  answer: CanonicalAnswer | null;
  expectedDraftRevision: number;
  bundle: QuestionnaireBundle;
}): string {
  return keyedHash(
    SAVE_REQUEST_DOMAIN,
    canonicalSerialize({
      bundleHash: input.bundle.contentHash,
      caseId: input.caseRow.id,
      draftId: input.draft.id,
      expectedDraftRevision: input.expectedDraftRevision,
      questionId: input.questionId,
      value: canonicalAnswerJson(input.answer),
    }),
  );
}

type SavePointer = {
  draftId: string;
  questionId: string;
  draftRevision: number;
};

function parseSavePointer(value: unknown): SavePointer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new QuestionnairePersistenceError("saved idempotency pointer is invalid");
  }
  const pointer = value as Record<string, unknown>;
  if (
    Object.keys(pointer).sort().join(",") !== "draftId,draftRevision,questionId" ||
    typeof pointer.draftId !== "string" ||
    typeof pointer.questionId !== "string" ||
    typeof pointer.draftRevision !== "number" ||
    !Number.isSafeInteger(pointer.draftRevision) ||
    pointer.draftRevision < 1
  ) {
    throw new QuestionnairePersistenceError("saved idempotency pointer is invalid");
  }
  return pointer as SavePointer;
}

async function assertReplayPointer(
  executor: R1Executor,
  pointer: SavePointer,
  draft: QuestionnaireDraft,
  questionId: string,
  clientMutationIdHash: string,
): Promise<void> {
  if (
    pointer.draftId !== draft.id ||
    pointer.questionId !== questionId ||
    pointer.draftRevision > draft.draftRevision
  ) {
    throw new QuestionnairePersistenceError("saved idempotency pointer is inconsistent");
  }
  const revision = await findExactCustomerAnswerRevision(executor, {
    customerAccountId: draft.customerAccountId,
    diagnosticCaseId: draft.diagnosticCaseId,
    questionnaireDraftId: draft.id,
    questionId,
    draftRevision: pointer.draftRevision,
    clientMutationIdHash,
  });
  if (!revision) {
    throw new QuestionnairePersistenceError("saved idempotency answer revision is missing");
  }
}

function withAnswer(
  answers: EffectiveAnswers,
  questionId: string,
  answer: CanonicalAnswer | null,
): EffectiveAnswers {
  const next: Record<string, CanonicalAnswer> = { ...answers };
  if (answer === null) delete next[questionId];
  else next[questionId] = answer;
  return Object.freeze(next);
}

export async function saveQuestionnaireAnswer(
  input: SaveQuestionnaireAnswerInput,
  dependencies: QuestionnaireServiceDependencies = DEFAULT_DEPENDENCIES,
): Promise<SaveQuestionnaireAnswerResponseDto> {
  try {
    const bundle = technicalQuestionnaireBundle;
    assertTechnicalQuestionnaireBundleAllowed(bundle);
    const now = input.now ?? new Date();
    const keyHash = keyedHash(MUTATION_KEY_DOMAIN, input.clientMutationId);
    const database = await dependencies.requireDatabase();
    return await database.transaction(async tx => {
      const caseRow = await requireAuthorizedCase(
        tx,
        input,
        "save_answer",
        action => appendAccessDeniedAudit(database, input, action, dependencies),
      );
      assertCaseCanOpen(caseRow);
      const draft = await getOrCreateDraft(tx, caseRow, bundle, now);
      assertDraftPinned(draft, bundle);
      if (draft.status !== "open") throwConflict("Questionnaire has already been submitted");

      const revisionRows = await listAnswerRevisionsAtDraftRevision(tx, draft);
      const effectiveAnswers = effectiveAnswersFromRevisionRows(bundle, draft, revisionRows);
      const currentState = decodeAndValidateDraftState(bundle, draft, effectiveAnswers);

      let normalized: CanonicalAnswer | null;
      try {
        normalized = validateAndNormalizeAnswer(
          bundle,
          input.questionId,
          input.value,
          [...bundle.activeCoreQuestionIds, ...bundle.activeBranchQuestionIds],
        );
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid questionnaire answer" });
      }
      const requestHash = saveRequestHash({
        draft,
        caseRow,
        questionId: input.questionId,
        answer: normalized,
        expectedDraftRevision: input.expectedDraftRevision,
        bundle,
      });
      const claim = await claimIdempotencyRecord(
        tx,
        {
          customerAccountId: input.customerAccountId,
          scope: SAVE_ANSWER_SCOPE,
          keyHash,
        },
        requestHash,
        new Date(now.getTime() + IDEMPOTENCY_RETENTION_MS),
      );
      if (claim.record.requestHash !== requestHash) {
        throwConflict("Idempotency key was used for a different request");
      }
      if (!claim.claimed) {
        if (claim.record.status !== "completed") {
          throwConflict("An equivalent request is already in progress or unavailable");
        }
        const pointer = parseSavePointer(claim.record.responseJson);
        await assertReplayPointer(tx, pointer, draft, input.questionId, keyHash);
        return {
          outcome: "saved",
          questionnaire: await loadProjection(tx, input.publicId, draft, bundle),
        };
      }
      if (!currentState.visibleQuestionIds.includes(input.questionId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid questionnaire answer" });
      }

      if (draft.draftRevision !== input.expectedDraftRevision) {
        throw new StructuredSaveConflict(
          await loadProjection(tx, input.publicId, draft, bundle),
        );
      }

      const nextRevision = draft.draftRevision + 1;
      const candidateAnswers = withAnswer(effectiveAnswers, input.questionId, normalized);
      let nextState: DerivedQuestionnaireState;
      try {
        nextState = deriveQuestionnaireState(
          bundle,
          candidateAnswers,
          currentState.visibleQuestionIds,
        );
      } catch {
        throw new QuestionnairePersistenceError("saved answer cannot derive state");
      }
      const deactivatedIds = nextState.deactivatedQuestionIds.filter(
        questionId => questionId !== input.questionId,
      );
      const finalAnswers: Record<string, CanonicalAnswer> = { ...candidateAnswers };
      for (const questionId of deactivatedIds) delete finalAnswers[questionId];
      const finalState = deriveQuestionnaireState(bundle, finalAnswers);
      const nextCurrent = nextCurrentQuestionId(bundle, finalState, draft.currentQuestionId);

      const draftUpdated = await compareAndSwapDraftRevision(tx, {
        draftId: draft.id,
        customerAccountId: draft.customerAccountId,
        diagnosticCaseId: draft.diagnosticCaseId,
        expectedDraftRevision: draft.draftRevision,
        nextDraftRevision: nextRevision,
        currentQuestionId: nextCurrent,
        visibleQuestionIds: finalState.visibleQuestionIds,
        visibleSetHash: finalState.visibleSetHash,
        manualFollowUpRequired: finalState.manualFollowUpRequired,
        manualFollowUpTriggerIds: finalState.manualFollowUpTriggerIds,
        now,
      });
      if (!draftUpdated) throwConflict("Questionnaire changed concurrently");

      let nextCaseStateVersion = caseRow.stateVersion;
      if (caseRow.status === "access_granted") {
        const caseUpdated = await compareAndSwapCaseStatus(tx, {
          id: caseRow.id,
          customerAccountId: caseRow.customerAccountId,
          fromStatus: "access_granted",
          toStatus: "in_progress",
          expectedStateVersion: caseRow.stateVersion,
          now,
        });
        if (!caseUpdated) throwConflict("Case state changed concurrently");
        nextCaseStateVersion += 1;
      } else {
        const caseFenced = await touchCaseAtStateVersion(tx, {
          id: caseRow.id,
          customerAccountId: caseRow.customerAccountId,
          status: "in_progress",
          expectedStateVersion: caseRow.stateVersion,
          now,
        });
        if (!caseFenced) throwConflict("Case state changed concurrently");
      }

      await insertAnswerRevisions(tx, [
        {
          id: newR1Id("qanswer"),
          customerAccountId: draft.customerAccountId,
          diagnosticCaseId: draft.diagnosticCaseId,
          questionnaireDraftId: draft.id,
          questionId: input.questionId,
          draftRevision: nextRevision,
          valueJson: normalized,
          answerState: "active",
          source: "customer",
          clientMutationIdHash: keyHash,
          deactivationReasonCode: null,
          createdAt: now,
        },
        ...deactivatedIds.map(questionId => ({
          id: newR1Id("qanswer"),
          customerAccountId: draft.customerAccountId,
          diagnosticCaseId: draft.diagnosticCaseId,
          questionnaireDraftId: draft.id,
          questionId,
          draftRevision: nextRevision,
          valueJson: null,
          answerState: "inactive" as const,
          source: "system_branch_recompute" as const,
          clientMutationIdHash: keyedHash(
            SYSTEM_REVISION_DOMAIN,
            canonicalSerialize({ draftId: draft.id, keyHash, nextRevision, questionId }),
          ),
          deactivationReasonCode: "branch_no_longer_visible",
          createdAt: now,
        })),
      ]);

      if (caseRow.status === "access_granted") {
        await dependencies.appendAuditEvent(tx, {
          actorType: "customer_session",
          actorId: input.customerSessionId,
          aggregateType: "diagnostic_case",
          aggregateId: caseRow.id,
          eventType: "diagnostic_case.status_changed",
          fromStatus: "access_granted",
          toStatus: "in_progress",
          outcome: "succeeded",
          reasonCode: "workflow_progression",
          requestId: input.requestId,
          idempotencyKeyHash: keyHash,
          privacySafeMetadata: { stateVersion: nextCaseStateVersion },
          createdAt: now,
        });
        await dependencies.appendOutboxEvent(tx, {
          aggregateType: "diagnostic_case",
          aggregateId: caseRow.id,
          eventType: "diagnostic_case.status_changed",
          privacySafePayload: {
            caseId: caseRow.id,
            stateVersion: nextCaseStateVersion,
            status: "in_progress",
          },
          createdAt: now,
        });
      }

      await dependencies.appendAuditEvent(tx, {
        actorType: "customer_session",
        actorId: input.customerSessionId,
        aggregateType: "questionnaire_draft",
        aggregateId: draft.id,
        eventType: "questionnaire.answer_saved",
        outcome: "succeeded",
        requestId: input.requestId,
        idempotencyKeyHash: keyHash,
        privacySafeMetadata: {
          caseId: caseRow.id,
          questionId: input.questionId,
          draftRevision: nextRevision,
          visibleSetHash: finalState.visibleSetHash,
          activeAnsweredCount: finalState.progress.activeAnsweredCount,
          requiredActiveCount: finalState.progress.requiredActiveCount,
          manualFollowUpRequired: finalState.manualFollowUpRequired,
          test: true,
        },
        createdAt: now,
      });

      const pointer: SavePointer = {
        draftId: draft.id,
        questionId: input.questionId,
        draftRevision: nextRevision,
      };
      await completeIdempotencyRecord(tx, claim.record.id, pointer);
      const updatedDraft: QuestionnaireDraft = {
        ...draft,
        draftRevision: nextRevision,
        currentQuestionId: nextCurrent,
        visibleQuestionIds: [...finalState.visibleQuestionIds],
        visibleSetHash: finalState.visibleSetHash,
        manualFollowUpRequired: finalState.manualFollowUpRequired,
        manualFollowUpTriggerIds: [...finalState.manualFollowUpTriggerIds],
        updatedAt: now,
      };
      return {
        outcome: "saved",
        questionnaire: buildQuestionnaireProjection(
          input.publicId,
          updatedDraft,
          bundle,
          finalAnswers,
          finalState,
        ),
      };
    });
  } catch (error) {
    if (error instanceof StructuredSaveConflict) {
      return { outcome: "conflict", questionnaire: error.questionnaire };
    }
    return safeUnavailable(error);
  }
}

type SubmitPointer = {
  draftId: string;
  submissionId: string;
  draftRevision: number;
};

function parseSubmitPointer(value: unknown): SubmitPointer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new QuestionnairePersistenceError("submission idempotency pointer is invalid");
  }
  const pointer = value as Record<string, unknown>;
  if (
    Object.keys(pointer).sort().join(",") !== "draftId,draftRevision,submissionId" ||
    typeof pointer.draftId !== "string" ||
    typeof pointer.submissionId !== "string" ||
    typeof pointer.draftRevision !== "number" ||
    !Number.isSafeInteger(pointer.draftRevision) ||
    pointer.draftRevision < 1
  ) {
    throw new QuestionnairePersistenceError("submission idempotency pointer is invalid");
  }
  return pointer as SubmitPointer;
}

function submitRequestHash(
  caseRow: DiagnosticCase,
  draft: QuestionnaireDraft,
  bundle: QuestionnaireBundle,
): string {
  return keyedHash(
    SUBMIT_REQUEST_DOMAIN,
    canonicalSerialize({
      bundleHash: bundle.contentHash,
      caseId: caseRow.id,
      draftId: draft.id,
    }),
  );
}

async function replaySubmission(
  tx: R1Executor,
  input: SubmitQuestionnaireInput,
  caseRow: DiagnosticCase,
  draft: QuestionnaireDraft,
  bundle: QuestionnaireBundle,
  pointer: SubmitPointer,
): Promise<SubmitQuestionnaireResponseDto> {
  if (
    caseRow.status !== "submitted" ||
    draft.status !== "submitted" ||
    pointer.draftId !== draft.id ||
    pointer.draftRevision !== draft.draftRevision
  ) {
    throw new QuestionnairePersistenceError("completed submission state is inconsistent");
  }
  const submission = await findOwnedSubmissionById(tx, {
    submissionId: pointer.submissionId,
    draftId: draft.id,
    customerAccountId: draft.customerAccountId,
    diagnosticCaseId: draft.diagnosticCaseId,
  });
  if (
    !submission ||
    submission.submissionVersion !== 1 ||
    submission.questionnaireReleaseId !== bundle.releaseId ||
    submission.questionnaireVersion !== bundle.version ||
    submission.questionnaireContentHash !== bundle.contentHash
  ) {
    throw new QuestionnairePersistenceError("completed submission is missing");
  }
  const effectiveAnswers = effectiveAnswersFromRevisionRows(
    bundle,
    draft,
    await listAnswerRevisionsAtDraftRevision(tx, draft),
  );
  const state = decodeAndValidateDraftState(bundle, draft, effectiveAnswers);
  const expectedSnapshot = buildQuestionnaireSnapshot(
    bundle,
    state,
    effectiveAnswers,
    draft.draftRevision,
  );
  let persistedSnapshotJson: string;
  try {
    persistedSnapshotJson = canonicalSerialize(
      (typeof submission.inputSnapshotJson === "string"
        ? JSON.parse(submission.inputSnapshotJson) as unknown
        : submission.inputSnapshotJson) as CanonicalJsonValue,
    );
  } catch {
    throw new QuestionnairePersistenceError("completed submission snapshot is invalid");
  }
  if (
    pointer.draftRevision !== draft.draftRevision ||
    persistedSnapshotJson !== expectedSnapshot.snapshotJson ||
    sha256Hex(persistedSnapshotJson) !== submission.inputSnapshotHash ||
    submission.inputSnapshotHash !== expectedSnapshot.inputSnapshotHash ||
    canonicalSerialize(decodeStringArray(submission.visibleQuestionIds, "submission visibleQuestionIds")) !==
      canonicalSerialize([...expectedSnapshot.visibleQuestionIds]) ||
    submission.visibleSetHash !== expectedSnapshot.visibleSetHash ||
    submission.manualFollowUpRequired !== state.manualFollowUpRequired ||
    canonicalSerialize(
      decodeStringArray(submission.manualFollowUpTriggerIds, "submission manualFollowUpTriggerIds"),
    ) !== canonicalSerialize([...expectedSnapshot.manualFollowUpTriggerIds])
  ) {
    throw new QuestionnairePersistenceError("completed submission snapshot is inconsistent");
  }
  return {
    outcome: "saved",
    receipt: {
      publicId: input.publicId,
      status: "submitted",
      submissionVersion: 1,
      draftRevision: draft.draftRevision,
      activeAnsweredCount: state.progress.activeAnsweredCount,
      requiredActiveCount: state.progress.requiredActiveCount,
      manualFollowUpRequired: state.manualFollowUpRequired,
    },
  };
}

export async function submitQuestionnaire(
  input: SubmitQuestionnaireInput,
  dependencies: QuestionnaireServiceDependencies = DEFAULT_DEPENDENCIES,
): Promise<SubmitQuestionnaireResponseDto> {
  try {
    const bundle = technicalQuestionnaireBundle;
    assertTechnicalQuestionnaireBundleAllowed(bundle);
    const now = input.now ?? new Date();
    const keyHash = keyedHash(SUBMIT_KEY_DOMAIN, input.idempotencyKey);
    const database = await dependencies.requireDatabase();
    return await database.transaction(async tx => {
      const caseRow = await requireAuthorizedCase(
        tx,
        input,
        "submit",
        action => appendAccessDeniedAudit(database, input, action, dependencies),
      );
      const draft = await findOwnedDraftByCaseId(tx, caseRow.customerAccountId, caseRow.id);
      if (!draft) throwConflict("Questionnaire draft is unavailable");
      assertDraftPinned(draft, bundle);

      const requestHash = submitRequestHash(caseRow, draft, bundle);
      const claim = await claimIdempotencyRecord(
        tx,
        {
          customerAccountId: input.customerAccountId,
          scope: SUBMIT_QUESTIONNAIRE_SCOPE,
          keyHash,
        },
        requestHash,
        new Date(now.getTime() + IDEMPOTENCY_RETENTION_MS),
      );
      if (claim.record.requestHash !== requestHash) {
        throwConflict("Idempotency key was used for a different request");
      }
      if (!claim.claimed) {
        if (claim.record.status !== "completed") {
          throwConflict("An equivalent request is already in progress or unavailable");
        }
        return replaySubmission(
          tx,
          input,
          caseRow,
          draft,
          bundle,
          parseSubmitPointer(claim.record.responseJson),
        );
      }

      if (caseRow.status !== "in_progress" || draft.status !== "open") {
        throwConflict("Questionnaire cannot be submitted in its current state");
      }
      const revisionRows = await listAnswerRevisionsAtDraftRevision(tx, draft);
      const effectiveAnswers = effectiveAnswersFromRevisionRows(bundle, draft, revisionRows);
      const state = decodeAndValidateDraftState(bundle, draft, effectiveAnswers);
      if (!state.progress.complete) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Required questionnaire answers are incomplete",
        });
      }

      const snapshot = buildQuestionnaireSnapshot(
        bundle,
        state,
        effectiveAnswers,
        draft.draftRevision,
      );
      const submissionId = newR1Id("qsubmit");
      await insertQuestionnaireSubmission(tx, {
        id: submissionId,
        customerAccountId: draft.customerAccountId,
        diagnosticCaseId: draft.diagnosticCaseId,
        questionnaireDraftId: draft.id,
        submissionVersion: 1,
        questionnaireReleaseId: bundle.releaseId,
        questionnaireVersion: bundle.version,
        questionnaireContentHash: bundle.contentHash,
        visibleQuestionIds: [...snapshot.visibleQuestionIds],
        visibleSetHash: snapshot.visibleSetHash,
        manualFollowUpRequired: state.manualFollowUpRequired,
        manualFollowUpTriggerIds: [...snapshot.manualFollowUpTriggerIds],
        inputSnapshotJson: JSON.parse(snapshot.snapshotJson) as object,
        inputSnapshotHash: snapshot.inputSnapshotHash,
        submittedAt: now,
        createdAt: now,
      });
      const draftUpdated = await compareAndSwapDraftSubmitted(tx, {
        draftId: draft.id,
        customerAccountId: draft.customerAccountId,
        diagnosticCaseId: draft.diagnosticCaseId,
        expectedDraftRevision: draft.draftRevision,
        now,
      });
      if (!draftUpdated) throwConflict("Questionnaire changed concurrently");

      const caseUpdated = await compareAndSwapCaseStatus(tx, {
        id: caseRow.id,
        customerAccountId: caseRow.customerAccountId,
        fromStatus: "in_progress",
        toStatus: "submitted",
        expectedStateVersion: caseRow.stateVersion,
        now,
      });
      if (!caseUpdated) throwConflict("Case state changed concurrently");
      const nextCaseStateVersion = caseRow.stateVersion + 1;

      await dependencies.appendAuditEvent(tx, {
        actorType: "customer_session",
        actorId: input.customerSessionId,
        aggregateType: "questionnaire_draft",
        aggregateId: draft.id,
        eventType: "questionnaire.submitted",
        outcome: "succeeded",
        requestId: input.requestId,
        idempotencyKeyHash: keyHash,
        privacySafeMetadata: {
          caseId: caseRow.id,
          submissionId,
          submissionVersion: 1,
          inputSnapshotHash: snapshot.inputSnapshotHash,
          activeAnsweredCount: state.progress.activeAnsweredCount,
          requiredActiveCount: state.progress.requiredActiveCount,
          manualFollowUpRequired: state.manualFollowUpRequired,
          test: true,
        },
        createdAt: now,
      });
      await dependencies.appendAuditEvent(tx, {
        actorType: "customer_session",
        actorId: input.customerSessionId,
        aggregateType: "diagnostic_case",
        aggregateId: caseRow.id,
        eventType: "diagnostic_case.status_changed",
        fromStatus: "in_progress",
        toStatus: "submitted",
        outcome: "succeeded",
        reasonCode: "workflow_progression",
        requestId: input.requestId,
        idempotencyKeyHash: keyHash,
        privacySafeMetadata: { stateVersion: nextCaseStateVersion },
        createdAt: now,
      });
      await dependencies.appendOutboxEvent(tx, {
        aggregateType: "diagnostic_case",
        aggregateId: caseRow.id,
        eventType: "diagnostic_case.status_changed",
        privacySafePayload: {
          caseId: caseRow.id,
          stateVersion: nextCaseStateVersion,
          status: "submitted",
        },
        createdAt: now,
      });
      await dependencies.appendOutboxEvent(tx, {
        aggregateType: "questionnaire_submission",
        aggregateId: submissionId,
        eventType: "questionnaire.submitted_for_scoring",
        privacySafePayload: {
          caseId: caseRow.id,
          submissionId,
          submissionVersion: 1,
          inputSnapshotHash: snapshot.inputSnapshotHash,
          test: true,
        },
        createdAt: now,
      });

      const pointer: SubmitPointer = {
        draftId: draft.id,
        submissionId,
        draftRevision: draft.draftRevision,
      };
      await completeIdempotencyRecord(tx, claim.record.id, pointer);
      return {
        outcome: "saved",
        receipt: {
          publicId: input.publicId,
          status: "submitted",
          submissionVersion: 1,
          draftRevision: draft.draftRevision,
          activeAnsweredCount: state.progress.activeAnsweredCount,
          requiredActiveCount: state.progress.requiredActiveCount,
          manualFollowUpRequired: state.manualFollowUpRequired,
        },
      };
    });
  } catch (error) {
    return safeUnavailable(error);
  }
}
