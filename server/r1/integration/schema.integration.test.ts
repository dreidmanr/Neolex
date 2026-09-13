import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  customerAccounts,
  diagnosticCases,
  idempotencyRecords,
} from "../../../drizzle/schema";
import {
  ACCOUNT_A,
  CASE_A,
  PUBLIC_A,
  RUN_PREFIX,
  cleanRunData,
  db,
  seedOwners,
} from "./r1DbHarness";

const V2_TABLES = [
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

const REQUIRED_INDEXES = [
  "customer_account_identities_type_hash_uq",
  "customer_sessions_token_hash_uq",
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
] as const;

type NamedRow = { TABLE_NAME: string };
type IndexRow = { INDEX_NAME: string };
type CountRow = { rowCount: number | string | bigint };

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

  it("has exactly the expected 11 v2 tables, seven foreign keys, and required indexes", async () => {
    const database = await db();
    const tableResult = await database.execute(sql`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    const allTables = new Set((tableResult[0] as NamedRow[]).map(row => row.TABLE_NAME));
    expect(V2_TABLES.filter(name => allTables.has(name))).toEqual([...V2_TABLES]);
    expect(V2_TABLES).toHaveLength(11);

    const fkResult = await database.execute(sql`
      SELECT TABLE_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    expect(fkResult[0]).toHaveLength(7);

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

  it("statically rejects destructive migration SQL and permits ALTER only on v2 targets", async () => {
    const migrationDirectory = path.resolve(import.meta.dirname, "../../../drizzle");
    const migrationNames = [
      "0000_dark_robin_chapel.sql",
      "0001_wet_redwing.sql",
      "0002_massive_guardsmen.sql",
      "0003_lonely_unicorn.sql",
      "0004_first_sersi.sql",
      "0005_r1_access_control_expand.sql",
    ];
    const migrationSql = await Promise.all(
      migrationNames.map(name => readFile(path.join(migrationDirectory, name), "utf8")),
    );
    const r1Sql = migrationSql.at(-1) ?? "";
    expect(r1Sql).not.toMatch(
      /(?:^|;)\s*(?:DROP\b|DELETE\s+FROM\b|TRUNCATE\b|RENAME\b|ALTER\s+TABLE\b[^;]*\b(?:MODIFY|CHANGE)\b)/im,
    );

    const alterTargets = [...r1Sql.matchAll(/ALTER\s+TABLE\s+`([^`]+)`/gi)].map(match => match[1]);
    expect(alterTargets).toHaveLength(7);
    for (const target of alterTargets) expect(V2_TABLES).toContain(target as typeof V2_TABLES[number]);

    const legacyDefinitions = migrationSql.slice(0, -1).join("\n");
    for (const tableName of LEGACY_TABLES) {
      expect(legacyDefinitions).toMatch(new RegExp(`CREATE\\s+TABLE\\s+\\\`${tableName}\\\``, "i"));
    }
  });

  it("enforces owner FK, publicId uniqueness, and idempotency scope/key uniqueness", async () => {
    await seedOwners();
    const database = await db();

    await expect(database.insert(diagnosticCases).values({
      id: `${RUN_PREFIX}_missing_owner_case`,
      publicId: `${RUN_PREFIX}_missing_owner_public`,
      customerAccountId: `${RUN_PREFIX}_absent_owner`,
      serviceTier: "base_diagnostic",
    })).rejects.toMatchObject({ cause: expect.objectContaining({ code: "ER_NO_REFERENCED_ROW_2" }) });

    await expect(database.insert(diagnosticCases).values({
      id: `${RUN_PREFIX}_duplicate_public_case`,
      publicId: PUBLIC_A,
      customerAccountId: ACCOUNT_A,
      serviceTier: "base_diagnostic",
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
});
