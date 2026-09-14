import {
  acquireQuestionnaireRetryKey,
  buildQuestionnaireSaveSignature,
  buildQuestionnaireSubmitSignature,
  createLogicalQuestionnaireRetryState,
  createOpaqueQuestionnaireKey,
  disposeSettledQuestionnaireMutation,
  finishQuestionnaireLogicalRequest,
  QUESTIONNAIRE_SAVE_MUTATION_KEY,
  QUESTIONNAIRE_SUBMIT_MUTATION_KEY,
  removeExactQuestionnaireDraftQuery,
  synchronizeQuestionnaireRetrySignature,
} from "@/lib/questionnaireMutationSecurity";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import type {
  QuestionnaireAnswerInputDto,
  QuestionnaireProjectionDto,
  QuestionnaireSubmissionReceiptDto,
} from "@shared/r1/questionnaire";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AutosaveState =
  | "idle"
  | "saving"
  | "saved"
  | "offline"
  | "conflict";
export type SubmitState =
  | "idle"
  | "submitting"
  | "submitted"
  | "offline"
  | "conflict";

type SaveRequest = {
  questionId: string;
  value: QuestionnaireAnswerInputDto;
  expectedDraftRevision: number;
  semanticSignature: string;
};

const TEXT_SAVE_DELAY_MS = 500;

