import { z } from "zod";
import questionnaireRawText from "../../../shared/legal-core/questionnaire_v2.json?raw";
import { assertQuestionnaireTestAllowed } from "../releaseGate";
import { canonicalSerialize, sha256Hex, type CanonicalJsonValue } from "./canonicalJson";

export const QUESTIONNAIRE_CONTENT_SHA256 =
  "4c97f37bf0b443b1d8667da7916badf81740e7f45eeef9d45d3c9092eb0dc218" as const;
export const QUESTIONNAIRE_RELEASE_ID = "lexy-r0-2026-09-12" as const;
export const QUESTIONNAIRE_VERSION = "1.0.0-draft.1" as const;
export const QUESTIONNAIRE_STATUS = "draft_pending_legal_approval" as const;
export const QUESTIONNAIRE_TECHNICAL_USE = "technical_test_only" as const;
const QUESTIONNAIRE_CANONICAL_SHA256 =
  "763e441579a158fba281af35d63e688ef08b6c0841525fd8c750c56ba7f48b96" as const;

const statementSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum([
      "нормативное_требование",
      "проектное_решение",
      "открытый_вопрос",
    ]),
    text: z.string().min(1),
    source: z.string().optional(),
  })
  .strict();

const optionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    riskFlag: z.boolean().optional(),
    criticalTrigger: z.boolean().optional(),
    branchTrigger: z.string().min(1).optional(),
  })
  .strict();

const branchInputSchema = z
  .object({
    questionId: z.string().min(1),
    answerOptionIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

const branchConditionSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("ответ_на_вариант"),
    operator: z.enum(["any", "all"]),
    inputs: z.array(branchInputSchema).min(1),
    description: z.string(),
  })
  .strict();

const questionSchema = z
  .object({
    id: z.string().regex(/^b[0-9]+_q[0-9]+$/),
    blockId: z.number().int(),
    text: z.string().min(1),
    hint: z.string().optional(),
    type: z.enum(["single", "multi", "text", "file"]),
    required: z.boolean(),
    options: z.array(optionSchema).min(1).optional(),
    branchCondition: z
      .object({
        questionId: z.string().min(1),
        answerIds: z.array(z.string().min(1)).min(1),
      })
      .strict()
      .optional(),
    classification: z.enum(["core", "branch"]),
    activeInPilot: z.boolean(),
    releaseFlags: z
      .object({
        release0: z.object({ configuredOnly: z.literal(true) }).strict(),
        release1Pilot: z.object({ enabledNow: z.boolean() }).strict(),
      })
      .strict(),
    branchConditions: z.array(branchConditionSchema),
    criticalInputMetadata: z
      .object({
        isCriticalInput: z.boolean(),
        criticalOptionIds: z.array(z.string().min(1)),
        handling: z.enum([
          "не_применяется",
          "критический_триггер_требует_детерминированной_эскалации",
        ]),
      })
      .strict(),
  })
  .strict();

const branchSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    activeInPilot: z.boolean(),
    questionIds: z.array(z.string().min(1)),
    activation: z
      .object({
        sourceQuestionId: z.string().min(1),
        answerOptionIds: z.array(z.string().min(1)).min(1),
      })
      .strict(),
  })
  .strict();

const triggerActionSchema = z
  .object({
    action: z.enum(["activate_questions", "manual_follow_up_required"]),
    questionIds: z.array(z.string().min(1)).optional(),
    reason: z.string().optional(),
  })
  .strict();

const triggerPolicySchema = z
  .object({
    id: z.string().min(1),
    sourceQuestionId: z.string().min(1),
    sourceAnswerOptionId: z.string().min(1),
    legacyBranchTrigger: z.string().min(1),
    targetBranchId: z.string().min(1),
    targetQuestionIds: z.array(z.string().min(1)),
    branchActiveInPilot: z.boolean(),
    onTrigger: z.array(triggerActionSchema).min(1),
  })
  .strict();

