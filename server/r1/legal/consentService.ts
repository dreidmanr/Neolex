import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { caseConsents } from "../../../drizzle/schema";
import type { R1Executor } from "../database";
import { newR1Id } from "../ids";
import {
  CONSENT_TYPES,
  getDocumentRegistryForValidation,
  type ConsentType,
} from "./documentRegistry";

export const consentAssertionSchema = z.object({
  documentId: z.string().min(1).max(64),
  documentVersion: z.string().min(1).max(64),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  consentType: z.enum(CONSENT_TYPES),
  accepted: z.boolean(),
}).strict();

export const consentAssertionsSchema = z.array(consentAssertionSchema).length(3);
export type ConsentAssertion = z.infer<typeof consentAssertionSchema>;

function invalidConsentAssertions(): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Consent assertions are invalid",
  });
}

export function validateConsentAssertions(
  assertions: readonly ConsentAssertion[],
): ConsentAssertion[] {
  const parsed = consentAssertionsSchema.safeParse(assertions);
  if (!parsed.success) invalidConsentAssertions();

  const documents = getDocumentRegistryForValidation();
  const byId = new Map(parsed.data.map(assertion => [assertion.documentId, assertion]));
  if (byId.size !== documents.length) invalidConsentAssertions();

  const validated = documents.map(document => {
    const assertion = byId.get(document.documentId);
    if (
      !assertion ||
      assertion.documentVersion !== document.documentVersion ||
      assertion.contentHash !== document.contentHash ||
      assertion.consentType !== document.consentType ||
      (document.required && assertion.accepted !== true)
    ) {
      invalidConsentAssertions();
    }
    return { ...assertion };
  });

  const types = new Set<ConsentType>(validated.map(assertion => assertion.consentType));
  if (types.size !== CONSENT_TYPES.length) invalidConsentAssertions();
  return validated;
}

export async function insertCaseConsents(
  executor: R1Executor,
  input: {
    customerAccountId: string;
    diagnosticCaseId: string;
    actorCustomerSessionId: string;
    assertions: readonly ConsentAssertion[];
    acceptedAt: Date;
  },
): Promise<void> {
  const assertions = validateConsentAssertions(input.assertions);
  await executor.insert(caseConsents).values(assertions.map(assertion => ({
    id: newR1Id("consent"),
    customerAccountId: input.customerAccountId,
    diagnosticCaseId: input.diagnosticCaseId,
    documentId: assertion.documentId,
    documentVersion: assertion.documentVersion,
    contentHash: assertion.contentHash,
    consentType: assertion.consentType,
    accepted: assertion.accepted,
    actorCustomerSessionId: input.actorCustomerSessionId,
    acceptedAt: input.acceptedAt,
    createdAt: input.acceptedAt,
  })));
}