export function useQuestionnaireDraft(publicId: string) {
  const queryClient = useQueryClient();
  const [questionnaire, setQuestionnaire] =
    useState<QuestionnaireProjectionDto | null>(null);
  const [submissionReceipt, setSubmissionReceipt] =
    useState<QuestionnaireSubmissionReceiptDto | null>(null);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(
    null
  );
  const [draftValue, setDraftValue] = useState<
    QuestionnaireAnswerInputDto | undefined
  >(undefined);
  const [retryRequest, setRetryRequest] = useState<SaveRequest | null>(null);
  const projectionRef = useRef<QuestionnaireProjectionDto | null>(null);
  const saveRetryRef = useRef(createLogicalQuestionnaireRetryState());
  const submitRetryRef = useRef(createLogicalQuestionnaireRetryState());
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftQueryKey = useMemo(
    () => getQueryKey(trpc.pilot.cases.getDraft, { publicId }, "query"),
    [publicId]
  );
  const draftQuery = trpc.pilot.cases.getDraft.useQuery(
    { publicId },
    {
      retry: false,
      refetchOnWindowFocus: false,
      gcTime: 0,
      enabled: publicId.length > 0 && submissionReceipt === null,
    }
  );
  const saveMutation = trpc.pilot.cases.saveAnswer.useMutation({ gcTime: 0 });
  const submitMutation = trpc.pilot.cases.submit.useMutation({ gcTime: 0 });

  const clearTextTimer = useCallback(() => {
    if (textTimerRef.current !== null) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
  }, []);

  const replaceProjection = useCallback(
    (next: QuestionnaireProjectionDto) => {
      clearTextTimer();
      projectionRef.current = next;
      setQuestionnaire(next);
      setDraftValue(undefined);
    },
    [clearTextTimer]
  );

  useEffect(() => {
    if (draftQuery.data) replaceProjection(draftQuery.data);
  }, [draftQuery.data, replaceProjection]);

  useEffect(() => {
    clearTextTimer();
    projectionRef.current = null;
    setQuestionnaire(null);
    setSubmissionReceipt(null);
    setDraftValue(undefined);
    setAutosaveState("idle");
    setSubmitState("idle");
    setPendingQuestionId(null);
    setRetryRequest(null);
    finishQuestionnaireLogicalRequest(saveRetryRef.current);
    finishQuestionnaireLogicalRequest(submitRetryRef.current);
  }, [clearTextTimer, publicId]);

  useEffect(() => clearTextTimer, [clearTextTimer]);

  const saveRequest = useCallback(
    async (request: SaveRequest) => {
      clearTextTimer();
      const clientMutationId = acquireQuestionnaireRetryKey(
        saveRetryRef.current,
        request.semanticSignature,
        createOpaqueQuestionnaireKey
      );
      if (!clientMutationId) {
        setPendingQuestionId(request.questionId);
        setRetryRequest(request);
        setAutosaveState("offline");
        return;
      }

      const variables = {
        publicId,
        questionId: request.questionId,
        value: request.value,
        clientMutationId,
        expectedDraftRevision: request.expectedDraftRevision,
      };

      setPendingQuestionId(request.questionId);
      setRetryRequest(request);
      setAutosaveState("saving");

      try {
        const result = await saveMutation.mutateAsync(variables);
        replaceProjection(result.questionnaire);
        finishQuestionnaireLogicalRequest(saveRetryRef.current);
        setRetryRequest(null);
        if (result.outcome === "conflict") {
          setPendingQuestionId(request.questionId);
          setAutosaveState("conflict");
        } else {
          setPendingQuestionId(null);
          setAutosaveState("saved");
        }
      } catch {
        setAutosaveState("offline");
      } finally {
        disposeSettledQuestionnaireMutation(
          queryClient,
          QUESTIONNAIRE_SAVE_MUTATION_KEY,
          variables,
          saveMutation.reset
        );
      }
    },
    [clearTextTimer, publicId, queryClient, replaceProjection, saveMutation]
  );

  const chooseAnswer = useCallback(
    (questionId: string, value: QuestionnaireAnswerInputDto) => {
      const projection = projectionRef.current;
      if (!projection || projection.status === "submitted") return;
      const semanticSignature = buildQuestionnaireSaveSignature(
        questionId,
        projection.draftRevision,
        value
      );
      synchronizeQuestionnaireRetrySignature(
        saveRetryRef.current,
        semanticSignature
      );
      setDraftValue(value);
      setAutosaveState("saving");
      setPendingQuestionId(questionId);
      setRetryRequest(null);
      void saveRequest({
        questionId,
        value,
        expectedDraftRevision: projection.draftRevision,
        semanticSignature,
      });
    },
    [saveRequest]
  );

  const editText = useCallback(
    (questionId: string, value: string) => {
      const projection = projectionRef.current;
      if (!projection || projection.status === "submitted") return;
      clearTextTimer();
      const answer = { kind: "text" as const, text: value };
      const semanticSignature = buildQuestionnaireSaveSignature(
        questionId,
        projection.draftRevision,
        answer
      );
      synchronizeQuestionnaireRetrySignature(
        saveRetryRef.current,
        semanticSignature
      );
      setDraftValue(answer);
      setPendingQuestionId(questionId);
      setRetryRequest(null);
      setAutosaveState("saving");
      const request: SaveRequest = {
        questionId,
        value: answer,
        expectedDraftRevision: projection.draftRevision,
        semanticSignature,
      };
      textTimerRef.current = setTimeout(() => {
        textTimerRef.current = null;
        void saveRequest(request);
      }, TEXT_SAVE_DELAY_MS);
    },
    [clearTextTimer, saveRequest]
  );

  const clearText = useCallback(
    (questionId: string) => {
      chooseAnswer(questionId, null);
    },
    [chooseAnswer]
  );

  const retrySave = useCallback(() => {
    if (!retryRequest || autosaveState !== "offline") return;
    void saveRequest(retryRequest);
  }, [autosaveState, retryRequest, saveRequest]);

  const submit = useCallback(async () => {
    const projection = projectionRef.current;
    if (
      !projection ||
      projection.status === "submitted" ||
      textTimerRef.current !== null ||
      autosaveState === "saving" ||
      autosaveState === "offline" ||
      autosaveState === "conflict"
    )
      return;
    clearTextTimer();
    const semanticSignature = buildQuestionnaireSubmitSignature(
      publicId,
      projection.draftRevision
    );
    const idempotencyKey = acquireQuestionnaireRetryKey(
      submitRetryRef.current,
      semanticSignature,
      createOpaqueQuestionnaireKey
    );
    if (!idempotencyKey) {
      setSubmitState("offline");
      return;
    }
    const variables = { publicId, idempotencyKey };
    setSubmitState("submitting");

    try {
      const result = await submitMutation.mutateAsync(variables);
      if (result.outcome === "conflict") {
        replaceProjection(result.questionnaire);
        finishQuestionnaireLogicalRequest(submitRetryRef.current);
        setSubmitState("conflict");
      } else {
        projectionRef.current = null;
        setQuestionnaire(null);
        setDraftValue(undefined);
        setRetryRequest(null);
        setPendingQuestionId(null);
        setAutosaveState("idle");
        setSubmissionReceipt(result.receipt);
        removeExactQuestionnaireDraftQuery(queryClient, draftQueryKey);
        finishQuestionnaireLogicalRequest(saveRetryRef.current);
        finishQuestionnaireLogicalRequest(submitRetryRef.current);
        setSubmitState("submitted");
      }
    } catch {
      setSubmitState("offline");
    } finally {
      disposeSettledQuestionnaireMutation(
        queryClient,
        QUESTIONNAIRE_SUBMIT_MUTATION_KEY,
        variables,
        submitMutation.reset
      );
    }
  }, [
    autosaveState,
    clearTextTimer,
    draftQueryKey,
    publicId,
    queryClient,
    replaceProjection,
    submitMutation,
  ]);

  const activeQuestion = useMemo(() => {
    if (!questionnaire) return null;
    return (
      questionnaire.visibleQuestions.find(
        question => question.id === questionnaire.currentQuestionId
      ) ??
      questionnaire.visibleQuestions[0] ??
      null
    );
  }, [questionnaire]);

  const activeAnswer = useMemo(() => {
    if (!activeQuestion || !questionnaire) return undefined;
    if (pendingQuestionId === activeQuestion.id && draftValue !== undefined) {
      return draftValue;
    }
    return questionnaire.answers[activeQuestion.id];
  }, [activeQuestion, draftValue, pendingQuestionId, questionnaire]);

  const answerForQuestion = useCallback(
    (questionId: string) => {
      if (pendingQuestionId === questionId && draftValue !== undefined) {
        return draftValue;
      }
      return projectionRef.current?.answers[questionId];
    },
    [draftValue, pendingQuestionId]
  );

  return {
    questionnaire,
    submissionReceipt,
    activeQuestion,
    activeAnswer,
    autosaveState,
    hasPendingAutosave: autosaveState === "saving",
    submitState,
    pendingQuestionId,
    isSaveRequestPending: saveMutation.isPending,
    isLoading: draftQuery.isLoading,
    isUnavailable:
      submissionReceipt === null &&
      (draftQuery.isError || (!draftQuery.isLoading && !questionnaire)),
    chooseAnswer,
    editText,
    clearText,
    answerForQuestion,
    retrySave,
    submit,
  };
}
