import { Button } from "@/components/ui/button";
import {
  areRequiredConsentsAccepted,
  getConsentDocumentKey,
  type ConsentDocument,
  type ConsentValues,
} from "@/components/r1/ConsentChecklist";
import {
  acquireLogicalPromoRetryKey,
  buildPromoCanonicalSignature,
  createLogicalPromoRetryState,
  disposeSettledPromoMutation,
  markLogicalPromoRequestSucceeded,
  synchronizePromoCanonicalSignature,
} from "@/lib/promoMutationSecurity";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

export type PromoRedeemResult = {
  casePublicId: string;
  status: "access_granted";
  tariffCode: string;
  accessStatus: "active";
};

type PromoFormProps = {
  tariffCode: string;
  documents: ConsentDocument[];
  consentValues: ConsentValues;
  disabled?: boolean;
  onSuccess: (result: PromoRedeemResult) => void;
};

function createIdempotencyKey(): string | null {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues !== "function") {
    return null;
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function PromoForm({
  tariffCode,
  documents,
  consentValues,
  disabled = false,
  onSuccess,
}: PromoFormProps) {
  const [promoValue, setPromoValue] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "error">("idle");
  const feedbackHeadingRef = useRef<HTMLHeadingElement>(null);
  const logicalRetryRef = useRef(createLogicalPromoRetryState());
  const queryClient = useQueryClient();
  const redeemPromo = trpc.pilot.access.redeemPromo.useMutation({ gcTime: 0 });
  const consentAssertions = useMemo(
    () =>
      documents.map(document => ({
        documentId: document.documentId,
        documentVersion: document.documentVersion,
        contentHash: document.contentHash,
        consentType: document.consentType,
        accepted: consentValues[getConsentDocumentKey(document)] === true,
      })),
    [consentValues, documents]
  );
  const canonicalSignature = useMemo(
    () => buildPromoCanonicalSignature(tariffCode, consentAssertions),
    [consentAssertions, tariffCode]
  );
  const requiredConsentsAccepted = areRequiredConsentsAccepted(
    documents,
    consentValues
  );
  const canSubmit =
    !disabled &&
    !redeemPromo.isPending &&
    promoValue.length > 0 &&
    requiredConsentsAccepted;

  useEffect(() => {
    synchronizePromoCanonicalSignature(
      logicalRetryRef.current,
      canonicalSignature
    );
  }, [canonicalSignature]);

  useEffect(() => {
    if (feedback === "error") {
      feedbackHeadingRef.current?.focus();
    }
  }, [feedback]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) return;

    const idempotencyKey = acquireLogicalPromoRetryKey(
      logicalRetryRef.current,
      canonicalSignature,
      createIdempotencyKey
    );
    if (!idempotencyKey) {
      setFeedback("error");
      setPromoValue("");
      return;
    }

    setFeedback("idle");
    const variables = {
      tariffCode,
      promoValue,
      idempotencyKey,
      consents: consentAssertions,
    };

    try {
      const result = await redeemPromo.mutateAsync(variables);
      markLogicalPromoRequestSucceeded(logicalRetryRef.current);
      onSuccess(result);
    } catch {
      setFeedback("error");
    } finally {
      setPromoValue("");
      disposeSettledPromoMutation(queryClient, variables, redeemPromo.reset);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={redeemPromo.isPending}
      className="space-y-6"
    >
      <div>
        <label
          htmlFor="promo-value"
          className="text-base font-800 text-foreground"
        >
          Промокод
        </label>
        <input
          id="promo-value"
          name="promo-value"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={promoValue}
          onChange={event => {
            setPromoValue(event.target.value);
            if (feedback !== "idle") setFeedback("idle");
          }}
          disabled={disabled || redeemPromo.isPending}
          className="mt-2 flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-describedby="promo-requirements"
        />
        <p
          id="promo-requirements"
          className="mt-2 text-sm leading-relaxed text-muted-foreground"
        >
          Отправка доступна после отметки обязательных документов.
        </p>
      </div>

      <Button
        type="submit"
        className="min-h-11 w-full sm:w-auto"
        disabled={!canSubmit}
      >
        {redeemPromo.isPending ? "Проверяем доступ" : "Активировать доступ"}
      </Button>

      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {redeemPromo.isPending ? "Запрос обрабатывается" : ""}
      </p>

      {feedback === "error" && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <h2
            ref={feedbackHeadingRef}
            tabIndex={-1}
            className="font-display text-base font-800 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Не удалось завершить запрос
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Повторите попытку позже.
          </p>
        </div>
      )}
    </form>
  );
}
