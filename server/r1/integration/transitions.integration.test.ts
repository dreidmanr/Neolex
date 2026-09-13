import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  auditEvents,
  customerAccounts,
  diagnosticCases,
  idempotencyRecords,
  outboxEvents,
} from "../../../drizzle/schema";
import { transitionCase, type TransitionCaseInput } from "../transitions/transitionService";
import {
  ACCOUNT_A,
  CASE_A,
  RUN_PREFIX,
  cleanRunData,
  db,
  seedOwners,
} from "./r1DbHarness";

const requestId = (suffix: string) => `${RUN_PREFIX}_${suffix}_request`;
const key = (suffix: string) => `${RUN_PREFIX}_${suffix}_key`;

function transition(overrides: Partial<TransitionCaseInput> = {}): TransitionCaseInput {
  return {
    caseId: CASE_A,
    customerAccountId: ACCOUNT_A,
    actorType: "customer_account",
    actorId: ACCOUNT_A,
    fromStatus: "draft",
    toStatus: "access_granted",
    expectedStateVersion: 1,
    reasonCode: "test_harness",
    idempotencyKey: key("transition"),
    requestId: requestId("transition"),
    ...overrides,
  };
}

async function caseState(caseId = CASE_A) {
  const database = await db();
  const rows = await database.select().from(diagnosticCases).where(eq(diagnosticCases.id, caseId));
  return rows[0];
}

async function artifacts(caseId: string, accountId: string) {
  const database = await db();
  const [idempotency, audit, outbox] = await Promise.all([
    database.select().from(idempotencyRecords).where(eq(idempotencyRecords.customerAccountId, accountId)),
    database.select().from(auditEvents).where(eq(auditEvents.aggregateId, caseId)),
    database.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, caseId)),
  ]);
  return { idempotency, audit, outbox };
}

