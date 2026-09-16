import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  customerSessions,
  diagnosticCases,
  questionnaireRuleEvaluations,
  reportSnapshots,
  questionnaireSubmissions,
} from "../../../drizzle/schema";
import type { QuestionnaireAnswerInputDto } from "../../../shared/r1/questionnaire";
import { provisionMagicLinkTestIdentity } from "../auth/customerAccountRepository";
import { consumeMagicLink, requestMagicLink } from "../auth/magicLinkService";
import { runOneMagicLinkDelivery } from "../email/mailWorker";
import { getR1TestInbox, R1_TEST_HARNESS_IDENTITY } from "../email/testMailbox";
import { redeemPromo } from "../billing/promoService";
import { ADVANCED_DIAGNOSTIC_TARIFF_CODE } from "../billing/tariffService";
import { getDocumentRegistryForValidation } from "../legal/documentRegistry";
import { getQuestionnaireDraft, saveQuestionnaireAnswer, submitQuestionnaire } from "../questionnaire/questionnaireService";
import { technicalQuestionnaireBundle } from "../questionnaire/configBundle";
import { processOneRulesEngineJob } from "../scoring/rulesEngineWorker";
import { initializeReportForCompletedEvaluation } from "../reports/reportGenerationService";
import { processOneReportJob } from "../reports/reportWorker";
import { loadReadyReportSnapshotByPublicCase } from "../reports/reportSnapshotRepository";
import { deriveReportViewModel } from "../reports/reportViewModel";
import { buildR1ReportHtml } from "../reports/reportPdfRenderer";
import { validateReportSchema } from "../reports/reportSchemaValidator";
import { hashCustomerSessionToken } from "../auth/customerSessionToken";
import { RUN_PREFIX, cleanRunData, db, registerRunEmail } from "./r1DbHarness";

const NOW = new Date("2027-04-01T10:00:00.000Z");
const email = registerRunEmail(`${RUN_PREFIX}_full_journey@example.test`);

function answerFor(questionId: string): QuestionnaireAnswerInputDto {
  const question = technicalQuestionnaireBundle.questionById[questionId]!;
  if (question.type === "text") return { kind: "text", text: `${RUN_PREFIX}_synthetic_answer` };
  if (question.type === "single") return { kind: "single", optionId: question.options[0]!.id };
  if (question.type === "multi") return { kind: "multi", optionIds: [question.options[0]!.id] };
  throw new Error(`Unsupported question type for ${questionId}`);
}

function consents() {
  return getDocumentRegistryForValidation().map(document => ({
    documentId: document.documentId,
    documentVersion: document.documentVersion,
    contentHash: document.contentHash,
    consentType: document.consentType,
    accepted: document.required,
  }));
}

