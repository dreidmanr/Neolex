import { and, desc, eq, lt, or } from "drizzle-orm";
import {
  diagnosticCases,
  type DiagnosticCase,
  type InsertDiagnosticCase,
} from "../../../drizzle/schema";
import type { R1Executor } from "../database";

export type CaseStatus = DiagnosticCase["status"];
export type CaseServiceTier = "base_diagnostic";

export type CaseDto = {
  publicId: string;
  status: CaseStatus;
  serviceTier: string;
  stateVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminCaseDto = {
  publicId: string;
  status: CaseStatus;
  tier: string;
  riskCategory: null;
  escalationStatus: null;
  reportStatus: null;
  createdAt: Date;
  updatedAt: Date;
};

export function toCaseDto(row: DiagnosticCase): CaseDto {
  return {
    publicId: row.publicId,
    status: row.status,
    serviceTier: row.serviceTier,
    stateVersion: row.stateVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertCase(
  executor: R1Executor,
  value: InsertDiagnosticCase,
): Promise<void> {
  await executor.insert(diagnosticCases).values(value);
}

export async function listOwnedCases(
  executor: R1Executor,
  customerAccountId: string,
): Promise<CaseDto[]> {
  const rows = await executor
    .select()
    .from(diagnosticCases)
    .where(eq(diagnosticCases.customerAccountId, customerAccountId))
    .orderBy(desc(diagnosticCases.updatedAt), desc(diagnosticCases.publicId));
  return rows.map(toCaseDto);
}

export async function findOwnedCaseByPublicId(
  executor: R1Executor,
  customerAccountId: string,
  publicId: string,
): Promise<DiagnosticCase | null> {
  const rows = await executor
    .select()
    .from(diagnosticCases)
    .where(
      and(
        eq(diagnosticCases.publicId, publicId),
        eq(diagnosticCases.customerAccountId, customerAccountId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function findOwnedCaseById(
  executor: R1Executor,
  customerAccountId: string,
  id: string,
): Promise<DiagnosticCase | null> {
  const rows = await executor
    .select()
    .from(diagnosticCases)
    .where(
      and(
        eq(diagnosticCases.id, id),
        eq(diagnosticCases.customerAccountId, customerAccountId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function compareAndSwapCaseStatus(
  executor: R1Executor,
  input: {
    id: string;
    customerAccountId: string;
    fromStatus: CaseStatus;
    toStatus: CaseStatus;
    expectedStateVersion: number;
    now: Date;
  },
): Promise<boolean> {
  const result = await executor
    .update(diagnosticCases)
    .set({
      status: input.toStatus,
      stateVersion: input.expectedStateVersion + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(diagnosticCases.id, input.id),
        eq(diagnosticCases.customerAccountId, input.customerAccountId),
        eq(diagnosticCases.status, input.fromStatus),
        eq(diagnosticCases.stateVersion, input.expectedStateVersion),
      ),
    );
  return Number(result[0].affectedRows) === 1;
}

export async function listCasesForAdmin(
  executor: R1Executor,
  input: {
    limit: number;
    cursor?: { updatedAt: Date; publicId: string };
  },
): Promise<AdminCaseDto[]> {
  const cursorPredicate = input.cursor
    ? or(
        lt(diagnosticCases.updatedAt, input.cursor.updatedAt),
        and(
          eq(diagnosticCases.updatedAt, input.cursor.updatedAt),
          lt(diagnosticCases.publicId, input.cursor.publicId),
        ),
      )
    : undefined;
  const rows = await executor
    .select({
      publicId: diagnosticCases.publicId,
      status: diagnosticCases.status,
      tier: diagnosticCases.serviceTier,
      createdAt: diagnosticCases.createdAt,
      updatedAt: diagnosticCases.updatedAt,
    })
    .from(diagnosticCases)
    .where(cursorPredicate)
    .orderBy(desc(diagnosticCases.updatedAt), desc(diagnosticCases.publicId))
    .limit(input.limit);
  return rows.map(row => ({
    ...row,
    riskCategory: null,
    escalationStatus: null,
    reportStatus: null,
  }));
}
