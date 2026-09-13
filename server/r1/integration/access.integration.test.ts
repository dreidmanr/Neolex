import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditEvents } from "../../../drizzle/schema";
import { pilotAdminRouter } from "../admin/router";
import { pilotRouter } from "../cases/router";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  PUBLIC_A,
  PUBLIC_B,
  RUN_PREFIX,
  SESSION_A,
  SESSION_B,
  cleanRunData,
  context,
  db,
  seedOwners,
} from "./r1DbHarness";

describe("R1 real owner and admin callers", () => {
  beforeAll(async () => {
    await cleanRunData();
    await seedOwners();
  });

  afterAll(async () => {
    await cleanRunData();
  });

  it("enforces anonymous/OAuth/header/legacy-token separation and the A/B owner matrix", async () => {
    const anonymous = pilotRouter.createCaller(context());
    await expect(anonymous.cases.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const nonCustomerContexts = [
      context({ user: { id: 701, role: "admin" }, requestId: `${RUN_PREFIX}_oauth_admin_request` }),
      context({ authorization: "Bearer header_is_not_customer_auth", requestId: `${RUN_PREFIX}_bearer_request` }),
      context({ cookie: "app_session_id=legacy_session_token", requestId: `${RUN_PREFIX}_legacy_request` }),
    ];
    for (const candidate of nonCustomerContexts) {
      await expect(pilotRouter.createCaller(candidate).cases.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    }

    const callerA = pilotRouter.createCaller(context({
      customer: { accountId: ACCOUNT_A, sessionId: SESSION_A },
      requestId: `${RUN_PREFIX}_owner_a_request`,
    }));
    const callerB = pilotRouter.createCaller(context({
      customer: { accountId: ACCOUNT_B, sessionId: SESSION_B },
      requestId: `${RUN_PREFIX}_owner_b_request`,
    }));

    await expect(callerA.cases.list()).resolves.toEqual([
      expect.objectContaining({ publicId: PUBLIC_A }),
    ]);
    await expect(callerA.cases.get({ publicId: PUBLIC_A })).resolves.toMatchObject({ publicId: PUBLIC_A });
    await expect(callerB.cases.list()).resolves.toEqual([
      expect.objectContaining({ publicId: PUBLIC_B }),
    ]);
    await expect(callerB.cases.get({ publicId: PUBLIC_B })).resolves.toMatchObject({ publicId: PUBLIC_B });
  });

  it("returns the same neutral NOT_FOUND for cross-owner and missing IDs and audits no public ID", async () => {
    const requestCross = `${RUN_PREFIX}_owner_cross_request`;
    const requestMissing = `${RUN_PREFIX}_owner_missing_request`;
    const missingPublicId = `${RUN_PREFIX}_public_missing_case`;
    const crossCaller = pilotRouter.createCaller(context({
      customer: { accountId: ACCOUNT_A, sessionId: SESSION_A },
      requestId: requestCross,
    }));
    const missingCaller = pilotRouter.createCaller(context({
      customer: { accountId: ACCOUNT_A, sessionId: SESSION_A },
      requestId: requestMissing,
    }));

    const crossError = await crossCaller.cases.get({ publicId: PUBLIC_B }).catch(error => error);
    const missingError = await missingCaller.cases.get({ publicId: missingPublicId }).catch(error => error);
    expect({ code: crossError.code, message: crossError.message }).toEqual({
      code: "NOT_FOUND",
      message: "Resource not found",
    });
    expect({ code: missingError.code, message: missingError.message }).toEqual({
      code: "NOT_FOUND",
      message: "Resource not found",
    });

    const database = await db();
    const denied = await database.select().from(auditEvents).where(
      and(
        eq(auditEvents.eventType, "diagnostic_case.owner_access_denied"),
        eq(auditEvents.actorId, SESSION_A),
      ),
    );
    expect(denied).toHaveLength(2);
    expect(denied.map(row => row.requestId).sort()).toEqual([requestCross, requestMissing].sort());
    for (const event of denied) {
      expect(event.aggregateId).toBe("unresolved_case");
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain(PUBLIC_B);
      expect(serialized).not.toContain(missingPublicId);
    }
  });

  it("denies and audits non-admin and invalid-purpose callers without leaking raw purpose", async () => {
    const userRequest = `${RUN_PREFIX}_admin_user_denied`;
    const purposeRequest = `${RUN_PREFIX}_admin_purpose_denied`;
    const rawPurpose = `${RUN_PREFIX}_raw_curiosity`;

    await expect(pilotAdminRouter.createCaller(context({
      user: { id: 702, role: "user" },
      requestId: userRequest,
    })).diagnostics.list({ purposeCode: "support", limit: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(pilotAdminRouter.createCaller(context({
      user: { id: 703, role: "admin" },
      requestId: purposeRequest,
    })).diagnostics.list({ purposeCode: rawPurpose, limit: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Approved administrative purpose is required",
    });

    const database = await db();
    const events = await database.select().from(auditEvents).where(
      and(
        eq(auditEvents.aggregateId, "pilot_diagnostics"),
        eq(auditEvents.outcome, "denied"),
      ),
    );
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ requestId: userRequest, eventType: "diagnostic_case.admin_role_denied" }),
      expect.objectContaining({ requestId: purposeRequest, eventType: "diagnostic_case.admin_purpose_denied" }),
    ]));
    expect(JSON.stringify(events)).not.toContain(rawPurpose);
  });

  it("returns minimal paginated admin DTOs and persists one success audit per page", async () => {
    const firstRequest = `${RUN_PREFIX}_admin_page_one`;
    const secondRequest = `${RUN_PREFIX}_admin_page_two`;
    const admin = { id: 704, role: "admin" as const, email: `${RUN_PREFIX}@example.invalid` };
    const first = await pilotAdminRouter.createCaller(context({ user: admin, requestId: firstRequest }))
      .diagnostics.list({ purposeCode: "pilot_quality_review", limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();

    const second = await pilotAdminRouter.createCaller(context({ user: admin, requestId: secondRequest }))
      .diagnostics.list({
        purposeCode: "pilot_quality_review",
        limit: 1,
        cursor: first.nextCursor ?? undefined,
      });
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map(item => item.publicId))).toEqual(
      new Set([PUBLIC_A, PUBLIC_B]),
    );

    for (const item of [...first.items, ...second.items]) {
      expect(Object.keys(item).sort()).toEqual([
        "createdAt",
        "escalationStatus",
        "publicId",
        "reportStatus",
        "riskCategory",
        "status",
        "tier",
        "updatedAt",
      ]);
      const serialized = JSON.stringify(item);
      expect(serialized).not.toContain(ACCOUNT_A);
      expect(serialized).not.toContain(ACCOUNT_B);
      expect(serialized).not.toContain("@example.invalid");
      expect(serialized).not.toContain("token");
    }

    const database = await db();
    const audits = await database.select().from(auditEvents).where(
      eq(auditEvents.eventType, "diagnostic_case.admin_listed"),
    );
    const runAudits = audits.filter(row => [firstRequest, secondRequest].includes(row.requestId ?? ""));
    expect(runAudits).toHaveLength(2);
    expect(runAudits).toEqual(expect.arrayContaining([
      expect.objectContaining({ requestId: firstRequest, outcome: "succeeded", reasonCode: "pilot_quality_review" }),
      expect.objectContaining({ requestId: secondRequest, outcome: "succeeded", reasonCode: "pilot_quality_review" }),
    ]));
  });
});
