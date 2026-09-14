import { Checkbox } from "@/components/ui/checkbox";

export type ConsentType = "terms" | "data_processing" | "marketing";

export type ConsentDocument = {
  documentId: string;
  documentVersion: string;
  contentHash: string;
  consentType: ConsentType;
  required: boolean;
  href: string;
};

export type ConsentValues = Record<string, boolean>;

type ConsentChecklistProps = {
  documents: ConsentDocument[];
  values: ConsentValues;
  onChange: (documentKey: string, accepted: boolean) => void;
  disabled?: boolean;
};

const consentLabels: Record<ConsentType, string> = {
  terms: "Документ условий",
  data_processing: "Документ обработки данных",
  marketing: "Информационные материалы",
};

const consentOrder: Record<ConsentType, number> = {
  terms: 0,
  data_processing: 1,
  marketing: 2,
};

export function getConsentDocumentKey(document: ConsentDocument): string {
  return [
    document.documentId,
    document.documentVersion,
    document.contentHash,
    document.consentType,
  ].join(":");
}

export function areRequiredConsentsAccepted(
  documents: ConsentDocument[],
  values: ConsentValues
): boolean {
  return documents
    .filter(document => document.required)
    .every(document => values[getConsentDocumentKey(document)] === true);
}

export default function ConsentChecklist({
  documents,
  values,
  onChange,
  disabled = false,
}: ConsentChecklistProps) {
  const orderedDocuments = [...documents].sort(
    (first, second) =>
      consentOrder[first.consentType] - consentOrder[second.consentType]
  );

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-base font-800 text-foreground">
        Подтверждения
      </legend>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Отметьте обязательные документы. Выбор информационных материалов не
        влияет на доступ.
      </p>

      <div className="mt-4 space-y-3">
        {orderedDocuments.map((document, index) => {
          const documentKey = getConsentDocumentKey(document);
          const controlId = `consent-${index}`;
          const label = consentLabels[document.consentType];
          const requirement = document.required
            ? "Обязательно"
            : "Необязательно";

          return (
            <div
              key={documentKey}
              className="rounded-lg border border-border bg-background"
            >
              <label
                htmlFor={controlId}
                className="flex min-h-11 cursor-pointer items-center gap-3 p-3 text-sm outline-none transition-colors hover:bg-muted/40 has-[[data-state=checked]]:bg-muted/30 focus-within:ring-2 focus-within:ring-ring"
              >
                <Checkbox
                  id={controlId}
                  checked={values[documentKey] === true}
                  onCheckedChange={checked =>
                    onChange(documentKey, checked === true)
                  }
                  aria-required={document.required || undefined}
                  className="size-6"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">
                    {label}
                  </span>
                  <span className="block text-muted-foreground">
                    {requirement}
                  </span>
                </span>
              </label>
              <div className="border-t border-border px-3">
                <a
                  href={document.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${label}: открыть документ`}
                >
                  Открыть документ
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
