import PilotShell from "@/components/r1/PilotShell";
import ConsentChecklist, {
  type ConsentDocument,
  type ConsentValues,
} from "@/components/r1/ConsentChecklist";
import PromoForm, { type PromoRedeemResult } from "@/components/r1/PromoForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";

function UnavailablePanel() {
  return (
    <Card className="max-w-2xl border-border shadow-sm">
      <CardContent className="p-6 sm:p-8">
        <LockKeyhole
          className="size-6 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="mt-4 font-display text-xl font-800">
          Доступ временно недоступен
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Технические параметры доступа не удалось подтвердить. Повторите
          попытку позже.
        </p>
      </CardContent>
    </Card>
  );
}

function OfferDetails({
  offer,
}: {
  offer: {
    tariffCode: string;
    serviceTier: string;
    currency: string;
    provenanceStatus: string;
  };
}) {
  const fields = [
    ["Код тарифа", offer.tariffCode],
    ["Уровень сервиса", offer.serviceTier],
    ["Валюта", offer.currency],
  ];

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="space-y-3 border-b border-border pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Техническая конфигурация
          </p>
          <CardTitle className="mt-1 font-display text-xl">
            Доступ по промокоду
          </CardTitle>
        </div>
        <Badge
          variant="outline"
          className="w-fit border-border bg-muted px-3 py-1.5 text-muted-foreground"
        >
          Технический / черновой статус: {offer.provenanceStatus}
        </Badge>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-1 break-words text-sm font-semibold text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function AccessGranted({ result }: { result: PromoRedeemResult }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Card className="max-w-2xl border-primary/20 shadow-sm">
      <CardContent className="p-6 sm:p-8">
        <CheckCircle2 className="size-7 text-primary" aria-hidden="true" />
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-4 font-display text-2xl font-800 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Технический доступ активен
        </h2>
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-sm leading-relaxed text-muted-foreground"
        >
          Текущий статус доступа: {result.accessStatus}.
        </p>
        <Button asChild className="mt-6 min-h-11">
          <Link href="/cabinet">Перейти в кабинет</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PilotAccess() {
  const [consentValues, setConsentValues] = useState<ConsentValues>({});
  const [redeemResult, setRedeemResult] = useState<PromoRedeemResult | null>(
    null
  );
  const offerQuery = trpc.pilot.access.getOffer.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const consentsQuery = trpc.pilot.consents.getRequiredMetadata.useQuery(
    undefined,
    {
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  const documents = (consentsQuery.data?.documents ?? []) as ConsentDocument[];
  const documentsSignature = useMemo(
    () =>
      documents
        .map(document =>
          [
            document.documentId,
            document.documentVersion,
            document.contentHash,
            document.consentType,
            document.required,
            document.href,
          ].join(":")
        )
        .join("|"),
    [documents]
  );

  useEffect(() => {
    setConsentValues({});
  }, [documentsSignature]);

  const hasRequiredAccessDocuments =
    documents.some(
      document => document.consentType === "terms" && document.required
    ) &&
    documents.some(
      document =>
        document.consentType === "data_processing" && document.required
    ) &&
    documents.some(document => document.consentType === "marketing");

  const isLoading = offerQuery.isLoading || consentsQuery.isLoading;
  const isUnavailable =
    offerQuery.isError ||
    consentsQuery.isError ||
    !offerQuery.data ||
    !consentsQuery.data ||
    !hasRequiredAccessDocuments;

  return (
    <PilotShell
      eyebrow="Контролируемый контур"
      title="Доступ R1"
      description="Техническая форма активации в контролируемом контуре. Параметры и документы загружаются для текущего запроса."
    >
      {isLoading && (
        <div
          className="space-y-5"
          aria-label="Загрузка технических параметров"
          aria-busy="true"
        >
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && isUnavailable && <UnavailablePanel />}

      {!isLoading && !isUnavailable && offerQuery.data && !redeemResult && (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="min-w-0 space-y-5" aria-label="Параметры доступа">
            <OfferDetails offer={offerQuery.data} />
            <Card className="border-border shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <PromoForm
                  tariffCode={offerQuery.data.tariffCode}
                  documents={documents}
                  consentValues={consentValues}
                  onSuccess={setRedeemResult}
                />
              </CardContent>
            </Card>
          </section>

          <aside className="min-w-0">
            <Card className="border-border shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <ConsentChecklist
                  documents={documents}
                  values={consentValues}
                  onChange={(documentKey, accepted) => {
                    setConsentValues(current => ({
                      ...current,
                      [documentKey]: accepted,
                    }));
                  }}
                />
              </CardContent>
            </Card>
          </aside>
        </div>
      )}

      {!isLoading && !isUnavailable && redeemResult && (
        <AccessGranted result={redeemResult} />
      )}

      {!isLoading && !isUnavailable && !redeemResult && (
        <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          Отправляйте только данные, предназначенные для этого технического
          контура.
        </p>
      )}
    </PilotShell>
  );
}
