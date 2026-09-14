import PilotShell from "@/components/r1/PilotShell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { FileWarning } from "lucide-react";
import { useParams } from "wouter";

const typeLabels = {
  terms: "Условия",
  data_processing: "Обработка данных",
  marketing: "Информационные материалы",
} as const;

function GenericUnavailable() {
  return (
    <Card className="max-w-2xl border-border shadow-sm">
      <CardContent className="p-6 sm:p-8">
        <FileWarning className="size-6 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-display text-xl font-800">
          Запись недоступна
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Техническую запись метаданных не удалось получить.
        </p>
      </CardContent>
    </Card>
  );
}

export default function R1LegalMetadata() {
  const { documentId = "" } = useParams<{ documentId: string }>();
  const metadataQuery = trpc.pilot.consents.getRequiredMetadata.useQuery(
    undefined,
    { retry: false, refetchOnWindowFocus: false }
  );
  const matchingDocuments = (metadataQuery.data?.documents ?? []).filter(
    document => document.documentId === documentId
  );
  const document = matchingDocuments.length === 1 ? matchingDocuments[0] : null;

  return (
    <PilotShell
      eyebrow="Контролируемый контур"
      title="Техническая запись документа"
      description="Этот экран показывает только метаданные серверного чернового реестра."
    >
      {metadataQuery.isLoading && (
        <Skeleton className="h-72 max-w-2xl rounded-xl" />
      )}

      {!metadataQuery.isLoading &&
        (metadataQuery.isError || !document ? (
          <GenericUnavailable />
        ) : (
          <Card className="max-w-2xl border-border shadow-sm">
            <CardContent className="p-6 sm:p-8">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Это техническая черновая запись метаданных. Она не содержит
                юридический текст, не подтверждает реальное согласие клиента и
                не означает доступность сервиса для клиентов.
              </p>
              <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Тип
                  </dt>
                  <dd className="mt-1 break-words text-sm font-semibold">
                    {typeLabels[document.consentType]}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Идентификатор
                  </dt>
                  <dd className="mt-1 break-words text-sm font-semibold">
                    {document.documentId}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Версия
                  </dt>
                  <dd className="mt-1 break-words text-sm font-semibold">
                    {document.documentVersion}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Происхождение
                  </dt>
                  <dd className="mt-1 break-words text-sm font-semibold">
                    {document.provenanceStatus}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Хеш содержимого
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs">
                    {document.contentHash}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ))}
    </PilotShell>
  );
}
