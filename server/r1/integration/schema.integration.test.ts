import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  authRateLimitBuckets,
  caseConsents,
  customerAccountIdentities,
  customerAccounts,
  customerSessions,
  diagnosticCases,
  emailDeliveries,
  idempotencyRecords,
  magicLinkTokens,
  outboxEvents,
  questionnaireAnswerRevisions,
  questionnaireDrafts,
  questionnaireRuleEvaluations,
  questionnaireSubmissions,
  reportSnapshots,
} from "../../../drizzle/schema";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  CASE_A,
  CASE_B,
  PUBLIC_A,
  RUN_PREFIX,
  SESSION_A,
  SESSION_B,
  cleanRunData,
  db,
  seedOwners,
} from "./r1DbHarness";

const R1_0005_TABLES = [
  "audit_events",
  "customer_account_identities",
  "customer_accounts",
  "customer_sessions",
  "diagnostic_cases",
  "idempotency_records",
  "legacy_ownership_cases",
  "legacy_resource_links",
  "migration_reconciliation_records",
  "migration_runs",
  "outbox_events",
] as const;

const R1_0006_TABLES = [
  "auth_rate_limit_buckets",
  "email_deliveries",
  "magic_link_tokens",
] as const;

const R1_0007_TABLES = [
  "access_grants",
  "case_consents",
  "payment_records",
  "tariff_snapshots",
] as const;

const R1_0008_TABLES = [
  "questionnaire_answer_revisions",
  "questionnaire_drafts",
  "questionnaire_submissions",
] as const;

const R1_0009_TABLES = ["questionnaire_rule_evaluations"] as const;
const R1_0010_TABLES = ["credit_entitlements", "report_snapshots"] as const;
const R1_0011_TABLES = ["report_pdf_artifacts"] as const;

const V2_TABLES = [
  ...R1_0005_TABLES,
  ...R1_0006_TABLES,
  ...R1_0007_TABLES,
  ...R1_0008_TABLES,
  ...R1_0009_TABLES,
  ...R1_0010_TABLES,
  ...R1_0011_TABLES,
] as const;

const LEGACY_TABLES = [
  "users",
  "consent_records",
  "contacts",
  "diagnostic_sessions",
  "questionnaire_answers",
  "scoring_results",
  "paid_answers",
  "paid_consent_records",
  "paid_documents",
  "paid_reports",
  "paid_sessions",
  "feedbacks",
] as const;

const REQUIRED_FOREIGN_KEYS = [
  "fk_customer_identity_account",
  "fk_customer_session_account",
  "fk_diagnostic_case_account",
  "fk_idempotency_account",
  "fk_legacy_ownership_account",
  "fk_legacy_link_migration_run",
  "fk_migration_recon_run",
  "fk_email_delivery_token_identity",
  "fk_magic_token_identity",
  "fk_magic_token_session",
  "fk_access_grant_payment_owner_case",
  "fk_case_consent_case_owner",
  "fk_case_consent_actor_owner",
  "fk_payment_record_case_owner",
  "fk_payment_record_tariff_snapshot",
  "fk_questionnaire_draft_case_owner",
  "fk_questionnaire_answer_revision_draft_owner_case",
  "fk_questionnaire_submission_draft_owner_case",
  "fk_questionnaire_rule_evaluation_owner",
  "fk_questionnaire_rule_evaluation_case_owner",
  "fk_questionnaire_rule_evaluation_submission_owner_case",
  "fk_questionnaire_rule_evaluation_source_outbox",
  "fk_report_snapshot_owner",
  "fk_report_snapshot_case_owner",
  "fk_report_snapshot_submission_owner_case",
  "fk_report_snapshot_evaluation_owner_case_submission",
  "fk_report_snapshot_source_outbox",
  "fk_report_snapshot_evaluation_source_outbox",
  "fk_credit_entitlement_owner",
  "fk_credit_entitlement_case_owner",
  "fk_credit_entitlement_payment_owner_case",
  "fk_credit_entitlement_report_owner_case",
  "fk_report_pdf_artifact_snapshot_owner_case",
] as const;

