export const QUESTION_INPUTS = ["single", "multi", "text"] as const;
export type QuestionInput = (typeof QUESTION_INPUTS)[number];

export interface QuestionOptionDto {
  readonly id: string;
  readonly label: string;
}

export interface QuestionDto {
  readonly id: string;
  readonly blockId: number;
  readonly text: string;
  readonly hint?: string;
  readonly input: QuestionInput;
  readonly required: boolean;
  readonly options?: readonly QuestionOptionDto[];
}

export const QUESTIONNAIRE_PROJECTION_STATUSES = ["open", "submitted"] as const;
export type QuestionnaireProjectionStatus =
  (typeof QUESTIONNAIRE_PROJECTION_STATUSES)[number];

export interface QuestionnaireReleaseDto {
  readonly releaseId: string;
  readonly version: string;
}

export type QuestionnaireAnswerDto =
  | { readonly kind: "single"; readonly optionId: string }
  | { readonly kind: "multi"; readonly optionIds: readonly string[] }
  | { readonly kind: "text"; readonly text: string };

export interface QuestionnaireProjectionDto {
  readonly publicId: string;
  readonly status: QuestionnaireProjectionStatus;
  readonly draftRevision: number;
  readonly release: QuestionnaireReleaseDto;
  readonly visibleQuestions: readonly QuestionDto[];
  readonly visibleQuestionCount: number;
  readonly answers: Readonly<Record<string, QuestionnaireAnswerDto>>;
  readonly activeAnsweredCount: number;
  readonly requiredActiveCount: number;
  readonly currentQuestionId: string | null;
  readonly manualFollowUpRequired: boolean;
}

export type QuestionnaireAnswerInputDto = QuestionnaireAnswerDto | null;

export interface SaveQuestionnaireAnswerDto {
  readonly questionId: string;
  readonly answer: QuestionnaireAnswerInputDto;
  readonly draftRevision: number;
}

export interface SubmitQuestionnaireDto {
  readonly draftRevision: number;
}

export interface QuestionnaireMutationSavedDto {
  readonly outcome: "saved";
  readonly questionnaire: QuestionnaireProjectionDto;
}

export interface QuestionnaireMutationConflictDto {
  readonly outcome: "conflict";
  readonly questionnaire: QuestionnaireProjectionDto;
}

export interface QuestionnaireSubmissionReceiptDto {
  readonly publicId: string;
  readonly status: "submitted";
  readonly submissionVersion: 1;
  readonly draftRevision: number;
  readonly activeAnsweredCount: number;
  readonly requiredActiveCount: number;
  readonly manualFollowUpRequired: boolean;
}

export interface QuestionnaireSubmissionSavedDto {
  readonly outcome: "saved";
  readonly receipt: QuestionnaireSubmissionReceiptDto;
}

export type SaveQuestionnaireAnswerResponseDto =
  | QuestionnaireMutationSavedDto
  | QuestionnaireMutationConflictDto;

export type SubmitQuestionnaireResponseDto =
  | QuestionnaireSubmissionSavedDto
  | QuestionnaireMutationConflictDto;
