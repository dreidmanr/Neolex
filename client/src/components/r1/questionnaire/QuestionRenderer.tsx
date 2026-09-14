import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  QuestionDto,
  QuestionnaireAnswerInputDto,
} from "@shared/r1/questionnaire";

export type QuestionRendererProps = {
  question: QuestionDto;
  value: QuestionnaireAnswerInputDto | undefined;
  disabled?: boolean;
  validationMessage?: string | null;
  onChange: (value: QuestionnaireAnswerInputDto) => void;
  onTextChange: (value: string) => void;
  onClear: () => void;
};

function RequiredState({ required }: { required: boolean }) {
  return (
    <span className="mt-2 block text-sm font-medium text-muted-foreground">
      {required ? "Обязательный вопрос" : "Необязательный вопрос"}
    </span>
  );
}

function OptionList({
  question,
  value,
  disabled,
  validationMessage,
  onChange,
  onClear,
}: Omit<QuestionRendererProps, "onTextChange">) {
  const options = question.options ?? [];
  const messageId = `${question.id}-validation`;
  const hintId = question.hint ? `${question.id}-hint` : undefined;
  const describedBy = [hintId, validationMessage ? messageId : undefined]
    .filter(Boolean)
    .join(" ") || undefined;

  if (question.input === "single") {
    const selectedOptionId = value?.kind === "single" ? value.optionId : null;
    return (
      <fieldset aria-describedby={describedBy} aria-invalid={Boolean(validationMessage)}>
        <legend className="font-display text-xl font-800 leading-snug sm:text-2xl">
          {question.text}
        </legend>
        <RequiredState required={question.required} />
        {question.hint && (
          <p id={hintId} className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {question.hint}
          </p>
        )}
        <div className="mt-6 grid gap-3">
          {options.map(option => {
            const optionId = `${question.id}-${option.id}`;
            return (
              <label
                key={option.id}
                htmlFor={optionId}
                className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border border-input bg-background px-4 py-3 text-base leading-snug transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
              >
                <input
                  id={optionId}
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={selectedOptionId === option.id}
                  disabled={disabled}
                  onChange={() => onChange({ kind: "single", optionId: option.id })}
                  className="size-5 shrink-0 accent-primary outline-none"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
        {selectedOptionId !== null && (
          <Button
            type="button"
            variant="ghost"
            className="mt-4 min-h-11 w-full text-base sm:w-auto"
            disabled={disabled}
            onClick={onClear}
          >
            Очистить выбор
          </Button>
        )}
        {validationMessage && (
          <p id={messageId} className="mt-4 text-sm font-semibold text-destructive">
            {validationMessage}
          </p>
        )}
      </fieldset>
    );
  }

  const selectedOptionIds = value?.kind === "multi" ? value.optionIds : [];
  const selected = new Set(selectedOptionIds);
  return (
    <fieldset aria-describedby={describedBy} aria-invalid={Boolean(validationMessage)}>
      <legend className="font-display text-xl font-800 leading-snug sm:text-2xl">
        {question.text}
      </legend>
      <RequiredState required={question.required} />
      {question.hint && (
        <p id={hintId} className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {question.hint}
        </p>
      )}
      <div className="mt-6 grid gap-3">
        {options.map(option => {
          const optionId = `${question.id}-${option.id}`;
          const checked = selected.has(option.id);
          return (
            <label
              key={option.id}
              htmlFor={optionId}
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border border-input bg-background px-4 py-3 text-base leading-snug transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
            >
              <input
                id={optionId}
                type="checkbox"
                name={`question-${question.id}`}
                value={option.id}
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  const next = checked
                    ? selectedOptionIds.filter(id => id !== option.id)
                    : [...selectedOptionIds, option.id];
                  onChange(next.length > 0 ? { kind: "multi", optionIds: next } : null);
                }}
                className="size-5 shrink-0 accent-primary outline-none"
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
      {selectedOptionIds.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          className="mt-4 min-h-11 w-full text-base sm:w-auto"
          disabled={disabled}
          onClick={onClear}
        >
          Очистить выбор
        </Button>
      )}
      {validationMessage && (
        <p id={messageId} className="mt-4 text-sm font-semibold text-destructive">
          {validationMessage}
        </p>
      )}
    </fieldset>
  );
}

export default function QuestionRenderer(props: QuestionRendererProps) {
  if (props.question.input !== "text") {
    return <OptionList {...props} />;
  }

  const { question, value, disabled, validationMessage, onTextChange, onClear } = props;
  const inputId = `${question.id}-text`;
  const hintId = question.hint ? `${question.id}-hint` : undefined;
  const messageId = `${question.id}-validation`;
  const describedBy = [hintId, validationMessage ? messageId : undefined]
    .filter(Boolean)
    .join(" ") || undefined;
  const text = value?.kind === "text" ? value.text : "";

  return (
    <div>
      <label htmlFor={inputId} className="block font-display text-xl font-800 leading-snug sm:text-2xl">
        {question.text}
      </label>
      <RequiredState required={question.required} />
      {question.hint && (
        <p id={hintId} className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {question.hint}
        </p>
      )}
      <Textarea
        id={inputId}
        name={`question-${question.id}`}
        value={text}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={Boolean(validationMessage)}
        onChange={event => onTextChange(event.target.value)}
        className="mt-6 min-h-32 w-full resize-y text-base md:text-base"
      />
      {text.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          className="mt-4 min-h-11 w-full text-base sm:w-auto"
          disabled={disabled}
          onClick={onClear}
        >
          Очистить ответ
        </Button>
      )}
      {validationMessage && (
        <p id={messageId} className="mt-4 text-sm font-semibold text-destructive">
          {validationMessage}
        </p>
      )}
    </div>
  );
}