const REQUIRED_INDEXES = [
  "customer_account_identities_type_hash_uq",
  "customer_sessions_token_hash_uq",
  "customer_sessions_id_account_uq",
  "diagnostic_cases_public_id_uq",
  "idempotency_records_account_scope_key_uq",
  "legacy_ownership_cases_source_uq",
  "legacy_resource_links_source_target_type_uq",
  "migration_reconciliation_records_run_resource_uq",
  "outbox_events_event_id_uq",
  "outbox_events_dedupe_key_uq",
  "audit_events_aggregate_created_idx",
  "audit_events_actor_created_idx",
  "audit_events_event_created_idx",
  "customer_account_identities_account_status_idx",
  "customer_accounts_status_updated_idx",
  "customer_sessions_account_status_expiry_idx",
  "diagnostic_cases_owner_status_updated_idx",
  "idempotency_records_expiry_idx",
  "legacy_ownership_cases_status_created_idx",
  "legacy_ownership_cases_account_status_idx",
  "legacy_resource_links_target_idx",
  "legacy_resource_links_run_idx",
  "migration_reconciliation_records_status_created_idx",
  "migration_runs_status_created_idx",
  "migration_runs_phase_created_idx",
  "outbox_events_status_next_attempt_idx",
  "outbox_events_aggregate_created_idx",
  "magic_link_tokens_token_hash_uq",
  "magic_link_tokens_session_uq",
  "magic_link_tokens_id_identity_uq",
  "email_deliveries_token_uq",
  "email_deliveries_dedupe_key_uq",
  "auth_rate_limit_scope_bucket_window_uq",
  "auth_rate_limit_buckets_expiry_idx",
  "email_deliveries_status_next_idx",
  "email_deliveries_lease_expiry_idx",
  "email_deliveries_identity_created_idx",
  "magic_link_tokens_identity_status_expiry_idx",
  "diagnostic_cases_id_account_uq",
  "access_grants_case_payment_uq",
  "access_grants_payment_record_uq",
  "access_grants_owner_case_status_expiry_idx",
  "case_consents_assertion_uq",
  "case_consents_owner_case_accepted_idx",
  "case_consents_actor_idx",
  "payment_records_redemption_scope_uq",
  "payment_records_id_account_case_uq",
  "payment_records_owner_case_idx",
  "questionnaire_drafts_case_uq",
  "questionnaire_drafts_id_owner_case_uq",
  "questionnaire_drafts_owner_case_status_updated_idx",
  "questionnaire_answer_revisions_draft_question_revision_uq",
  "questionnaire_answer_revisions_draft_mutation_uq",
  "questionnaire_answer_revisions_draft_question_revision_idx",
  "questionnaire_answer_revisions_case_revision_idx",
  "questionnaire_submissions_case_version_uq",
  "questionnaire_submissions_case_input_hash_uq",
  "questionnaire_submissions_id_owner_case_uq",
  "questionnaire_submissions_owner_case_submitted_idx",
  "questionnaire_rule_evaluations_source_outbox_uq",
  "questionnaire_rule_evaluations_submission_ruleset_uq",
  "questionnaire_rule_evaluations_id_owner_case_submission_uq",
  "questionnaire_rule_evaluations_owner_case_status_idx",
  "outbox_events_lease_expiry_idx",
  "report_snapshots_case_version_uq",
  "report_snapshots_case_input_reason_uq",
  "report_snapshots_id_owner_case_uq",
  "report_snapshots_evaluation_uq",
  "report_snapshots_source_outbox_uq",
  "report_snapshots_case_ready_uq",
  "report_snapshots_owner_case_status_version_idx",
  "report_snapshots_status_lease_created_idx",
  "credit_entitlements_source_identity_uq",
  "credit_entitlements_report_uq",
  "credit_entitlements_owner_case_status_expiry_idx",
  "report_pdf_artifacts_snapshot_renderer_uq",
  "report_pdf_artifacts_id_owner_case_uq",
  "report_pdf_artifacts_owner_case_status_idx",
] as const;

const PRE_R1_MIGRATION_NAMES = [
  "0000_dark_robin_chapel.sql",
  "0001_wet_redwing.sql",
  "0002_massive_guardsmen.sql",
  "0003_lonely_unicorn.sql",
  "0004_first_sersi.sql",
] as const;
const R1_0005_MIGRATION_NAME = "0005_r1_access_control_expand.sql";
const R1_0006_MIGRATION_NAME = "0006_r1_magic_link_expand.sql";
const R1_0007_MIGRATION_NAME = "0007_r1_promo_access_expand.sql";
const R1_0008_MIGRATION_NAME = "0008_r1_questionnaire_expand.sql";
const R1_0009_MIGRATION_NAME = "0009_r1_rules_engine_foundation.sql";
const R1_0010_MIGRATION_NAME = "0010_r1_web_report_expand.sql";
const R1_0011_MIGRATION_NAME = "0011_r1_pdf_artifact_expand.sql";
const MIGRATION_NAMES = [
  ...PRE_R1_MIGRATION_NAMES,
  R1_0005_MIGRATION_NAME,
  R1_0006_MIGRATION_NAME,
  R1_0007_MIGRATION_NAME,
  R1_0008_MIGRATION_NAME,
  R1_0009_MIGRATION_NAME,
  R1_0010_MIGRATION_NAME,
  R1_0011_MIGRATION_NAME,
] as const;

type NamedRow = { TABLE_NAME: string };
type ForeignKeyRow = { CONSTRAINT_NAME: string };
type IndexRow = { INDEX_NAME: string };
type ColumnRow = { TABLE_NAME: string; COLUMN_NAME: string };
type CountRow = { rowCount: number | string | bigint };

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

function migrationStatements(migrationSql: string): string[] {
  return migrationSql
    .replace(/-->\s*statement-breakpoint/gi, "")
    .split(";")
    .map(statement => statement.trim())
    .filter(Boolean);
}

function opaqueId(kind: string): string {
  return `${RUN_PREFIX}_${kind}_${randomBytes(8).toString("hex")}`;
}

