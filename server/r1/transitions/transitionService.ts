import { createHmac } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { ENV } from "../../_core/env";
import { appendAuditEvent } from "../audit/auditRepository";
import {
  compareAndSwapCaseStatus,
  findOwnedCaseById,
  type CaseStatus,
} from "../cases/caseRepository";
import { requireR1Database } from "../database";
import type { AppendAuditEvent } from "../events/contracts";
import {
  claimIdempotencyRecord,
  completeIdempotencyRecord,
} from "../idempotency/idempotencyRepository";
import { appendOutboxEvent } from "../outbox/outboxRepository";
import { throwConflict, throwNeutralNotFound } from "../policy/errors";
import { assertTechnicalPilotAllowed } from "../releaseGate";

const TRANSITION_SCOPE = "pilot.case.transition";
const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;

const ALLOWED_CASE_TRANSITIONS: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = {
  draft: ["access_granted", "archived"],
  access_granted: ["in_progress", "archived"],
  in_progress: ["submitted", "archived"],
  submitted: ["scoring", "archived"],
  scoring: ["report_ready", "manual_review_required", "failed"],
  manual_review_required: ["report_ready", "failed", "archived"],
  report_ready: ["archived"],
  failed: ["archived"],
  archived: [],
};

export type TransitionResponse = { status: CaseStatus; stateVersion: number };
type TransitionReasonCode = Extract<
  AppendAuditEvent,
  { eventType: "diagnostic_case.status_changed" }
>["reasonCode"];

export type TransitionCaseInput = {
  caseId: string;
  customerAccountId: string;
  actorType: "customer_account" | "customer_session" | "admin_user" | "service";
  actorId: string;
  fromStatus: CaseStatus;
  toStatus: CaseStatus;
  expectedStateVersion: number;
  reasonCode?: TransitionReasonCode;
  idempotencyKey: string;
  requestId: string;
};

export function isAllowedCaseTransition(
  fromStatus: CaseStatus,
  toStatus: CaseStatus,
): boolean {
  return ALLOWED_CASE_TRANSITIONS[fromStatus].includes(toStatus);
}

export function assertAllowedCaseTransition(
  fromStatus: CaseStatus,
  toStatus: CaseStatus,
): void {
  if (!isAllowedCaseTransition(fromStatus, toStatus)) {
    throwConflict("Case transition is not allowed");
  }
}

function securitySecret(): string {
  if (!ENV.customerSessionSecret) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Pilot security configuration is unavailable",
    });
  }
  return ENV.customerSessionSecret;
}

function keyedHash(value: string): string {
  return createHmac("sha256", securitySecret()).update(value).digest("hex");
}

function canonicalCommand(input: TransitionCaseInput): string {
  return JSON.stringify({
    caseId: input.caseId,
    customerAccountId: input.customerAccountId,
    actorType: input.actorType,
    actorId: input.actorId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    expectedStateVersion: input.expectedStateVersion,
    reasonCode: input.reasonCode ?? null,
  });
}

function parseStoredResponse(value: unknown): TransitionResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored command response is invalid",
    });
  }
  const entries = Object.keys(value);
  const response = value as Record<string, unknown>;
  if (
    entries.length !== 2 ||
    !entries.includes("status") ||
    !entries.includes("stateVersion") ||
    typeof response.status !== "string" ||
    !(response.status in ALLOWED_CASE_TRANSITIONS) ||
    typeof response.stateVersion !== "number" ||
    !Number.isInteger(response.stateVersion) ||
    response.stateVersion < 1
  ) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored command response is invalid",
    });
  }
  return {
    status: response.status as CaseStatus,
    stateVersion: response.stateVersion,
  };
}

export async function transitionCase(
  input: TransitionCaseInput,
): Promise<TransitionResponse> {
  assertTechnicalPilotAllowed();
  assertAllowedCaseTransition(input.fromStatus, input.toStatus);
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid idempotency key" });
  }

  const db = await requireR1Database();
  const now = new Date();
  const requestHash = keyedHash(canonicalCommand(input));
  const idempotencyKeyHash = keyedHash(input.idempotencyKey);

  return db.transaction(async tx => {
    const claim = await claimIdempotencyRecord(
      tx,
      {
        customerAccountId: input.customerAccountId,
        scope: TRANSITION_SCOPE,
        keyHash: idempotencyKeyHash,
      },
      requestHash,
      new Date(now.getTime() + IDEMPOTENCY_RETENTION_MS),
    );

    if (claim.record.requestHash !== requestHash) {
      throwConflict("Idempotency key was used for a different request");
    }
    if (!claim.claimed) {
      if (claim.record.status === "completed") {
        return parseStoredResponse(claim.record.responseJson);
      }
      // failed/expired keys remain non-reusable; expiresAt is cleanup metadata.
      throwConflict("An equivalent request is already in progress or unavailable");
    }

    const existing = await findOwnedCaseById(
      tx,
      input.customerAccountId,
      input.caseId,
    );
    if (!existing) throwNeutralNotFound();
    if (
      existing.status !== input.fromStatus ||
      existing.stateVersion !== input.expectedStateVersion
    ) {
      throwConflict("Case state changed concurrently");
    }

    const updated = await compareAndSwapCaseStatus(tx, {
      id: existing.id,
      customerAccountId: input.customerAccountId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      expectedStateVersion: input.expectedStateVersion,
      now,
    });
    if (!updated) throwConflict("Case state changed concurrently");

    const response: TransitionResponse = {
      status: input.toStatus,
      stateVersion: input.expectedStateVersion + 1,
    };
    await appendAuditEvent(tx, {
      actorType: input.actorType,
      actorId: input.actorId,
      aggregateType: "diagnostic_case",
      aggregateId: existing.id,
      eventType: "diagnostic_case.status_changed",
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      outcome: "succeeded",
      reasonCode: input.reasonCode,
      requestId: input.requestId,
      idempotencyKeyHash,
      privacySafeMetadata: { stateVersion: response.stateVersion },
      createdAt: now,
    });
    await appendOutboxEvent(tx, {
      aggregateType: "diagnostic_case",
      aggregateId: existing.id,
      eventType: "diagnostic_case.status_changed",
      privacySafePayload: {
        caseId: existing.id,
        stateVersion: response.stateVersion,
        status: input.toStatus,
      },
      createdAt: now,
    });
    await completeIdempotencyRecord(tx, claim.record.id, response);
    return response;
  });
}
