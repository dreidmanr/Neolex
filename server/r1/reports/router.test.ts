import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";
import { parseAuditEvent } from "../events/contracts";
import { REPORT_TEST_WATERMARK } from "./types";

const mocks = vi.hoisted(() => ({
  appendAuditEvent: vi.fn(),
  findActiveOwnedAccessGrant: vi.fn(),
  findOwnedCaseByPublicId: vi.fn(),
  loadReadyReportSnapshotByPublicCase: vi.fn(),
  deriveReportViewModel: vi.fn(),
}));

vi.mock("../database", () => ({
  requireR1Database: vi.fn().mockResolvedValue({}),
}));
vi.mock("../audit/auditRepository", () => ({
  appendAuditEvent: mocks.appendAuditEvent,
}));
vi.mock("../billing/accessPolicy", () => ({
  findActiveOwnedAccessGrant: mocks.findActiveOwnedAccessGrant,
}));
vi.mock("../cases/caseRepository", () => ({
  findOwnedCaseByPublicId: mocks.findOwnedCaseByPublicId,
}));
vi.mock("./reportSnapshotRepository", () => ({
  loadReadyReportSnapshotByPublicCase:
    mocks.loadReadyReportSnapshotByPublicCase,
}));
vi.mock("./reportViewModel", () => ({
  deriveReportViewModel: mocks.deriveReportViewModel,
}));
vi.mock("../releaseGate", () => ({
  assertTechnicalPilotAllowed: vi.fn(() => ({
    mode: "synthetic",
    clientRuntimeAllowed: false,
    syntheticTestAllowed: true,
    technicalPilotAllowed: true,
  })),
}));

import { reportsRouter } from "./router";

const persistedPayload = {
  persisted: "validated-snapshot-marker",
  canonicalAnswers: [{ text: "raw_answer_must_not_escape" }],
  customerAccountId: "account_owner_a",
  contentHash: "hidden_hash_value",
  shareUrl: "https://storage.invalid/hidden-report",
};
const safeView = {
  reportId: "report_public_01",
  reportVersion: 1,
  generatedAt: "2026-09-14T12:00:00.000Z",
  watermark: REPORT_TEST_WATERMARK,
  documentStatus: "draft_preliminary" as const,
  title: "Техническая оценка",
  summary: "Краткое безопасное резюме.",
  overallSeverity: "medium" as const,
  risks: [
    {
      riskId: "risk_public_01",
      title: "Договорный риск",
      severity: "medium" as const,
      evidenceStatus: "questionnaire_based" as const,
      manualReviewRequired: false,
    },
  ],
  legalBases: [
    {
      legalBasisId: "basis_public_01",
      actTitle: "Нормативный акт",
      articleReference: "статья 1",
      displayWording: "Безопасная формулировка основания.",
      verificationStatus: "draft_pending_legal_review" as const,
    },
  ],
  roadmap: {
    day0: [],
    day30: [],
    day60: [],
    day90: [],
  },
  recommendation: {
    productCode: "start_product" as const,
    displayName: "Стартовый пакет",
    fixedPackageOfferAllowed: true,
  },
  escalation: {
    required: false,
    status: "not_required" as const,
    clientSummary: "Дополнительная проверка не указана.",
    clientCta: null,
  },
  limitations: [
    {
      category: "Границы анализа",
      statement: "Основано только на доступных данных.",
      requiresFollowUp: false,
    },
  ],
  credit: null,
};

function context(
  customer: TrpcContext["customer"] = {
    accountId: "account_owner_a",
    sessionId: "session_owner_a",
  }
): TrpcContext {
  return {
    user: null,
    customer,
    requestId: "request_report_router_test_01",
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

async function expectNeutralNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "Resource not found",
  });
}