describe("R1 real transition transactions", () => {
  beforeAll(async () => {
    await cleanRunData();
  });

  beforeEach(async () => {
    await cleanRunData();
    await seedOwners();
  });

  afterAll(async () => {
    await cleanRunData();
  });

  it("commits CAS + one idempotency + one audit + one outbox and replays without duplicates", async () => {
    const command = transition({ idempotencyKey: key("replay"), requestId: requestId("replay") });
    await expect(transitionCase(command)).resolves.toEqual({ status: "access_granted", stateVersion: 2 });
    await expect(transitionCase(command)).resolves.toEqual({ status: "access_granted", stateVersion: 2 });

    expect(await caseState()).toMatchObject({ status: "access_granted", stateVersion: 2 });
    const persisted = await artifacts(CASE_A, ACCOUNT_A);
    expect(persisted.idempotency).toHaveLength(1);
    expect(persisted.idempotency[0]).toMatchObject({ status: "completed" });
    expect(persisted.audit).toHaveLength(1);
    expect(persisted.audit[0]).toMatchObject({
      eventType: "diagnostic_case.status_changed",
      requestId: requestId("replay"),
    });
    expect(persisted.outbox).toHaveLength(1);
    expect(persisted.outbox[0]).toMatchObject({
      dedupeKey: `case-transition:${CASE_A}:v2`,
      eventType: "diagnostic_case.status_changed",
    });
  });

  it("conflicts when the same idempotency key is reused for a different command", async () => {
    const commonKey = key("different_command");
    await transitionCase(transition({ idempotencyKey: commonKey, requestId: requestId("first_command") }));
    await expect(transitionCase(transition({
      idempotencyKey: commonKey,
      requestId: requestId("different_command"),
      actorId: `${RUN_PREFIX}_other_actor`,
    }))).rejects.toMatchObject({ code: "CONFLICT" });

    const persisted = await artifacts(CASE_A, ACCOUNT_A);
    expect(persisted.idempotency).toHaveLength(1);
    expect(persisted.audit).toHaveLength(1);
    expect(persisted.outbox).toHaveLength(1);
  });

  it("allows exactly one winner when different keys race the same version", async () => {
    const results = await Promise.allSettled([
      transitionCase(transition({ idempotencyKey: key("race_a"), requestId: requestId("race_a") })),
      transitionCase(transition({ idempotencyKey: key("race_b"), requestId: requestId("race_b") })),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(result => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: expect.objectContaining({ code: "CONFLICT" }) });

    expect(await caseState()).toMatchObject({ status: "access_granted", stateVersion: 2 });
    const persisted = await artifacts(CASE_A, ACCOUNT_A);
    expect(persisted.idempotency).toHaveLength(1);
    expect(persisted.audit).toHaveLength(1);
    expect(persisted.outbox).toHaveLength(1);
  });

  it("rolls back a stale-version attempt without command artifacts", async () => {
    await expect(transitionCase(transition({
      expectedStateVersion: 2,
      idempotencyKey: key("stale"),
      requestId: requestId("stale"),
    }))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await caseState()).toMatchObject({ status: "draft", stateVersion: 1 });
    const persisted = await artifacts(CASE_A, ACCOUNT_A);
    expect(persisted.idempotency).toHaveLength(0);
    expect(persisted.audit).toHaveLength(0);
    expect(persisted.outbox).toHaveLength(0);
  });

  it("rolls back CAS and every artifact when audit contract rejects after CAS", async () => {
    await expect(transitionCase(transition({
      actorId: `${RUN_PREFIX}@invalid.example`,
      idempotencyKey: key("audit_rollback"),
      requestId: requestId("audit_rollback"),
    }))).rejects.toBeTruthy();

    expect(await caseState()).toMatchObject({ status: "draft", stateVersion: 1 });
    const persisted = await artifacts(CASE_A, ACCOUNT_A);
    expect(persisted.idempotency).toHaveLength(0);
    expect(persisted.audit).toHaveLength(0);
    expect(persisted.outbox).toHaveLength(0);
  });

  it("rolls back CAS/idempotency/audit when the exact next-version outbox dedupe key exists", async () => {
    const database = await db();
    const preseedId = `${RUN_PREFIX}_preseed_outbox`;
    await database.insert(outboxEvents).values({
      id: preseedId,
      eventId: `${RUN_PREFIX}_preseed_event`,
      dedupeKey: `case-transition:${CASE_A}:v2`,
      aggregateType: "diagnostic_case",
      aggregateId: CASE_A,
      eventType: "diagnostic_case.status_changed",
      privacySafePayload: { caseId: CASE_A, stateVersion: 2, status: "access_granted" },
      status: "pending",
      attemptCount: 0,
    });

    await expect(transitionCase(transition({
      idempotencyKey: key("outbox_rollback"),
      requestId: requestId("outbox_rollback"),
    }))).rejects.toBeTruthy();

    expect(await caseState()).toMatchObject({ status: "draft", stateVersion: 1 });
    const persisted = await artifacts(CASE_A, ACCOUNT_A);
    expect(persisted.idempotency).toHaveLength(0);
    expect(persisted.audit).toHaveLength(0);
    expect(persisted.outbox).toHaveLength(1);
    expect(persisted.outbox[0]?.id).toBe(preseedId);
  });

  it("does not weaken ownership inside transitions", async () => {
    const database = await db();
    const otherAccount = `${RUN_PREFIX}_transition_other_account`;
    await database.insert(customerAccounts).values({ id: otherAccount, status: "active" });
    await expect(transitionCase(transition({
      customerAccountId: otherAccount,
      idempotencyKey: key("wrong_owner"),
      requestId: requestId("wrong_owner"),
    }))).rejects.toMatchObject({ code: "NOT_FOUND", message: "Resource not found" });

    expect(await caseState()).toMatchObject({ status: "draft", stateVersion: 1 });
    const foreignIdempotency = await database.select().from(idempotencyRecords).where(
      and(
        eq(idempotencyRecords.customerAccountId, otherAccount),
        eq(idempotencyRecords.scope, "pilot.case.transition"),
      ),
    );
    expect(foreignIdempotency).toHaveLength(0);
  });
});