const rawQuestionnaireSchema = z
  .object({
    $schema: z.string(),
    artifactType: z.literal("questionnaire_v2"),
    releaseId: z.string(),
    version: z.string(),
    effectiveFrom: z.null(),
    effectiveTo: z.null(),
    updatedBy: z.literal("Manus AI"),
    updatedAt: z.literal("2026-09-12T18:40:24Z"),
    sourceCommit: z.literal("78e2f89e99340a403ce389eada223da6bf336676"),
    status: z.string(),
    reviewStatus: z
      .object({
        reviewedByLawyer: z.boolean(),
        statement: z.string().min(1),
      })
      .strict(),
    source: z
      .object({
        repository: z.string(),
        commit: z.string(),
        file: z.string(),
        anketaVersion: z.string(),
        priceRub: z.number(),
        questionCount: z.number().int(),
        contentHashSha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    releaseFlags: z
      .object({
        release0: z
          .object({
            state: z.literal("согласовано_к_началу"),
            architectureOnly: z.literal(true),
            runtimeIntegration: z.literal(false),
          })
          .strict(),
        release1Pilot: z
          .object({
            state: z.literal("запланирован_не_включен"),
            enabledNow: z.literal(false),
            activeCoreQuestions: z.number().int(),
            activeBranchQuestions: z.number().int(),
          })
          .strict(),
        clientAccess: z
          .object({
            currentAccessChange: z.literal("не_изменяется"),
            statement: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
    interpretation: z
      .object({
        normativeRequirements: z.array(statementSchema).min(1),
        projectDecisions: z.array(statementSchema).min(1),
        openQuestions: z.array(statementSchema).min(1),
      })
      .strict(),
    release1Selection: z
      .object({
        activeCoreQuestionIds: z.array(z.string().min(1)),
        activeBranchQuestionIds: z.array(z.string().min(1)),
        selectionRationale: z.string().min(1),
      })
      .strict(),
    branches: z.array(branchSchema).min(5),
    disabledBranchTriggerPolicy: z
      .object({
        action: z.literal("manual_follow_up_required"),
        reason: z.literal("ветка не активна в текущей версии анкеты"),
        triggerPolicies: z.array(triggerPolicySchema).min(1),
      })
      .strict(),
    blocks: z
      .array(
        z
          .object({
            id: z.number().int(),
            title: z.string(),
            description: z.string(),
            why: z.string(),
            what: z.string(),
            hasFileUpload: z.boolean().optional(),
            questions: z.array(questionSchema).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

type RawQuestionnaire = z.infer<typeof rawQuestionnaireSchema>;

export type QuestionnaireInputType = "single" | "multi" | "text" | "file";

export interface QuestionnaireOption {
  readonly id: string;
  readonly label: string;
  readonly criticalTrigger: boolean;
}

export interface QuestionnaireBranchInput {
  readonly questionId: string;
  readonly answerOptionIds: readonly string[];
}

export interface QuestionnaireBranchCondition {
  readonly id: string;
  readonly operator: "any" | "all";
  readonly inputs: readonly QuestionnaireBranchInput[];
}

export interface QuestionnaireQuestion {
  readonly id: string;
  readonly blockId: number;
  readonly text: string;
  readonly hint?: string;
  readonly type: QuestionnaireInputType;
  readonly required: boolean;
  readonly classification: "core" | "branch";
  readonly activeInPilot: boolean;
  readonly options: readonly QuestionnaireOption[];
  readonly branchConditions: readonly QuestionnaireBranchCondition[];
  readonly isCriticalInput: boolean;
  readonly criticalOptionIds: readonly string[];
}

export interface QuestionnaireBranch {
  readonly id: string;
  readonly activeInPilot: boolean;
  readonly questionIds: readonly string[];
  readonly activation: QuestionnaireBranchInput;
}

export interface QuestionnaireTriggerPolicy {
  readonly id: string;
  readonly sourceQuestionId: string;
  readonly sourceAnswerOptionId: string;
  readonly targetBranchId: string;
  readonly targetQuestionIds: readonly string[];
  readonly branchActiveInPilot: boolean;
  readonly manualFollowUpRequired: boolean;
}

export interface QuestionnaireBundle {
  readonly technicalUse: typeof QUESTIONNAIRE_TECHNICAL_USE;
  readonly releaseId: typeof QUESTIONNAIRE_RELEASE_ID;
  readonly version: typeof QUESTIONNAIRE_VERSION;
  readonly status: typeof QUESTIONNAIRE_STATUS;
  readonly reviewedByLawyer: false;
  readonly contentHash: typeof QUESTIONNAIRE_CONTENT_SHA256;
  readonly questionCount: 63;
  readonly activeCoreQuestionIds: readonly string[];
  readonly activeBranchQuestionIds: readonly string[];
  readonly orderedQuestionIds: readonly string[];
  readonly questions: readonly QuestionnaireQuestion[];
  readonly questionById: Readonly<Record<string, QuestionnaireQuestion>>;
  readonly branches: readonly QuestionnaireBranch[];
  readonly triggerPolicies: readonly QuestionnaireTriggerPolicy[];
}

export class QuestionnaireBundleValidationError extends Error {
  constructor(message: string) {
    super(`Invalid technical Questionnaire v2 bundle: ${message}`);
    this.name = "QuestionnaireBundleValidationError";
  }
}

function fail(message: string): never {
  throw new QuestionnaireBundleValidationError(message);
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
}

function decodeRawBytes(rawBytes: string | Uint8Array): string {
  return typeof rawBytes === "string"
    ? rawBytes
    : new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
}

function getOptionIds(question: RawQuestionnaire["blocks"][number]["questions"][number]): Set<string> {
  return new Set((question.options ?? []).map(option => option.id));
}

function assertAnswerReference(
  rawById: ReadonlyMap<string, RawQuestionnaire["blocks"][number]["questions"][number]>,
  input: { questionId: string; answerOptionIds: readonly string[] },
  label: string,
): void {
  const source = rawById.get(input.questionId);
  if (!source) fail(`${label} references unknown question ${input.questionId}`);
  const optionIds = getOptionIds(source);
  assertUnique(input.answerOptionIds, `${label} answerOptionIds`);
  for (const optionId of input.answerOptionIds) {
    if (!optionIds.has(optionId)) {
      fail(`${label} references unknown option ${input.questionId}.${optionId}`);
    }
  }
}

function semanticValidate(raw: RawQuestionnaire): void {
  if (raw.releaseId !== QUESTIONNAIRE_RELEASE_ID) fail("releaseId is not pinned");
  if (raw.version !== QUESTIONNAIRE_VERSION) fail("version is not pinned");
  if (raw.status !== QUESTIONNAIRE_STATUS) fail("status is not the legal draft status");
  if (raw.reviewStatus.reviewedByLawyer !== false) {
    fail("reviewedByLawyer must remain false");
  }
  if (raw.source.questionCount !== 63) fail("source question count must be 63");
  if (
    raw.releaseFlags.release1Pilot.activeCoreQuestions !== 33 ||
    raw.releaseFlags.release1Pilot.activeBranchQuestions !== 6
  ) {
    fail("release flag selection counts must be 33 core and 6 branch");
  }

  const questions = raw.blocks.flatMap(block => {
    for (const question of block.questions) {
      if (question.blockId !== block.id) fail(`${question.id} has a mismatched blockId`);
    }
    return block.questions;
  });
  if (questions.length !== 63) fail("configuration must contain exactly 63 questions");
  const ids = questions.map(question => question.id);
  assertUnique(ids, "question IDs");
  const rawById = new Map(questions.map(question => [question.id, question] as const));

  for (const question of questions) {
    const options = question.options ?? [];
    assertUnique(options.map(option => option.id), `${question.id} option IDs`);
    if ((question.type === "single" || question.type === "multi") && options.length === 0) {
      fail(`${question.id} requires configured options`);
    }
    if ((question.type === "text" || question.type === "file") && question.options) {
      fail(`${question.id} must not configure options`);
    }
    if (question.releaseFlags.release1Pilot.enabledNow !== question.activeInPilot) {
      fail(`${question.id} pilot flags disagree`);
    }
    if (question.activeInPilot && question.type === "file") {
      fail(`${question.id} activates an unsupported file input`);
    }

    assertUnique(question.criticalInputMetadata.criticalOptionIds, `${question.id} critical option IDs`);
    const criticalFromOptions = options
      .filter(option => option.criticalTrigger === true)
      .map(option => option.id)
      .sort();
    const criticalFromMetadata = [...question.criticalInputMetadata.criticalOptionIds].sort();
    if (canonicalSerialize(criticalFromOptions) !== canonicalSerialize(criticalFromMetadata)) {
      fail(`${question.id} critical option metadata disagrees with its options`);
    }
    if (question.criticalInputMetadata.isCriticalInput !== (criticalFromOptions.length > 0)) {
      fail(`${question.id} critical input flag disagrees with its critical options`);
    }
    for (const condition of question.branchConditions) {
      assertUnique(condition.inputs.map(input => `${input.questionId}:${input.answerOptionIds.join(",")}`), `${condition.id} inputs`);
      for (const input of condition.inputs) assertAnswerReference(rawById, input, condition.id);
    }
    if (question.branchCondition) {
      assertAnswerReference(
        rawById,
        {
          questionId: question.branchCondition.questionId,
          answerOptionIds: question.branchCondition.answerIds,
        },
        `${question.id} legacy branch condition`,
      );
    }
  }

  const core = raw.release1Selection.activeCoreQuestionIds;
  const branch = raw.release1Selection.activeBranchQuestionIds;
  if (core.length !== 33 || branch.length !== 6) fail("selection must be exactly 33 core and 6 branch");
  assertUnique(core, "active core selection");
  assertUnique(branch, "active branch selection");
  const overlap = core.find(id => branch.includes(id));
  if (overlap) fail(`selection overlaps at ${overlap}`);

  const selected = new Set([...core, ...branch]);
  for (const id of Array.from(selected)) {
    const question = rawById.get(id);
    if (!question) fail(`selection references unknown question ${id}`);
    const expectedClassification = core.includes(id) ? "core" : "branch";
    if (question.classification !== expectedClassification || !question.activeInPilot) {
      fail(`${id} does not match its active ${expectedClassification} selection`);
    }
  }
  for (const question of questions) {
    if (question.activeInPilot !== selected.has(question.id)) {
      fail(`${question.id} active flag disagrees with release selection`);
    }
  }

  const critical = questions.filter(question => question.criticalInputMetadata.isCriticalInput);
  if (critical.length !== 24) fail("configuration must contain exactly 24 active critical inputs");
  for (const question of critical) {
    if (!core.includes(question.id)) fail(`${question.id} is critical but not selected active core`);
  }

  assertUnique(raw.branches.map(item => item.id), "branch IDs");
  const branchOwner = new Map<string, string>();
  for (const configuredBranch of raw.branches) {
    assertUnique(configuredBranch.questionIds, `${configuredBranch.id} question IDs`);
    assertAnswerReference(
      rawById,
      {
        questionId: configuredBranch.activation.sourceQuestionId,
        answerOptionIds: configuredBranch.activation.answerOptionIds,
      },
      `${configuredBranch.id} activation`,
    );
    for (const id of configuredBranch.questionIds) {
      const question = rawById.get(id);
      if (!question) fail(`${configuredBranch.id} references unknown question ${id}`);
      if (question.classification !== "branch") fail(`${id} is not classified as branch`);
      if (branchOwner.has(id)) fail(`${id} belongs to multiple branches`);
      branchOwner.set(id, configuredBranch.id);
      if (question.activeInPilot && !configuredBranch.activeInPilot) {
        fail(`${id} is active inside a disabled branch`);
      }
    }
  }
  for (const id of branch) {
    const ownerId = branchOwner.get(id);
    const owner = raw.branches.find(item => item.id === ownerId);
    if (!owner?.activeInPilot) fail(`${id} lacks one active configured branch owner`);
  }

  assertUnique(raw.disabledBranchTriggerPolicy.triggerPolicies.map(item => item.id), "trigger policy IDs");
  const branchIds = new Set(raw.branches.map(item => item.id));
  for (const policy of raw.disabledBranchTriggerPolicy.triggerPolicies) {
    assertAnswerReference(
      rawById,
      {
        questionId: policy.sourceQuestionId,
        answerOptionIds: [policy.sourceAnswerOptionId],
      },
      policy.id,
    );
    if (!branchIds.has(policy.targetBranchId)) fail(`${policy.id} targets an unknown branch`);
    for (const id of policy.targetQuestionIds) {
      if (!rawById.has(id)) fail(`${policy.id} targets unknown question ${id}`);
    }
    const target = raw.branches.find(item => item.id === policy.targetBranchId)!;
    if (target.activeInPilot !== policy.branchActiveInPilot) {
      fail(`${policy.id} branch activity metadata disagrees`);
    }
  }
}

function freezeQuestion(
  raw: RawQuestionnaire["blocks"][number]["questions"][number],
): QuestionnaireQuestion {
  return Object.freeze({
    id: raw.id,
    blockId: raw.blockId,
    text: raw.text,
    ...(raw.hint === undefined ? {} : { hint: raw.hint }),
    type: raw.type,
    required: raw.required,
    classification: raw.classification,
    activeInPilot: raw.activeInPilot,
    options: Object.freeze(
      (raw.options ?? []).map(option =>
        Object.freeze({
          id: option.id,
          label: option.label,
          criticalTrigger: option.criticalTrigger === true,
        }),
      ),
    ),
    branchConditions: Object.freeze(
      raw.branchConditions.map(condition =>
        Object.freeze({
          id: condition.id,
          operator: condition.operator,
          inputs: Object.freeze(
            condition.inputs.map(input =>
              Object.freeze({
                questionId: input.questionId,
                answerOptionIds: Object.freeze([...input.answerOptionIds]),
              }),
            ),
          ),
        }),
      ),
    ),
    isCriticalInput: raw.criticalInputMetadata.isCriticalInput,
    criticalOptionIds: Object.freeze([...raw.criticalInputMetadata.criticalOptionIds]),
  });
}

function buildBundle(raw: RawQuestionnaire): QuestionnaireBundle {
  const questions = Object.freeze(raw.blocks.flatMap(block => block.questions.map(freezeQuestion)));
  const questionById = Object.freeze(
    Object.fromEntries(questions.map(question => [question.id, question])) as Record<
      string,
      QuestionnaireQuestion
    >,
  );
  const branches = Object.freeze(
    raw.branches.map(item =>
      Object.freeze({
        id: item.id,
        activeInPilot: item.activeInPilot,
        questionIds: Object.freeze([...item.questionIds]),
        activation: Object.freeze({
          questionId: item.activation.sourceQuestionId,
          answerOptionIds: Object.freeze([...item.activation.answerOptionIds]),
        }),
      }),
    ),
  );
  const triggerPolicies = Object.freeze(
    raw.disabledBranchTriggerPolicy.triggerPolicies.map(item =>
      Object.freeze({
        id: item.id,
        sourceQuestionId: item.sourceQuestionId,
        sourceAnswerOptionId: item.sourceAnswerOptionId,
        targetBranchId: item.targetBranchId,
        targetQuestionIds: Object.freeze([...item.targetQuestionIds]),
        branchActiveInPilot: item.branchActiveInPilot,
        manualFollowUpRequired: item.onTrigger.some(
          action => action.action === "manual_follow_up_required",
        ),
      }),
    ),
  );

  return Object.freeze({
    technicalUse: QUESTIONNAIRE_TECHNICAL_USE,
    releaseId: QUESTIONNAIRE_RELEASE_ID,
    version: QUESTIONNAIRE_VERSION,
    status: QUESTIONNAIRE_STATUS,
    reviewedByLawyer: false,
    contentHash: QUESTIONNAIRE_CONTENT_SHA256,
    questionCount: 63,
    activeCoreQuestionIds: Object.freeze([...raw.release1Selection.activeCoreQuestionIds]),
    activeBranchQuestionIds: Object.freeze([...raw.release1Selection.activeBranchQuestionIds]),
    orderedQuestionIds: Object.freeze(questions.map(question => question.id)),
    questions,
    questionById,
    branches,
    triggerPolicies,
  });
}

/** Pure validation/normalization entry point for test injection and pinned loading. */
export function validateQuestionnaireBundle(
  value: unknown,
  rawBytes?: string | Uint8Array,
): QuestionnaireBundle {
  if (rawBytes !== undefined) {
    const rawText = decodeRawBytes(rawBytes);
    const hash = sha256Hex(rawText);
    if (hash !== QUESTIONNAIRE_CONTENT_SHA256) fail(`content SHA-256 mismatch (${hash})`);
    let bytesValue: unknown;
    try {
      bytesValue = JSON.parse(rawText);
    } catch {
      fail("raw bytes are not valid JSON");
    }
    if (
      canonicalSerialize(value as CanonicalJsonValue) !==
      canonicalSerialize(bytesValue as CanonicalJsonValue)
    ) {
      fail("parsed value does not match the supplied raw bytes");
    }
  }

  const parsed = rawQuestionnaireSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(`${issue?.path.join(".") || "root"}: ${issue?.message || "schema mismatch"}`);
  }
  semanticValidate(parsed.data);
  return buildBundle(parsed.data);
}

/**
 * Loads the statically imported, server-only legal-core artifact. Vite exposes
 * `?raw` as exact text, while the production esbuild loader embeds JSON as an
 * object; both forms are independently pinned (raw bytes and canonical value).
 */
export function loadTechnicalQuestionnaireBundle(
  source: unknown = questionnaireRawText,
): QuestionnaireBundle {
  if (typeof source === "string") {
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      fail("raw static import is not valid JSON");
    }
    return validateQuestionnaireBundle(value, source);
  }

  let canonicalHash: string;
  try {
    canonicalHash = sha256Hex(canonicalSerialize(source as CanonicalJsonValue));
  } catch {
    fail("static JSON import is not a canonical JSON value");
  }
  if (canonicalHash !== QUESTIONNAIRE_CANONICAL_SHA256) {
    fail(`canonical content SHA-256 mismatch (${canonicalHash})`);
  }
  return validateQuestionnaireBundle(source);
}

export const technicalQuestionnaireBundle = loadTechnicalQuestionnaireBundle();

/**
 * Runtime callers must invoke this separately. It never changes or reports a
 * client-launch flag; it only fails closed unless the existing synthetic promo
 * test gate and every Questionnaire v2 pin are satisfied.
 */
export function assertTechnicalQuestionnaireBundleAllowed(
  bundle: QuestionnaireBundle = technicalQuestionnaireBundle,
): void {
  if (
    bundle.technicalUse !== QUESTIONNAIRE_TECHNICAL_USE ||
    bundle.contentHash !== QUESTIONNAIRE_CONTENT_SHA256 ||
    bundle.releaseId !== QUESTIONNAIRE_RELEASE_ID ||
    bundle.version !== QUESTIONNAIRE_VERSION ||
    bundle.status !== QUESTIONNAIRE_STATUS ||
    bundle.reviewedByLawyer !== false
  ) {
    fail("runtime bundle pins do not match the technical-test-only release");
  }
  assertQuestionnaireTestAllowed();
}
