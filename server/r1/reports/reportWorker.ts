import type { R1Database } from "../database";
import { buildReportSnapshot } from "./reportSnapshotBuilder";
import {
  claimOneReportSnapshot,
  completeReportSnapshot,
  failReportSnapshot,
  type ReportSnapshotFailureCode,
  type ReportSnapshotLeaseFence,
} from "./reportSnapshotRepository";
import {
  loadVerifiedReportBuildInputForUpdate,
  ReportGenerationSourceError,
} from "./reportGenerationService";
import { ReportSourceBundleValidationError } from "./sourceBundleValidator";
import {
  canonicalSha256,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";
import type { ReportValidationClassification } from "./types";
import {
  attachCreditEntitlement,
  CreditEntitlementPolicyError,
  persistCreditEntitlement,
  planCreditEntitlement,
} from "../credits/creditEntitlementService";

const DEFAULT_LEASE_MS = 60_000;

export type ReportWorkerOptions = Readonly<{
  leaseOwner: string;
  now: () => Date;
  leaseDurationMs?: number;
}>;

export type ReportWorkerResult =
  | Readonly<{ processed: false; reason: "empty" | "lease_lost" }>
  | Readonly<{
      processed: true;
      status: "ready" | "failed";
      reportSnapshotId: string;
      failureCode?: ReportSnapshotFailureCode;
    }>;

function clock(options: ReportWorkerOptions): Date {
  const value = options.now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("Invalid report worker clock");
  }
  return value;
}

function failureForClassification(
  classification: ReportValidationClassification,
): ReportSnapshotFailureCode {
  switch (classification) {
    case "source_hash_mismatch":
    case "source_fence_invalid":
      return "source_fence_invalid";
    case "answer_lineage_invalid":
      return "answer_lineage_invalid";
    case "payment_access_invalid":
      return "payment_access_invalid";
    case "legal_evidence_incomplete":
      return "legal_evidence_incomplete";
    case "report_schema_source_data_unavailable":
      return "source_data_missing";
    case "cross_reference_invalid":
    case "schema_validation_failed":
    case "forbidden_metadata":
      return "payload_invalid";
    case "recommendation_cardinality_invalid":
    case "input_evaluation_inconsistent":
    case "non_draft_safe_status":
    case "invalid_provenance":
      return "evaluation_invalid";
  }
}

function failureForIssues(error: ReportSourceBundleValidationError): ReportSnapshotFailureCode {
  return failureForClassification(error.issues[0]?.classification ?? "source_fence_invalid");
}

/** Claims and atomically completes or terminally fails one internal report job. */
export async function processOneReportJob(
  database: R1Database,
  options: ReportWorkerOptions,
): Promise<ReportWorkerResult> {
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_MS;
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.leaseOwner) ||
    typeof options.now !== "function" ||
    !Number.isSafeInteger(leaseDurationMs) ||
    leaseDurationMs <= 0
  ) {
    throw new TypeError("Invalid report worker options");
  }

  const claimNow = clock(options);
  const claimed = await claimOneReportSnapshot(database, {
    leaseOwner: options.leaseOwner,
    now: claimNow,
    leaseExpiresAt: new Date(claimNow.getTime() + leaseDurationMs),
  });
  if (!claimed) return Object.freeze({ processed: false, reason: "empty" });

  return database.transaction(async tx => {
    const now = clock(options);
    const lease: ReportSnapshotLeaseFence = {
      reportSnapshotId: claimed.id,
      customerAccountId: claimed.customerAccountId,
      diagnosticCaseId: claimed.diagnosticCaseId,
      leaseOwner: options.leaseOwner,
      leaseVersion: claimed.leaseVersion,
      now,
    };

    let buildInput;
    try {
      buildInput = await loadVerifiedReportBuildInputForUpdate(tx, lease, now);
    } catch (error) {
      const failureCode = error instanceof ReportSourceBundleValidationError
        ? failureForIssues(error)
        : error instanceof ReportGenerationSourceError
          ? error.code
          : "technical_failure";
      const failed = await failReportSnapshot(tx, { ...lease, failureCode });
      return failed
        ? Object.freeze({ processed: true, status: "failed", reportSnapshotId: claimed.id, failureCode })
        : Object.freeze({ processed: false, reason: "lease_lost" });
    }

    const built = buildReportSnapshot(buildInput.input);
    if (built.kind === "validation_failure") {
      const failureCode = failureForClassification(built.classification);
      const failed = await failReportSnapshot(tx, { ...lease, failureCode });
      return failed
        ? Object.freeze({ processed: true, status: "failed", reportSnapshotId: claimed.id, failureCode })
        : Object.freeze({ processed: false, reason: "lease_lost" });
    }

    let completedSnapshot = built.snapshot;
    try {
      const plan = planCreditEntitlement(
        buildInput.source,
        completedSnapshot,
        now,
      );
      if (plan) {
        completedSnapshot = attachCreditEntitlement(completedSnapshot, plan.snapshot);
        await persistCreditEntitlement(tx, plan);
      }
    } catch (error) {
      const failureCode = error instanceof CreditEntitlementPolicyError
        ? "payment_access_invalid"
        : "technical_failure";
      const failed = await failReportSnapshot(tx, { ...lease, failureCode });
      return failed
        ? Object.freeze({ processed: true, status: "failed", reportSnapshotId: claimed.id, failureCode })
        : Object.freeze({ processed: false, reason: "lease_lost" });
    }

    const checksums = completedSnapshot.checksums;
    const checksumRecord = checksums !== null &&
      typeof checksums === "object" &&
      !Array.isArray(checksums)
      ? checksums as Readonly<Record<string, CanonicalJsonValue>>
      : null;
    const contentHash = typeof checksumRecord?.snapshotPayloadSha256 === "string"
      ? checksumRecord.snapshotPayloadSha256
      : canonicalSha256(completedSnapshot);
    const completed = await completeReportSnapshot(tx, {
      ...lease,
      payloadJson: completedSnapshot,
      payloadHash: canonicalSha256(completedSnapshot),
      contentHash,
    });
    return completed
      ? Object.freeze({ processed: true, status: "ready", reportSnapshotId: claimed.id })
      : Object.freeze({ processed: false, reason: "lease_lost" });
  });
}