describe("owner-bound report read router", () => {
  beforeEach(() => {
    mocks.appendAuditEvent.mockResolvedValue(undefined);
    mocks.findOwnedCaseByPublicId.mockResolvedValue({
      id: "case_internal_a",
      customerAccountId: "account_owner_a",
    });
    mocks.findActiveOwnedAccessGrant.mockResolvedValue({
      grant: {},
      payment: {},
    });
    mocks.loadReadyReportSnapshotByPublicCase.mockResolvedValue({
      payloadJson: persistedPayload,
    });
    mocks.deriveReportViewModel.mockReturnValue(safeView);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns only the tiny watermarked projection for owner A with active access", async () => {
    const result = await reportsRouter.createCaller(context()).getByCase({
      publicId: "case_public_owner_a_01",
    });

    expect(result).toEqual(safeView);
    expect(mocks.findOwnedCaseByPublicId).toHaveBeenCalledWith(
      {},
      "account_owner_a",
      "case_public_owner_a_01"
    );
    expect(mocks.findActiveOwnedAccessGrant).toHaveBeenCalledWith(
      {},
      "account_owner_a",
      "case_internal_a"
    );
    expect(mocks.loadReadyReportSnapshotByPublicCase).toHaveBeenCalledWith(
      {},
      {
        customerAccountId: "account_owner_a",
        casePublicId: "case_public_owner_a_01",
      }
    );
    expect(mocks.deriveReportViewModel).toHaveBeenCalledWith(persistedPayload);
    expect(mocks.appendAuditEvent).not.toHaveBeenCalled();

    const json = JSON.stringify(result);
    for (const forbidden of [
      "canonicalAnswers",
      "activeAnswers",
      "answerTextSecret",
      "raw_answer_must_not_escape",
      "https://storage.invalid/hidden-report",
      "hidden_hash_value",
      "payloadHash",
      "contentHash",
      "account_owner_a",
      "case_internal_a",
      "paymentRecordId",
      "accessGrantId",
      "sourceOutboxEventId",
      "shareUrl",
      "downloadUrl",
      "storageKey",
      "officialSourceUrl",
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it.each([
    ["owner B", "case"],
    ["inactive access", "access"],
    ["unready report", "snapshot"],
  ] as const)(
    "normalizes %s to the same denial even when audit fails",
    async (_label, stage) => {
      const customer =
        stage === "case"
          ? { accountId: "account_owner_b", sessionId: "session_owner_b" }
          : { accountId: "account_owner_a", sessionId: "session_owner_a" };
      if (stage === "case")
        mocks.findOwnedCaseByPublicId.mockResolvedValue(null);
      if (stage === "access")
        mocks.findActiveOwnedAccessGrant.mockResolvedValue(null);
      if (stage === "snapshot")
        mocks.loadReadyReportSnapshotByPublicCase.mockResolvedValue(null);
      mocks.appendAuditEvent.mockRejectedValue(new Error("audit unavailable"));

      await expectNeutralNotFound(
        reportsRouter
          .createCaller(context(customer))
          .getByCase({ publicId: "case_unavailable_0001" })
      );
      expect(mocks.appendAuditEvent).toHaveBeenCalledWith(
        {},
        {
          actorType: "customer_session",
          actorId: customer.sessionId,
          aggregateType: "report_snapshot",
          aggregateId: "unresolved_report",
          eventType: "report.access_denied",
          outcome: "denied",
          reasonCode: "owner_entitlement_or_readiness_miss",
          requestId: "request_report_router_test_01",
          privacySafeMetadata: { resourceClass: "report" },
        }
      );
      expect(JSON.stringify(mocks.appendAuditEvent.mock.calls)).not.toContain(
        "case_unavailable_0001"
      );
    }
  );

  it("rejects anonymous callers before any report lookup", async () => {
    await expect(
      reportsRouter.createCaller(context(null)).getByCase({
        publicId: "case_public_owner_a_01",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.findOwnedCaseByPublicId).not.toHaveBeenCalled();
    expect(mocks.loadReadyReportSnapshotByPublicCase).not.toHaveBeenCalled();
  });

  it("fails closed when projection is malformed or contains a hidden field", async () => {
    mocks.deriveReportViewModel.mockReturnValue({
      ...safeView,
      canonicalAnswers: [{ text: "answerTextSecret" }],
    });

    await expectNeutralNotFound(
      reportsRouter.createCaller(context()).getByCase({
        publicId: "case_public_owner_a_01",
      })
    );
    expect(mocks.appendAuditEvent).toHaveBeenCalledOnce();
  });

  it("uses a strict privacy-safe schema for report denial audit", () => {
    expect(
      parseAuditEvent({
        actorType: "customer_session",
        actorId: "session_owner_a",
        aggregateType: "report_snapshot",
        aggregateId: "unresolved_report",
        eventType: "report.access_denied",
        outcome: "denied",
        reasonCode: "owner_entitlement_or_readiness_miss",
        requestId: "request_report_router_test_01",
        privacySafeMetadata: { resourceClass: "report" },
      })
    ).toMatchObject({ eventType: "report.access_denied" });
    expect(() =>
      parseAuditEvent({
        actorType: "customer_session",
        actorId: "session_owner_a",
        aggregateType: "report_snapshot",
        aggregateId: "unresolved_report",
        eventType: "report.access_denied",
        outcome: "denied",
        reasonCode: "owner_entitlement_or_readiness_miss",
        requestId: "request_report_router_test_01",
        privacySafeMetadata: {
          resourceClass: "report",
          publicId: "case_must_not_enter_audit",
        },
      })
    ).toThrow();
  });

  it("accepts strict publicId input only", async () => {
    await expect(
      reportsRouter.createCaller(context()).getByCase({
        publicId: "case_public_owner_a_01",
        extra: "forbidden",
      } as { publicId: string })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.findOwnedCaseByPublicId).not.toHaveBeenCalled();
  });
});
