import { readFile } from "node:fs/promises";
import path from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { isControlledClientRoute } from "../../../client/src/lib/controlledRoutes";
import {
  QUESTIONNAIRE_SAVE_MUTATION_KEY,
  QUESTIONNAIRE_SUBMIT_MUTATION_KEY,
  acquireQuestionnaireRetryKey,
  buildQuestionnaireSaveSignature,
  createLogicalQuestionnaireRetryState,
  disposeSettledQuestionnaireMutation,
  finishQuestionnaireLogicalRequest,
  removeExactQuestionnaireDraftQuery,
} from "../../../client/src/lib/questionnaireMutationSecurity";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const questionnaireClientFiles = [
  "client/src/pages/CaseQuestionnaire.tsx",
  "client/src/hooks/useQuestionnaireDraft.ts",
  "client/src/lib/questionnaireMutationSecurity.ts",
  "client/src/components/r1/questionnaire/QuestionRenderer.tsx",
  "client/src/components/r1/questionnaire/AutosaveStatus.tsx",
];

async function readQuestionnaireClientSource(): Promise<string> {
  return (
    await Promise.all(
      questionnaireClientFiles.map(file =>
        readFile(path.join(repositoryRoot, file), "utf8")
      )
    )
  ).join("\n");
}

describe("questionnaire controlled client boundary", () => {
  it("classifies the nested questionnaire URL as controlled", () => {
    expect(
      isControlledClientRoute(
        "/cabinet/diagnostics/case_public_123/questionnaire"
      )
    ).toBe(true);
    expect(
      isControlledClientRoute(
        "/cabinet-public/diagnostics/case_public_123/questionnaire"
      )
    ).toBe(false);
  });

  it("declares the questionnaire route before the generic cabinet route", async () => {
    const appSource = await readFile(
      path.join(repositoryRoot, "client/src/App.tsx"),
      "utf8"
    );
    const questionnaireRoute =
      'path="/cabinet/diagnostics/:publicCaseId/questionnaire"';
    const cabinetRoute = 'path="/cabinet"';

    expect(appSource).toContain(questionnaireRoute);
    expect(appSource.indexOf(questionnaireRoute)).toBeLessThan(
      appSource.indexOf(cabinetRoute)
    );
  });

  it("keeps a save retry key stable until success and rotates it for a new semantic answer", () => {
    const state = createLogicalQuestionnaireRetryState();
    const generate = vi
      .fn<() => string | null>()
      .mockReturnValueOnce("opaque-one")
      .mockReturnValueOnce("opaque-two")
      .mockReturnValueOnce("opaque-three");
    const first = buildQuestionnaireSaveSignature("b1_q1", 2, {
      kind: "text",
      text: "sensitive-one",
    });
    const changed = buildQuestionnaireSaveSignature("b1_q1", 2, {
      kind: "text",
      text: "sensitive-two",
    });

    expect(acquireQuestionnaireRetryKey(state, first, generate)).toBe(
      "opaque-one"
    );
    expect(acquireQuestionnaireRetryKey(state, first, generate)).toBe(
      "opaque-one"
    );
    expect(acquireQuestionnaireRetryKey(state, changed, generate)).toBe(
      "opaque-two"
    );
    finishQuestionnaireLogicalRequest(state);
    expect(acquireQuestionnaireRetryKey(state, changed, generate)).toBe(
      "opaque-three"
    );
  });

  it.each([
    ["save", QUESTIONNAIRE_SAVE_MUTATION_KEY],
    ["submit", QUESTIONNAIRE_SUBMIT_MUTATION_KEY],
  ] as const)(
    "removes only the settled %s attempt from the mutation cache",
    async (_name, mutationKey) => {
      const queryClient = new QueryClient();
      const variables = { value: "sensitive-test-only-value" };
      const questionnaireMutation = queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationKey,
          gcTime: 0,
          mutationFn: async (input: typeof variables) => input.value.length,
        });
      const unrelatedMutation = queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationKey: [["unrelated"]],
          mutationFn: async () => true,
        });
      await questionnaireMutation.execute(variables);
      await unrelatedMutation.execute(undefined);
      const reset = vi.fn();

      disposeSettledQuestionnaireMutation(
        queryClient,
        mutationKey,
        variables,
        reset
      );

      expect(reset).toHaveBeenCalledOnce();
      expect(queryClient.getMutationCache().getAll()).toEqual([
        unrelatedMutation,
      ]);
      expect(
        JSON.stringify(queryClient.getMutationCache().getAll())
      ).not.toContain(variables.value);
    }
  );

  it("removes only the exact answer-bearing draft query from the query cache", () => {
    const queryClient = new QueryClient();
    const draftQueryKey = [
      ["pilot", "cases", "getDraft"],
      { input: { publicId: "case_public_123456" }, type: "query" },
    ] as const;
    const otherDraftQueryKey = [
      ["pilot", "cases", "getDraft"],
      { input: { publicId: "case_public_654321" }, type: "query" },
    ] as const;
    const sensitiveProjection = {
      answers: { b1_q1: { kind: "text", text: "sensitive-test-only-answer" } },
    };
    queryClient.setQueryData(draftQueryKey, sensitiveProjection);
    queryClient.setQueryData(otherDraftQueryKey, { answers: {} });

    removeExactQuestionnaireDraftQuery(queryClient, draftQueryKey);

    expect(queryClient.getQueryData(draftQueryKey)).toBeUndefined();
    expect(queryClient.getQueryData(otherDraftQueryKey)).toEqual({
      answers: {},
    });
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(
      sensitiveProjection.answers.b1_q1.text
    );
  });

  it("uses a safe receipt and clears every answer-bearing client state on submit success", async () => {
    const sharedSource = await readFile(
      path.join(repositoryRoot, "shared/r1/questionnaire.ts"),
      "utf8"
    );
    const hookSource = await readFile(
      path.join(repositoryRoot, "client/src/hooks/useQuestionnaireDraft.ts"),
      "utf8"
    );
    const pageSource = await readFile(
      path.join(repositoryRoot, "client/src/pages/CaseQuestionnaire.tsx"),
      "utf8"
    );
    const receiptDefinition =
      sharedSource.match(
        /export interface QuestionnaireSubmissionReceiptDto \{([\s\S]*?)\n\}/
      )?.[1] ?? "";
    const savedDefinition =
      sharedSource.match(
        /export interface QuestionnaireSubmissionSavedDto \{([\s\S]*?)\n\}/
      )?.[1] ?? "";
    const submitCallback = hookSource.slice(
      hookSource.indexOf("const submit = useCallback")
    );
    const submitSuccessBranch =
      submitCallback.match(
        /if \(result\.outcome === "conflict"\) \{[\s\S]*?\} else \{([\s\S]*?)\n      \}/
      )?.[1] ?? "";

    expect(receiptDefinition).toContain('readonly status: "submitted"');
    expect(receiptDefinition).toContain("readonly submissionVersion: 1");
    expect(receiptDefinition).not.toMatch(
      /answers|visibleQuestions|snapshot|question(Id)?|title|text|raw|internal|releaseId/i
    );
    expect(savedDefinition).toContain(
      "readonly receipt: QuestionnaireSubmissionReceiptDto"
    );
    expect(savedDefinition).not.toContain("questionnaire");

    expect(submitSuccessBranch).toContain("projectionRef.current = null");
    expect(submitSuccessBranch).toContain("setQuestionnaire(null)");
    expect(submitSuccessBranch).toContain("setDraftValue(undefined)");
    expect(submitSuccessBranch).toContain("setRetryRequest(null)");
    expect(submitSuccessBranch).toContain(
      "setSubmissionReceipt(result.receipt)"
    );
    expect(submitSuccessBranch).toContain("removeExactQuestionnaireDraftQuery");
    expect(submitSuccessBranch).not.toContain("result.questionnaire");
    expect(hookSource).toContain(
      'getQueryKey(trpc.pilot.cases.getDraft, { publicId }, "query")'
    );
    expect(hookSource).toContain(
      "enabled: publicId.length > 0 && submissionReceipt === null"
    );
    expect(pageSource).toContain(
      "const isSubmitted = draft.submissionReceipt !== null"
    );
  });

  it("keeps the controlled UI free of legacy content, browser persistence, URL state, and forbidden imports", async () => {
    const source = await readQuestionnaireClientSource();
    const forbidden = [
      /localStorage/,
      /sessionStorage/,
      /indexedDB/,
      /document\.cookie/,
      /location\.(search|hash)/,
      /useSearchParams/,
      /questionnaire_v2/,
      /legal-core/i,
      /PaidDiagnostic/,
      /PromoForm/,
      /promoVerifier/,
      /LexyWidget/,
      /askLexy/,
      /useLocation/,
      /upload/i,
      /onbeforeunload/,
    ];

    for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    expect(source).toContain("trpc.pilot.cases.getDraft.useQuery");
    expect(source).toContain(
      "trpc.pilot.cases.saveAnswer.useMutation({ gcTime: 0 })"
    );
    expect(source).toContain(
      "trpc.pilot.cases.submit.useMutation({ gcTime: 0 })"
    );
    expect(source).toContain("disposeSettledQuestionnaireMutation");
  });
});
