import { createHmac } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { DiagnosticCase } from "../../../drizzle/schema";
import { ENV } from "../../_core/env";
import { appendAuditEvent } from "../audit/auditRepository";
import { requireR1Database } from "../database";
import {
  claimIdempotencyRecord,
  completeIdempotencyRecord,
} from "../idempotency/idempotencyRepository";
import { appendOutboxEvent } from "../outbox/outboxRepository";
import { throwConflict } from "../policy/errors";
import { assertSyntheticTestAllowed } from "../releaseGate";
import { newR1Id } from "../ids";
import { insertCase, toCaseDto, type CaseDto } from "./caseRepository";

const CREATE_SYNTHETIC_SCOPE = "pilot.case.create_synthetic";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function commandHash(serviceTier: "base_diagnostic"): string {
  if (!ENV.customerSessionSecret) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Pilot security configuration is unavailable",
    });
  }
  return createHmac("sha256", ENV.customerSessionSecret)
    .update(JSON.stringify({ serviceTier }))
    .digest("hex");
}

function keyHash(rawKey: string): string {
  if (!ENV.customerSessionSecret) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Pilot security configuration is unavailable",
    });
  }
  return createHmac("sha256", ENV.customerSessionSecret)
    .update(rawKey)
    .digest("hex");
}

function parseStoredResponse(value: unknown): CaseDto {
  if (!value || typeof value !== "object") {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored command response is invalid",
    });
  }
  const item = value as Record<string, unknown>;
  if (
    typeof item.publicId !== "string" ||
    typeof item.status !== "string" ||
    typeof item.serviceTier !== "string" ||
    typeof item.stateVersion !== "number" ||
    typeof item.createdAt !== "string" ||
    typeof item.updatedAt !== "string"
  ) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored command response is invalid",
    });
  }
  return {
    publicId: item.publicId,
    status: item.status as DiagnosticCase["status"],
    serviceTier: item.serviceTier,
    stateVersion: item.stateVersion,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  };
}

function storedResponse(dto: CaseDto): Record<string, unknown> {
  return {
    ...dto,
    createdAt: dto.createdAt.toISOString(),
    updatedAt: dto.updatedAt.toISOString(),
  };
}

export async function createSyntheticCase(input: {
  customerAccountId: string;
  customerSessionId: string;
  serviceTier: "base_diagnostic";
  idempotencyKey: string;
  requestId: string;
}): Promise<CaseDto> {
  assertSyntheticTestAllowed();
  const db = await requireR1Database();
  const now = new Date();
  const requestHash = commandHash(input.serviceTier);
  const hashedKey = keyHash(input.idempotencyKey);

  return db.transaction(async tx => {
    const claim = await claimIdempotencyRecord(
      tx,
      {
        customerAccountId: input.customerAccountId,
        scope: CREATE_SYNTHETIC_SCOPE,
        keyHash: hashedKey,
      },
      requestHash,
      new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
    );

    if (claim.record.requestHash !== requestHash) {
      throwConflict("Idempotency key was used for a different request");
    }
    if (!claim.claimed) {
      if (claim.record.status === "completed") {
        return parseStoredResponse(claim.record.responseJson);
      }
      throwConflict("An equivalent request is already in progress");
    }

    const row: DiagnosticCase = {
      id: newR1Id("case"),
      publicId: newR1Id("public"),
      customerAccountId: input.customerAccountId,
      serviceTier: input.serviceTier,
      status: "draft",
      stateVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    await insertCase(tx, row);
    const dto = toCaseDto(row);

    await appendAuditEvent(tx, {
      actorType: "customer_session",
      actorId: input.customerSessionId,
      aggregateType: "diagnostic_case",
      aggregateId: row.id,
      eventType: "diagnostic_case.synthetic_created",
      outcome: "succeeded",
      toStatus: "draft",
      requestId: input.requestId,
      idempotencyKeyHash: hashedKey,
      privacySafeMetadata: {
        serviceTier: input.serviceTier,
        stateVersion: row.stateVersion,
        synthetic: true,
      },
      createdAt: now,
    });
    await appendOutboxEvent(tx, {
      aggregateType: "diagnostic_case",
      aggregateId: row.id,
      eventType: "diagnostic_case.synthetic_created",
      privacySafePayload: {
        caseId: row.id,
        stateVersion: row.stateVersion,
        synthetic: true,
      },
      createdAt: now,
    });
    await completeIdempotencyRecord(tx, claim.record.id, storedResponse(dto));
    return dto;
  });
}