function opaqueHash(): string {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

async function expectCheckConstraintFailure(
  operation: PromiseLike<unknown>,
  constraintName: string,
): Promise<void> {
  let rejection: unknown;
  try {
    await operation;
  } catch (error) {
    rejection = error;
  }
  expect(rejection).toBeDefined();
  expect((rejection as { cause?: { message?: string } }).cause?.message).toContain(constraintName);
}

describe("R1 disposable database schema and constraints", () => {
  let legacyCounts: Map<string, number>;

  beforeAll(async () => {
    await cleanRunData();
    const database = await db();
    const counts = await Promise.all(LEGACY_TABLES.map(async tableName => {
      const result = await database.execute(sql.raw(`SELECT COUNT(*) AS rowCount FROM \`${tableName}\``));
      const row = (result[0] as CountRow[])[0];
      return [tableName, Number(row.rowCount)] as const;
    }));
    legacyCounts = new Map(counts);
  });

  afterAll(async () => {
    await cleanRunData();
  });

  it("has exactly the expected 25 v2 tables, 33 foreign keys, and required indexes", async () => {
    const database = await db();
    const tableResult = await database.execute(sql`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    const allTables = new Set((tableResult[0] as NamedRow[]).map(row => row.TABLE_NAME));
    const actualV2Tables = [...allTables].filter(tableName =>
      !LEGACY_TABLES.includes(tableName as typeof LEGACY_TABLES[number]) &&
      !tableName.startsWith("__drizzle"),
    );
    expect(sorted(actualV2Tables)).toEqual(sorted(V2_TABLES));
    expect(V2_TABLES).toHaveLength(25);

    const fkResult = await database.execute(sql`
      SELECT CONSTRAINT_NAME
      FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
    `);
    const foreignKeyNames = (fkResult[0] as ForeignKeyRow[]).map(row => row.CONSTRAINT_NAME);
    expect(sorted(foreignKeyNames)).toEqual(sorted(REQUIRED_FOREIGN_KEYS));
    expect(foreignKeyNames).toHaveLength(33);

    const indexResult = await database.execute(sql`
      SELECT DISTINCT INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    const indexNames = new Set((indexResult[0] as IndexRow[]).map(row => row.INDEX_NAME));
    for (const indexName of REQUIRED_INDEXES) expect(indexNames.has(indexName), indexName).toBe(true);
  });

  it("keeps every legacy table definition and row count present", async () => {
    const database = await db();
    const tableResult = await database.execute(sql`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    const allTables = new Set((tableResult[0] as NamedRow[]).map(row => row.TABLE_NAME));
    expect(LEGACY_TABLES.filter(name => allTables.has(name))).toEqual([...LEGACY_TABLES]);

    for (const tableName of LEGACY_TABLES) {
      const result = await database.execute(sql.raw(`SELECT COUNT(*) AS rowCount FROM \`${tableName}\``));
      const row = (result[0] as CountRow[])[0];
      expect(Number(row.rowCount), tableName).toBe(legacyCounts.get(tableName));
    }
  });

  it("keeps R1 migrations add-only and scopes 0006-0010 to their additive targets", async () => {
    const migrationDirectory = path.resolve(import.meta.dirname, "../../../drizzle");
    const migrationsByName = new Map(
      await Promise.all(
        MIGRATION_NAMES.map(async name => [
          name,
          await readFile(path.join(migrationDirectory, name), "utf8"),
        ] as const),
      ),
    );
    const r1Sql = migrationsByName.get(R1_0005_MIGRATION_NAME) ?? "";
    const magicLinkSql = migrationsByName.get(R1_0006_MIGRATION_NAME) ?? "";
    const promoSql = migrationsByName.get(R1_0007_MIGRATION_NAME) ?? "";
    const questionnaireSql = migrationsByName.get(R1_0008_MIGRATION_NAME) ?? "";
    const rulesSql = migrationsByName.get(R1_0009_MIGRATION_NAME) ?? "";
    const reportSql = migrationsByName.get(R1_0010_MIGRATION_NAME) ?? "";
    expect(r1Sql).not.toBe("");
    expect(magicLinkSql).not.toBe("");
    expect(promoSql).not.toBe("");
    expect(questionnaireSql).not.toBe("");
    expect(rulesSql).not.toBe("");
    expect(reportSql).not.toBe("");
    const destructiveSql = /(?:^|;)\s*(?:DROP\b|DELETE\b|TRUNCATE\b|RENAME\b|UPDATE\b|INSERT\b|REPLACE\b)|ALTER\s+TABLE\b[^;]*\b(?:DROP|MODIFY|CHANGE|RENAME)\b/im;
    expect(r1Sql).not.toMatch(destructiveSql);
    expect(magicLinkSql).not.toMatch(destructiveSql);
    expect(promoSql).not.toMatch(destructiveSql);
    expect(questionnaireSql).not.toMatch(destructiveSql);
    expect(rulesSql).not.toMatch(destructiveSql);
    expect(reportSql).not.toMatch(destructiveSql);

    const alterTargets = [...r1Sql.matchAll(/ALTER\s+TABLE\s+`([^`]+)`/gi)].map(match => match[1]);
    expect(alterTargets).toHaveLength(7);
    for (const target of alterTargets) {
      expect(R1_0005_TABLES).toContain(target as typeof R1_0005_TABLES[number]);
    }

    const magicLinkStatements = migrationStatements(magicLinkSql);
    for (const statement of magicLinkStatements) {
      expect(statement).toMatch(/^(?:CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX)\b/i);
    }
    const createTargets = [...magicLinkSql.matchAll(/CREATE\s+TABLE\s+`([^`]+)`/gi)]
      .map(match => match[1]);
    expect(sorted(createTargets)).toEqual(sorted(R1_0006_TABLES));
    const magicLinkAlterTargets = [...magicLinkSql.matchAll(/ALTER\s+TABLE\s+`([^`]+)`/gi)]
      .map(match => match[1]);
    expect(magicLinkAlterTargets).toHaveLength(3);
    for (const target of magicLinkAlterTargets) {
      expect(R1_0006_TABLES).toContain(target as typeof R1_0006_TABLES[number]);
    }
    const magicLinkAlterStatements = magicLinkStatements.filter(statement =>
      /^ALTER\s+TABLE\b/i.test(statement),
    );
    for (const statement of magicLinkAlterStatements) {
      expect(statement).toMatch(
        /^ALTER\s+TABLE\s+`[^`]+`\s+ADD\s+CONSTRAINT\s+`[^`]+`\s+FOREIGN\s+KEY\b/i,
      );
    }
    const magicLinkIndexTargets = [...magicLinkSql.matchAll(/CREATE\s+INDEX\s+`[^`]+`\s+ON\s+`([^`]+)`/gi)]
      .map(match => match[1]);
    for (const target of magicLinkIndexTargets) {
      expect(R1_0006_TABLES).toContain(target as typeof R1_0006_TABLES[number]);
    }

    const promoStatements = migrationStatements(promoSql);
    for (const statement of promoStatements) {
      expect(statement).toMatch(/^(?:CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX)\b/i);
    }
    const promoCreateTargets = [...promoSql.matchAll(/CREATE\s+TABLE\s+`([^`]+)`/gi)].map(match => match[1]);
    expect(sorted(promoCreateTargets)).toEqual(sorted(R1_0007_TABLES));
    const promoAlterTargets = [...promoSql.matchAll(/ALTER\s+TABLE\s+`([^`]+)`/gi)].map(match => match[1]);
    expect(promoAlterTargets).toEqual(expect.arrayContaining(["customer_sessions", "diagnostic_cases", ...R1_0007_TABLES.slice(0, 3)]));
    for (const statement of promoStatements.filter(statement => /^ALTER\s+TABLE\b/i.test(statement))) {
      expect(statement).toMatch(/^ALTER\s+TABLE\s+`[^`]+`\s+ADD\s+CONSTRAINT\s+`[^`]+`/i);
    }
    const promoIndexTargets = [...promoSql.matchAll(/CREATE\s+INDEX\s+`[^`]+`\s+ON\s+`([^`]+)`/gi)].map(match => match[1]);
    for (const target of promoIndexTargets) expect(R1_0007_TABLES).toContain(target as typeof R1_0007_TABLES[number]);

    const questionnaireStatements = migrationStatements(questionnaireSql);
    for (const statement of questionnaireStatements) {
      expect(statement).toMatch(/^(?:CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX)\b/i);
    }
    const questionnaireCreateTargets = [
      ...questionnaireSql.matchAll(/CREATE\s+TABLE\s+`([^`]+)`/gi),
    ].map(match => match[1]);
    expect(sorted(questionnaireCreateTargets)).toEqual(sorted(R1_0008_TABLES));
    const questionnaireAlterTargets = [
      ...questionnaireSql.matchAll(/ALTER\s+TABLE\s+`([^`]+)`/gi),
    ].map(match => match[1]);
    expect(questionnaireAlterTargets).toHaveLength(3);
    for (const target of questionnaireAlterTargets) {
      expect(R1_0008_TABLES).toContain(target as typeof R1_0008_TABLES[number]);
    }
    for (const statement of questionnaireStatements.filter(statement => /^ALTER\s+TABLE\b/i.test(statement))) {
      expect(statement).toMatch(
        /^ALTER\s+TABLE\s+`[^`]+`\s+ADD\s+CONSTRAINT\s+`[^`]+`\s+FOREIGN\s+KEY\b/i,
      );
    }
    const questionnaireIndexTargets = [
      ...questionnaireSql.matchAll(/CREATE\s+INDEX\s+`[^`]+`\s+ON\s+`([^`]+)`/gi),
    ].map(match => match[1]);
    for (const target of questionnaireIndexTargets) {
      expect(R1_0008_TABLES).toContain(target as typeof R1_0008_TABLES[number]);
    }

    const rulesStatements = migrationStatements(rulesSql);
    for (const statement of rulesStatements) {
      expect(statement).toMatch(/^(?:CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX)\b/i);
    }
    const rulesCreateTargets = [
      ...rulesSql.matchAll(/CREATE\s+TABLE\s+`([^`]+)`/gi),
    ].map(match => match[1]);
    expect(sorted(rulesCreateTargets)).toEqual(sorted(R1_0009_TABLES));
    const rulesAlterTargets = [
      ...rulesSql.matchAll(/ALTER\s+TABLE\s+`([^`]+)`/gi),
    ].map(match => match[1]);
    expect(new Set(rulesAlterTargets)).toEqual(new Set([
      "outbox_events",
      "questionnaire_submissions",
      "questionnaire_rule_evaluations",
    ]));
    expect(rulesSql).toContain("ADD `leaseVersion` int DEFAULT 0 NOT NULL");
    expect(rulesSql).not.toContain("`inputSnapshotJson` json");

    const reportStatements = migrationStatements(reportSql);
    for (const statement of reportStatements) {
      expect(statement).toMatch(/^(?:CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX)\b/i);
    }
    const reportCreateTargets = [
      ...reportSql.matchAll(/CREATE\s+TABLE\s+`([^`]+)`/gi),
    ].map(match => match[1]);
    expect(sorted(reportCreateTargets)).toEqual(sorted(R1_0010_TABLES));
    const reportAlterTargets = [
      ...reportSql.matchAll(/ALTER\s+TABLE\s+`([^`]+)`/gi),
    ].map(match => match[1]);
    expect(new Set(reportAlterTargets)).toEqual(new Set(R1_0010_TABLES));
    for (const statement of reportStatements.filter(statement =>
      /^ALTER\s+TABLE\b/i.test(statement) && statement.includes("CONSTRAINT"),
    )) {
      expect(statement).toMatch(
        /^ALTER\s+TABLE\s+`(?:report_snapshots|credit_entitlements)`\s+ADD\s+CONSTRAINT\s+`[^`]+`\s+FOREIGN\s+KEY\b/i,
      );
    }
    expect(reportSql).not.toContain("`inputSnapshotJson` json");
    expect(reportSql).not.toContain("`outcomeJson` json");

    const legacyDefinitions = PRE_R1_MIGRATION_NAMES
      .map(name => migrationsByName.get(name) ?? "")
      .join("\n");
    for (const tableName of LEGACY_TABLES) {
      expect(legacyDefinitions).toMatch(new RegExp(`CREATE\\s+TABLE\\s+\\\`${tableName}\\\``, "i"));
    }
  });

  it("keeps promo tables free of raw promo, provider, legal body, URL, and numeric price columns", async () => {
    const database = await db();
    const columnResult = await database.execute(sql`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('access_grants', 'case_consents', 'payment_records', 'tariff_snapshots')
    `);
    const normalized = (columnResult[0] as ColumnRow[]).map(row => row.COLUMN_NAME.replaceAll("_", "").toLowerCase());
    expect(normalized.filter(name => /promovalue|verifier|pepper|email|legalbody|documentbody|url/.test(name))).toEqual([]);
    expect(normalized.filter(name => /price|priceamount/.test(name))).toEqual([]);
    expect(normalized).toContain("chargedamount");
  });

  it("enforces owner FK, publicId uniqueness, and idempotency scope/key uniqueness", async () => {
    await seedOwners();
    const database = await db();

    await expect(database.insert(diagnosticCases).values({
      id: `${RUN_PREFIX}_missing_owner_case`,
      publicId: `${RUN_PREFIX}_missing_owner_public`,
      customerAccountId: `${RUN_PREFIX}_absent_owner`,
      serviceTier: "lexy-advanced-diagnostic",
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_NO_REFERENCED_ROW_2" }) });

    await expect(database.insert(diagnosticCases).values({
      id: `${RUN_PREFIX}_duplicate_public_case`,
      publicId: PUBLIC_A,
      customerAccountId: ACCOUNT_A,
      serviceTier: "lexy-advanced-diagnostic",
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_DUP_ENTRY" }) });

    const expiresAt = new Date(Date.now() + 60_000);
    await database.insert(idempotencyRecords).values({
      id: `${RUN_PREFIX}_idem_first`,
      customerAccountId: ACCOUNT_A,
      scope: "constraint_test",
      idempotencyKey: `${RUN_PREFIX}_same_key`,
      requestHash: "a".repeat(64),
      expiresAt,
    });
    await expect(database.insert(idempotencyRecords).values({
      id: `${RUN_PREFIX}_idem_second`,
      customerAccountId: ACCOUNT_A,
      scope: "constraint_test",
      idempotencyKey: `${RUN_PREFIX}_same_key`,
      requestHash: "b".repeat(64),
      expiresAt,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_DUP_ENTRY" }) });

    const caseRows = await database.select().from(diagnosticCases).where(sql`${diagnosticCases.id} = ${CASE_A}`);
    expect(caseRows).toHaveLength(1);
    const accountRows = await database.select().from(customerAccounts).where(sql`${customerAccounts.id} = ${ACCOUNT_A}`);
    expect(accountRows).toHaveLength(1);
  });

  it("enforces Questionnaire v2 ownership, revision, submission, and opaque-data constraints", async () => {
    await cleanRunData();
    await seedOwners();
    const database = await db();
    const now = new Date("2026-02-01T00:00:00.000Z");
    const draftId = opaqueId("questionnaire_draft");
    const releaseId = opaqueId("questionnaire_release");
    const questionnaireVersion = "questionnaire_v2";
    const questionnaireContentHash = opaqueHash();
    const visibleSetHash = opaqueHash();

    await expect(database.insert(questionnaireDrafts).values({
      id: opaqueId("draft_cross_owner"),
      customerAccountId: ACCOUNT_B,
      diagnosticCaseId: CASE_A,
      questionnaireReleaseId: releaseId,
      questionnaireVersion,
      questionnaireContentHash,
      draftRevision: 0,
      visibleQuestionIds: ["question_a"],
      visibleSetHash,
      manualFollowUpTriggerIds: [],
      createdAt: now,
      updatedAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_NO_REFERENCED_ROW_2" }) });

    await expectCheckConstraintFailure(database.insert(questionnaireDrafts).values({
      id: opaqueId("draft_negative_revision"),
      customerAccountId: ACCOUNT_B,
      diagnosticCaseId: CASE_B,
      questionnaireReleaseId: releaseId,
      questionnaireVersion,
      questionnaireContentHash,
      draftRevision: -1,
      visibleQuestionIds: ["question_a"],
      visibleSetHash,
      manualFollowUpTriggerIds: [],
      createdAt: now,
      updatedAt: now,
    }), "chk_questionnaire_draft_revision_nonnegative");

    await database.insert(questionnaireDrafts).values({
      id: draftId,
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireReleaseId: releaseId,
      questionnaireVersion,
      questionnaireContentHash,
      draftRevision: 1,
      currentQuestionId: "question_a",
      visibleQuestionIds: ["question_a", "question_b"],
      visibleSetHash,
      manualFollowUpRequired: false,
      manualFollowUpTriggerIds: [],
      createdAt: now,
      updatedAt: now,
    });

    await expect(database.insert(questionnaireDrafts).values({
      id: opaqueId("duplicate_case_draft"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireReleaseId: releaseId,
      questionnaireVersion,
      questionnaireContentHash,
      visibleQuestionIds: ["question_a"],
      visibleSetHash,
      manualFollowUpTriggerIds: [],
      createdAt: now,
      updatedAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_DUP_ENTRY" }) });

    const questionId = "question_a";
    const mutationHash = opaqueHash();
    await expect(database.insert(questionnaireAnswerRevisions).values({
      id: opaqueId("revision_missing_draft"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireDraftId: opaqueId("absent_draft"),
      questionId,
      draftRevision: 1,
      valueJson: { choiceId: "choice_a" },
      answerState: "active",
      source: "customer",
      clientMutationIdHash: opaqueHash(),
      createdAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_NO_REFERENCED_ROW_2" }) });

    await expect(database.insert(questionnaireAnswerRevisions).values({
      id: opaqueId("revision_cross_owner"),
      customerAccountId: ACCOUNT_B,
      diagnosticCaseId: CASE_B,
      questionnaireDraftId: draftId,
      questionId,
      draftRevision: 1,
      valueJson: { choiceId: "choice_a" },
      answerState: "active",
      source: "customer",
      clientMutationIdHash: opaqueHash(),
      createdAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_NO_REFERENCED_ROW_2" }) });

    await expectCheckConstraintFailure(database.insert(questionnaireAnswerRevisions).values({
      id: opaqueId("revision_zero"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireDraftId: draftId,
      questionId,
      draftRevision: 0,
      valueJson: null,
      answerState: "inactive",
      source: "system_branch_recompute",
      clientMutationIdHash: opaqueHash(),
      deactivationReasonCode: "branch_hidden",
      createdAt: now,
    }), "chk_questionnaire_answer_revision_positive");

    await database.insert(questionnaireAnswerRevisions).values({
      id: opaqueId("revision_valid"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireDraftId: draftId,
      questionId,
      draftRevision: 1,
      valueJson: { choiceId: "choice_a" },
      answerState: "active",
      source: "customer",
      clientMutationIdHash: mutationHash,
      createdAt: now,
    });

    await expect(database.insert(questionnaireAnswerRevisions).values({
      id: opaqueId("revision_duplicate_question"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireDraftId: draftId,
      questionId,
      draftRevision: 1,
      valueJson: { choiceId: "choice_b" },
      answerState: "active",
      source: "customer",
      clientMutationIdHash: opaqueHash(),
      createdAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_DUP_ENTRY" }) });

    await expect(database.insert(questionnaireAnswerRevisions).values({
      id: opaqueId("revision_duplicate_mutation"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireDraftId: draftId,
      questionId: "question_b",
      draftRevision: 2,
      valueJson: { choiceId: "choice_b" },
      answerState: "active",
      source: "customer",
      clientMutationIdHash: mutationHash,
      createdAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_DUP_ENTRY" }) });

    const inputSnapshotHash = opaqueHash();
    const legalCoreReleaseId = "lexy-r0-2026-09-12";
    const legalCoreVersion = "1.0.0-draft.1";
    const rulesetId = "rules_v1";
    const rulesetBundleHash = opaqueHash();
    await expect(database.insert(questionnaireSubmissions).values({
      id: opaqueId("submission_cross_owner"),
      customerAccountId: ACCOUNT_B,
      diagnosticCaseId: CASE_B,
      questionnaireDraftId: draftId,
      submissionVersion: 1,
      questionnaireReleaseId: releaseId,
      questionnaireVersion,
      questionnaireContentHash,
      legalCoreReleaseId,
      legalCoreVersion,
      rulesetId,
      rulesetBundleHash,
      visibleQuestionIds: [questionId],
      visibleSetHash,
      manualFollowUpRequired: false,
      manualFollowUpTriggerIds: [],
      inputSnapshotJson: { [questionId]: { choiceId: "choice_a" } },
      inputSnapshotHash,
      submittedAt: now,
      createdAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_NO_REFERENCED_ROW_2" }) });

    await expectCheckConstraintFailure(database.insert(questionnaireSubmissions).values({
      id: opaqueId("submission_nonpositive"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireDraftId: draftId,
      submissionVersion: 0,
      questionnaireReleaseId: releaseId,
      questionnaireVersion,
      questionnaireContentHash,
      legalCoreReleaseId,
      legalCoreVersion,
      rulesetId,
      rulesetBundleHash,
      visibleQuestionIds: [questionId],
      visibleSetHash,
      manualFollowUpRequired: false,
      manualFollowUpTriggerIds: [],
      inputSnapshotJson: { [questionId]: { choiceId: "choice_a" } },
      inputSnapshotHash: opaqueHash(),
      submittedAt: now,
      createdAt: now,
    }), "chk_questionnaire_submission_version_positive");

    await database.insert(questionnaireSubmissions).values({
      id: opaqueId("submission_valid"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireDraftId: draftId,
      submissionVersion: 1,
      questionnaireReleaseId: releaseId,
      questionnaireVersion,
      questionnaireContentHash,
      legalCoreReleaseId,
      legalCoreVersion,
      rulesetId,
      rulesetBundleHash,
      visibleQuestionIds: [questionId],
      visibleSetHash,
      manualFollowUpRequired: false,
      manualFollowUpTriggerIds: [],
      inputSnapshotJson: { [questionId]: { choiceId: "choice_a" } },
      inputSnapshotHash,
      submittedAt: now,
      createdAt: now,
    });

    await expect(database.insert(questionnaireSubmissions).values({
      id: opaqueId("submission_duplicate_version"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireDraftId: draftId,
      submissionVersion: 1,
      questionnaireReleaseId: releaseId,
      questionnaireVersion,
      questionnaireContentHash,
      legalCoreReleaseId,
      legalCoreVersion,
      rulesetId,
      rulesetBundleHash,
      visibleQuestionIds: [questionId],
      visibleSetHash,
      manualFollowUpRequired: false,
      manualFollowUpTriggerIds: [],
      inputSnapshotJson: { [questionId]: { choiceId: "choice_b" } },
      inputSnapshotHash: opaqueHash(),
      submittedAt: now,
      createdAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_DUP_ENTRY" }) });

    await expect(database.insert(questionnaireSubmissions).values({
      id: opaqueId("submission_duplicate_hash"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireDraftId: draftId,
      submissionVersion: 2,
      questionnaireReleaseId: releaseId,
      questionnaireVersion,
      questionnaireContentHash,
      legalCoreReleaseId,
      legalCoreVersion,
      rulesetId,
      rulesetBundleHash,
      visibleQuestionIds: [questionId],
      visibleSetHash,
      manualFollowUpRequired: false,
      manualFollowUpTriggerIds: [],
      inputSnapshotJson: { [questionId]: { choiceId: "choice_a" } },
      inputSnapshotHash,
      submittedAt: now,
      createdAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_DUP_ENTRY" }) });

    const columnResult = await database.execute(sql`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'questionnaire_drafts',
          'questionnaire_answer_revisions',
          'questionnaire_submissions'
        )
    `);
    const normalizedColumnNames = (columnResult[0] as ColumnRow[])
      .map(row => row.COLUMN_NAME.replaceAll("_", "").toLowerCase());
    expect(normalizedColumnNames.filter(name =>
      /rawtoken|tokenvalue|email|legalbody|documentbody|url|promo|price/.test(name)
    )).toEqual([]);
  });

  it("enforces report snapshot source fences, uniqueness, and lifecycle contracts", async () => {
    await cleanRunData();
    await seedOwners();
    const database = await db();
    const now = new Date("2026-02-01T00:00:00.000Z");
    const draftId = opaqueId("report_draft");
    const submissionId = opaqueId("report_submission");
    const evaluationId = opaqueId("report_evaluation");
    const sourceOutboxId = opaqueId("report_source_outbox");
    const inputSnapshotHash = opaqueHash();
    const outcomeHash = opaqueHash();
    const rulesetBundleHash = opaqueHash();

    await database.insert(questionnaireDrafts).values({
      id: draftId,
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireReleaseId: "report_questionnaire",
      questionnaireVersion: "1.0.0",
      questionnaireContentHash: opaqueHash(),
      status: "submitted",
      draftRevision: 1,
      visibleQuestionIds: ["question_a"],
      visibleSetHash: opaqueHash(),
      manualFollowUpRequired: false,
      manualFollowUpTriggerIds: [],
      createdAt: now,
      updatedAt: now,
    });
    await database.insert(questionnaireSubmissions).values({
      id: submissionId,
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireDraftId: draftId,
      submissionVersion: 1,
      questionnaireReleaseId: "report_questionnaire",
      questionnaireVersion: "1.0.0",
      questionnaireContentHash: opaqueHash(),
      legalCoreReleaseId: "report_legal_core",
      legalCoreVersion: "1.0.0",
      rulesetId: "report_rules",
      rulesetBundleHash,
      visibleQuestionIds: ["question_a"],
      visibleSetHash: opaqueHash(),
      manualFollowUpRequired: false,
      manualFollowUpTriggerIds: [],
      inputSnapshotJson: {
        activeAnswers: { question_a: { choiceId: "choice_a" } },
      },
      inputSnapshotHash,
      submittedAt: now,
      createdAt: now,
    });
    await database.insert(outboxEvents).values({
      id: sourceOutboxId,
      eventId: opaqueId("report_event"),
      dedupeKey: opaqueHash(),
      aggregateType: "questionnaire_submission",
      aggregateId: submissionId,
      eventType: "questionnaire.submitted_for_scoring",
      privacySafePayload: {
        caseId: CASE_A,
        submissionId,
        inputSnapshotHash,
      },
      status: "published",
      attemptCount: 1,
      leaseVersion: 1,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await database.insert(questionnaireRuleEvaluations).values({
      id: evaluationId,
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireSubmissionId: submissionId,
      sourceOutboxEventId: sourceOutboxId,
      submittedCaseStateVersion: 1,
      rulesetId: "report_rules",
      rulesetVersion: "1.0.0",
      rulesetHash: rulesetBundleHash,
      inputSnapshotHash,
      status: "succeeded",
      outcomeJson: { classification: "validated" },
      outcomeHash,
      manualReviewRequired: false,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const baseSnapshot = {
      id: opaqueId("report_snapshot"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireSubmissionId: submissionId,
      questionnaireRuleEvaluationId: evaluationId,
      sourceOutboxEventId: sourceOutboxId,
      reportVersion: 1,
      templateVersion: "web_report_v1",
      inputSnapshotHash,
      outcomeHash,
      rulesetBundleHash,
      status: "pending" as const,
      generationMode: "template" as const,
      leaseVersion: 0,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await expect(
      database.insert(reportSnapshots).values({
        ...baseSnapshot,
        id: opaqueId("report_cross_owner"),
        customerAccountId: ACCOUNT_B,
      })
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "ER_NO_REFERENCED_ROW_2" }),
    });

    await expect(
      database.insert(reportSnapshots).values({
        ...baseSnapshot,
        id: opaqueId("report_bad_source"),
        sourceOutboxEventId: opaqueId("missing_outbox"),
      })
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "ER_NO_REFERENCED_ROW_2" }),
    });

    await expectCheckConstraintFailure(
      database.insert(reportSnapshots).values({
        ...baseSnapshot,
        id: opaqueId("report_bad_pending"),
        payloadJson: { leaked: true },
        payloadHash: opaqueHash(),
        contentHash: opaqueHash(),
      }),
      "chk_report_snapshot_lifecycle"
    );

    await database.insert(reportSnapshots).values(baseSnapshot);
    await expect(
      database.insert(reportSnapshots).values({
        ...baseSnapshot,
        id: opaqueId("report_duplicate_evaluation"),
        reportVersion: 2,
        templateVersion: "web_report_v2",
      })
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "ER_DUP_ENTRY" }),
    });

    const processingAt = new Date(now.getTime() + 1_000);
    const readyAt = new Date(now.getTime() + 2_000);
    const leaseExpiresAt = new Date(now.getTime() + 60_000);
    await database
      .update(reportSnapshots)
      .set({
        status: "processing",
        leaseOwner: "report_worker_a",
        leaseVersion: 1,
        leaseExpiresAt,
        attemptCount: 1,
        lastAttemptAt: processingAt,
        updatedAt: processingAt,
      })
      .where(sql`${reportSnapshots.id} = ${baseSnapshot.id}`);
    const payloadHash = opaqueHash();
    const contentHash = opaqueHash();
    await database
      .update(reportSnapshots)
      .set({
        status: "ready",
        readySlot: 1,
        leaseOwner: null,
        leaseExpiresAt: null,
        payloadJson: { sections: [{ id: "summary", blocks: [] }] },
        payloadHash,
        contentHash,
        completedAt: readyAt,
        updatedAt: readyAt,
      })
      .where(sql`${reportSnapshots.id} = ${baseSnapshot.id}`);

    await expectCheckConstraintFailure(
      database
        .update(reportSnapshots)
        .set({
          status: "failed",
          readySlot: null,
          payloadJson: { forbidden: "failed_payload" },
          payloadHash,
          contentHash,
          failureCode: "technical_failure",
        })
        .where(sql`${reportSnapshots.id} = ${baseSnapshot.id}`),
      "chk_report_snapshot_lifecycle"
    );

    const readyRows = await database
      .select()
      .from(reportSnapshots)
      .where(sql`${reportSnapshots.id} = ${baseSnapshot.id}`);
    expect(readyRows).toHaveLength(1);
    expect(readyRows[0]).toMatchObject({
      status: "ready",
      readySlot: 1,
      payloadHash,
      contentHash,
      failureCode: null,
    });

    const columnResult = await database.execute(sql`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'report_snapshots'
    `);
    const normalizedColumnNames = (columnResult[0] as ColumnRow[]).map(row =>
      row.COLUMN_NAME.replaceAll("_", "").toLowerCase()
    );
    expect(
      normalizedColumnNames.filter(name =>
        /rawanswer|answertext|legalreport|reportmarkdown|outcometext/.test(name)
      )
    ).toEqual([]);
  });

  it("rejects a consent actor session owned by another customer account", async () => {
    await cleanRunData();
    await seedOwners();
    const database = await db();
    const now = new Date("2026-02-01T00:00:00.000Z");

    await expect(database.insert(caseConsents).values({
      id: opaqueId("cross_owner_consent"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      documentId: "termsdraft",
      documentVersion: "drafttestv1",
      contentHash: opaqueHash(),
      consentType: "terms",
      accepted: true,
      actorCustomerSessionId: SESSION_B,
      acceptedAt: now,
      createdAt: now,
    })).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "ER_NO_REFERENCED_ROW_2" }),
    });

    await expect(database.insert(caseConsents).values({
      id: opaqueId("owned_consent"),
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      documentId: "termsdraft",
      documentVersion: "drafttestv1",
      contentHash: opaqueHash(),
      consentType: "terms",
      accepted: true,
      actorCustomerSessionId: SESSION_A,
      acceptedAt: now,
      createdAt: now,
    })).resolves.toBeDefined();

    expect(await database.select().from(customerSessions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: SESSION_A, customerAccountId: ACCOUNT_A }),
        expect.objectContaining({ id: SESSION_B, customerAccountId: ACCOUNT_B }),
      ])
    );
  });

  it("enforces Magic Link opaque-data FKs and uniqueness constraints", async () => {
    await cleanRunData();
    await seedOwners();
    const database = await db();
    const now = new Date("2026-02-01T00:00:00.000Z");
    const expiresAt = new Date(now.getTime() + 15 * 60_000);
    const identityA = opaqueId("identity_a");
    const identityB = opaqueId("identity_b");
    await database.insert(customerAccountIdentities).values([
      {
        id: identityA,
        customerAccountId: ACCOUNT_A,
        identityType: "email",
        identityHash: opaqueHash(),
        status: "active",
        createdAt: now,
      },
      {
        id: identityB,
        customerAccountId: ACCOUNT_B,
        identityType: "email",
        identityHash: opaqueHash(),
        status: "active",
        createdAt: now,
      },
    ]);

    const tokenA = opaqueId("magic_a");
    const tokenAHash = opaqueHash();
    await database.insert(magicLinkTokens).values({
      id: tokenA,
      customerAccountIdentityId: identityA,
      tokenHash: tokenAHash,
      requestScope: "magic_login",
      tokenKeyVersion: 1,
      status: "active",
      expiresAt,
      correlationId: opaqueId("correlation_a"),
      createdAt: now,
      updatedAt: now,
    });

    await expect(database.insert(magicLinkTokens).values({
      id: opaqueId("magic_missing_identity"),
      customerAccountIdentityId: opaqueId("missing_identity"),
      tokenHash: opaqueHash(),
      requestScope: "magic_login",
      tokenKeyVersion: 1,
      status: "active",
      expiresAt,
      correlationId: opaqueId("correlation_missing"),
      createdAt: now,
      updatedAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_NO_REFERENCED_ROW_2" }) });

    await expect(database.insert(magicLinkTokens).values({
      id: opaqueId("magic_duplicate_hash"),
      customerAccountIdentityId: identityB,
      tokenHash: tokenAHash,
      requestScope: "magic_login",
      tokenKeyVersion: 1,
      status: "active",
      expiresAt,
      correlationId: opaqueId("correlation_duplicate"),
      createdAt: now,
      updatedAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_DUP_ENTRY" }) });

    const tokenB = opaqueId("magic_b");
    await database.insert(magicLinkTokens).values({
      id: tokenB,
      customerAccountIdentityId: identityB,
      tokenHash: opaqueHash(),
      requestScope: "magic_login",
      tokenKeyVersion: 1,
      status: "active",
      expiresAt,
      correlationId: opaqueId("correlation_b"),
      createdAt: now,
      updatedAt: now,
    });

    await expect(database.insert(emailDeliveries).values({
      id: opaqueId("delivery_mismatch"),
      magicLinkTokenId: tokenB,
      customerAccountIdentityId: identityA,
      deliveryKind: "magic_link_constraint_test",
      status: "queued",
      dedupeKey: opaqueHash(),
      attemptCount: 0,
      leaseVersion: 0,
      templateVersion: "magic_link_v1",
      createdAt: now,
      updatedAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_NO_REFERENCED_ROW_2" }) });

    await database.insert(emailDeliveries).values({
      id: opaqueId("delivery_valid"),
      magicLinkTokenId: tokenB,
      customerAccountIdentityId: identityB,
      deliveryKind: "magic_link_constraint_test",
      status: "queued",
      dedupeKey: opaqueHash(),
      attemptCount: 0,
      leaseVersion: 0,
      templateVersion: "magic_link_v1",
      createdAt: now,
      updatedAt: now,
    });

    const bucketScope = "magic_link_request";
    const bucketHash = opaqueHash();
    const windowStartedAt = new Date("2026-02-01T00:00:00.000Z");
    const bucketExpiresAt = new Date("2026-02-01T00:10:00.000Z");
    await database.insert(authRateLimitBuckets).values({
      id: opaqueId("rate_bucket_a"),
      scope: bucketScope,
      bucketHash,
      windowStartedAt,
      count: 1,
      expiresAt: bucketExpiresAt,
      createdAt: now,
      updatedAt: now,
    });
    await expect(database.insert(authRateLimitBuckets).values({
      id: opaqueId("rate_bucket_duplicate"),
      scope: bucketScope,
      bucketHash,
      windowStartedAt,
      count: 2,
      expiresAt: bucketExpiresAt,
      createdAt: now,
      updatedAt: now,
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_DUP_ENTRY" }) });

    const columnResult = await database.execute(sql`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('magic_link_tokens', 'email_deliveries', 'auth_rate_limit_buckets')
    `);
    const normalizedColumnNames = (columnResult[0] as ColumnRow[])
      .map(row => row.COLUMN_NAME.replaceAll("_", "").toLowerCase());
    expect(normalizedColumnNames.filter(name => /email|url|body/.test(name))).toEqual([]);
    expect(normalizedColumnNames.filter(name => ["token", "rawtoken", "tokenvalue"].includes(name)))
      .toEqual([]);
  });
});