describe("R1 full synthetic customer journey", () => {
  beforeEach(async () => {
    await cleanRunData();
    getR1TestInbox().resetForHarness(R1_TEST_HARNESS_IDENTITY);
  });

  afterAll(async () => {
    getR1TestInbox().resetForHarness(R1_TEST_HARNESS_IDENTITY);
    await cleanRunData();
  });

  it("travels from magic link through promo, questionnaire, rules, web report and same-snapshot PDF HTML", async () => {
    const identity = await provisionMagicLinkTestIdentity(email);
    expect(await requestMagicLink(email, `${RUN_PREFIX}_journey_request`, NOW)).toEqual({ accepted: true });
    await expect(runOneMagicLinkDelivery({ clock: { now: () => new Date(NOW.getTime() + 1_000) } })).resolves.toMatchObject({ processed: true, status: "sent" });

    const message = getR1TestInbox().readForHarness(R1_TEST_HARNESS_IDENTITY)[0]!;
    const rawToken = new URL(message.magicLinkUrl).hash.slice(1);
    const consumed = await consumeMagicLink(rawToken, `${RUN_PREFIX}_journey_consume`, new Date(NOW.getTime() + 2_000));
    expect(consumed).toMatchObject({ consumed: true });
    if (!consumed.consumed) throw new Error("Magic link did not create a session");

    const database = await db();
    const sessions = await database.select().from(customerSessions).where(and(
      eq(customerSessions.customerAccountId, identity.accountId),
      eq(customerSessions.tokenHash, hashCustomerSessionToken(consumed.sessionToken, process.env.LEXY_CUSTOMER_SESSION_SECRET!)),
    ));
    expect(sessions).toHaveLength(1);
    const session = sessions[0]!;

    const promoValue = process.env.LEXY_R1_PROMO_VERIFIER!;
    const access = await redeemPromo({
      customerAccountId: identity.accountId,
      customerSessionId: session.id,
      requestId: `${RUN_PREFIX}_journey_promo_request`,
      tariffCode: ADVANCED_DIAGNOSTIC_TARIFF_CODE,
      promoValue,
      idempotencyKey: `${RUN_PREFIX}_journey_promo_idempotency`,
      consents: consents(),
      now: NOW,
    });
    expect(access).toMatchObject({ status: "access_granted", accessStatus: "active", tariffCode: ADVANCED_DIAGNOSTIC_TARIFF_CODE });

    let revision = 0;
    for (const questionId of technicalQuestionnaireBundle.activeCoreQuestionIds) {
      const saved = await saveQuestionnaireAnswer({
        customerAccountId: identity.accountId,
        customerSessionId: session.id,
        requestId: `${RUN_PREFIX}_journey_answer_${revision}`,
        publicId: access.casePublicId,
        questionId,
        value: answerFor(questionId),
        clientMutationId: `${RUN_PREFIX}_journey_mutation_${revision}`,
        expectedDraftRevision: revision,
        now: NOW,
      });
      expect(saved.outcome).toBe("saved");
      revision += 1;
    }
    const projected = await getQuestionnaireDraft({
      customerAccountId: identity.accountId,
      customerSessionId: session.id,
      publicId: access.casePublicId,
      now: NOW,
    });
    for (const question of projected.visibleQuestions) {
      const questionId = question.id;
      if (projected.answers[questionId] !== undefined) continue;
      const saved = await saveQuestionnaireAnswer({
        customerAccountId: identity.accountId,
        customerSessionId: session.id,
        requestId: `${RUN_PREFIX}_journey_branch_${revision}`,
        publicId: access.casePublicId,
        questionId,
        value: answerFor(questionId),
        clientMutationId: `${RUN_PREFIX}_journey_branch_mutation_${revision}`,
        expectedDraftRevision: revision,
        now: NOW,
      });
      expect(saved.outcome).toBe("saved");
      revision += 1;
    }
    const submitted = await submitQuestionnaire({
      customerAccountId: identity.accountId,
      customerSessionId: session.id,
      requestId: `${RUN_PREFIX}_journey_submit_request`,
      publicId: access.casePublicId,
      idempotencyKey: `${RUN_PREFIX}_journey_submit_idempotency`,
      now: NOW,
    });
    expect(submitted).toMatchObject({ outcome: "saved", receipt: { status: "submitted", draftRevision: revision } });

    const submissions = await database.select().from(questionnaireSubmissions).where(eq(questionnaireSubmissions.customerAccountId, identity.accountId));
    expect(submissions).toHaveLength(1);
    const scoring = await processOneRulesEngineJob(database, { leaseOwner: `${RUN_PREFIX}_rules_worker`, serviceActorId: `${RUN_PREFIX}_rules_service`, now: () => NOW });
    expect(scoring.processed).toBe(true);

    const evaluations = await database.select().from(questionnaireRuleEvaluations).where(eq(questionnaireRuleEvaluations.questionnaireSubmissionId, submissions[0]!.id));
    expect(evaluations).toHaveLength(1);
    const evaluation = evaluations[0]!;
    const initialized = await initializeReportForCompletedEvaluation(database, {
      customerAccountId: identity.accountId,
      diagnosticCaseId: evaluation.diagnosticCaseId,
      questionnaireSubmissionId: evaluation.questionnaireSubmissionId,
      questionnaireRuleEvaluationId: evaluation.id,
      sourceOutboxEventId: evaluation.sourceOutboxEventId,
    }, NOW);
    expect(initialized.status).toBe("pending");

    const report = await processOneReportJob(database, { leaseOwner: `${RUN_PREFIX}_report_worker`, now: () => NOW });
    expect(report).toMatchObject({ processed: true, status: "ready", reportSnapshotId: initialized.id });
    const ready = await loadReadyReportSnapshotByPublicCase(database, { customerAccountId: identity.accountId, casePublicId: access.casePublicId });
    expect(ready).toMatchObject({ id: initialized.id, status: "ready" });
    if (!ready?.payloadJson) throw new Error("Ready report has no payload");
    const payload = typeof ready.payloadJson === "string" ? JSON.parse(ready.payloadJson) : ready.payloadJson;
    expect(validateReportSchema(payload)).toEqual([]);

    const view = deriveReportViewModel(payload);
    const html = buildR1ReportHtml(view);
    expect(html).toContain(view.title);
    expect(html).toContain(view.recommendation.displayName);
    for (const risk of view.risks) expect(html).toContain(risk.title);
    for (const task of [...view.roadmap.day0, ...view.roadmap.day30, ...view.roadmap.day60, ...view.roadmap.day90]) expect(html).toContain(task.action);
    expect(html).toContain(view.watermark);

    const snapshots = await database.select().from(reportSnapshots).where(and(
      eq(reportSnapshots.customerAccountId, identity.accountId),
      eq(reportSnapshots.diagnosticCaseId, ready.diagnosticCaseId),
    ));
    expect(snapshots).toHaveLength(1);
    expect((await database.select().from(diagnosticCases).where(eq(diagnosticCases.id, ready.diagnosticCaseId)))[0]).toMatchObject({ customerAccountId: identity.accountId, publicId: access.casePublicId });

    const replay = await submitQuestionnaire({
      customerAccountId: identity.accountId,
      customerSessionId: session.id,
      requestId: `${RUN_PREFIX}_journey_submit_replay`,
      publicId: access.casePublicId,
      idempotencyKey: `${RUN_PREFIX}_journey_submit_idempotency`,
      now: new Date(NOW.getTime() + 1_000),
    });
    expect(replay).toEqual(submitted);
    expect(await database.select().from(reportSnapshots).where(eq(reportSnapshots.id, initialized.id))).toHaveLength(1);
  }, 60_000);
});
