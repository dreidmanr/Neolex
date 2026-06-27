import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CreditCard,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";

// ── Helpers ──────────────────────────────────────────────────────────────────

const RISK_LABELS: Record<string, string> = {
  low: "Низкий",
  moderate: "Умеренный",
  high: "Высокий",
  critical: "Критический",
};

const RISK_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  moderate: "outline",
  high: "default",
  critical: "destructive",
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: "Ожидание",
  paid: "Оплачено",
  failed: "Ошибка",
  refunded: "Возврат",
};

const PAYMENT_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  paid: "default",
  failed: "destructive",
  refunded: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  started: "Начата",
  consented: "Согласие",
  contact_collected: "Контакт",
  in_progress: "В процессе",
  completed: "Завершена",
  created: "Создана",
  payment_pending: "Ожидание оплаты",
  paid: "Оплачена",
  report_ready: "Отчёт готов",
};

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(amount: number | null | undefined): string {
  if (!amount) return "—";
  return `${amount.toLocaleString("ru-RU")} ₽`;
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
              {label}
            </p>
            <p className={`text-2xl font-bold ${color ?? "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Free Sessions Table ───────────────────────────────────────────────────────

function FreeSessionsTable() {
  const { data, isLoading, error } = trpc.admin.getFreeSessions.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-destructive" />
        <p className="text-sm">Ошибка загрузки данных: {error.message}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Бесплатных диагностик пока нет</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="whitespace-nowrap">Дата</TableHead>
              <TableHead className="whitespace-nowrap">Email</TableHead>
              <TableHead className="whitespace-nowrap">Имя</TableHead>
              <TableHead className="whitespace-nowrap">Продукт</TableHead>
              <TableHead className="whitespace-nowrap">Статус</TableHead>
              <TableHead className="whitespace-nowrap">Риск</TableHead>
              <TableHead className="whitespace-nowrap text-right">Балл</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted/20 transition-colors">
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(row.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm font-medium max-w-[180px] truncate">
                  {row.contactEmail || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm max-w-[120px] truncate text-muted-foreground">
                  {row.contactName || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm max-w-[160px] truncate">
                  {row.productName || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant="outline" className="text-xs font-normal">
                    {STATUS_LABELS[row.status] ?? row.status}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.riskCategory ? (
                    <Badge variant={RISK_VARIANT[row.riskCategory] ?? "outline"} className="text-xs">
                      {RISK_LABELS[row.riskCategory] ?? row.riskCategory}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm font-mono">
                  {row.totalScore ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
        Всего записей: {data.length}
      </div>
    </div>
  );
}

// ── Paid Sessions Table ───────────────────────────────────────────────────────

function PaidSessionsTable() {
  const { data, isLoading, error } = trpc.admin.getPaidSessions.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-destructive" />
        <p className="text-sm">Ошибка загрузки данных: {error.message}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Платных диагностик пока нет</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="whitespace-nowrap">Дата</TableHead>
              <TableHead className="whitespace-nowrap">Email</TableHead>
              <TableHead className="whitespace-nowrap">Имя</TableHead>
              <TableHead className="whitespace-nowrap">Продукт</TableHead>
              <TableHead className="whitespace-nowrap">Оплата</TableHead>
              <TableHead className="whitespace-nowrap">Сумма</TableHead>
              <TableHead className="whitespace-nowrap">Статус</TableHead>
              <TableHead className="whitespace-nowrap">Риск</TableHead>
              <TableHead className="whitespace-nowrap">Отчёт</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted/20 transition-colors">
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(row.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm font-medium max-w-[180px] truncate">
                  {row.contactEmail || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm max-w-[120px] truncate text-muted-foreground">
                  {row.contactName || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm max-w-[160px] truncate">
                  {row.productName || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge
                    variant={PAYMENT_VARIANT[row.paymentStatus] ?? "outline"}
                    className="text-xs"
                  >
                    {PAYMENT_LABELS[row.paymentStatus] ?? row.paymentStatus}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm font-mono">
                  {formatAmount(row.paymentAmount)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant="outline" className="text-xs font-normal">
                    {STATUS_LABELS[row.status] ?? row.status}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.riskCategory ? (
                    <Badge variant={RISK_VARIANT[row.riskCategory] ?? "outline"} className="text-xs">
                      {RISK_LABELS[row.riskCategory] ?? row.riskCategory}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.reportGeneratedAt ? (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Готов
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
        Всего записей: {data.length}
      </div>
    </div>
  );
}

// ── Stats / KPI Section ───────────────────────────────────────────────────────

function StatsSection() {
  const { data, isLoading } = trpc.admin.getStats.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const freeConversionRate =
    data.free.total > 0
      ? Math.round((data.free.completed / data.free.total) * 100)
      : 0;

  const paidConversionRate =
    data.paid.total > 0
      ? Math.round((data.paid.paid / data.paid.total) * 100)
      : 0;

  const catMap = Object.fromEntries(
    data.free.byCategory.map((c) => [c.riskCategory ?? "unknown", c.count])
  );

  return (
    <div className="space-y-6">
      {/* Main KPIs */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Бесплатная диагностика
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={Users}
            label="Всего сессий"
            value={data.free.total}
            sub="все статусы"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Завершено"
            value={data.free.completed}
            sub={`${freeConversionRate}% конверсия`}
            color="text-green-600"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Высокий / Критический"
            value={(catMap["high"] ?? 0) + (catMap["critical"] ?? 0)}
            sub="требуют внимания"
            color="text-destructive"
          />
          <KpiCard
            icon={BarChart3}
            label="Умеренный / Низкий"
            value={(catMap["moderate"] ?? 0) + (catMap["low"] ?? 0)}
            sub="меньший риск"
          />
        </div>
      </div>

      {/* Risk breakdown */}
      {data.free.completed > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Распределение по категориям риска
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["low", "moderate", "high", "critical"] as const).map((cat) => (
              <Card key={cat} className="p-4">
                <div className="flex items-center justify-between">
                  <Badge variant={RISK_VARIANT[cat]} className="text-xs">
                    {RISK_LABELS[cat]}
                  </Badge>
                  <span className="text-xl font-bold">{catMap[cat] ?? 0}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.free.completed > 0
                    ? Math.round(((catMap[cat] ?? 0) / data.free.completed) * 100)
                    : 0}
                  % от завершённых
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Paid KPIs */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Платная диагностика
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={CreditCard}
            label="Всего сессий"
            value={data.paid.total}
            sub="все статусы"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Оплачено"
            value={data.paid.paid}
            sub={`${paidConversionRate}% конверсия`}
            color="text-green-600"
          />
          <KpiCard
            icon={FileText}
            label="Отчётов готово"
            value={data.paid.completed}
            sub="AI-отчёт сгенерирован"
          />
          <KpiCard
            icon={TrendingUp}
            label="Выручка"
            value={formatAmount(data.paid.revenue)}
            sub="оплаченные сессии"
            color="text-green-600"
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────

export default function Admin() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-3 w-full max-w-md px-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 max-w-sm">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">Требуется авторизация</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Для доступа к панели администратора необходимо войти в систему.
          </p>
          <button
            onClick={() => setLocation("/")}
            className="text-sm text-primary underline underline-offset-4"
          >
            На главную
          </button>
        </div>
      </div>
    );
  }

  // Not admin
  if (user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 max-w-sm">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-semibold mb-2">Доступ запрещён</h2>
          <p className="text-muted-foreground text-sm mb-6">
            У вашего аккаунта нет прав администратора.
          </p>
          <button
            onClick={() => setLocation("/")}
            className="text-sm text-primary underline underline-offset-4"
          >
            На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/")}
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              Neolex
            </button>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground">Панель администратора</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
              {user.name?.charAt(0).toUpperCase() ?? "A"}
            </div>
            <span className="text-sm text-muted-foreground hidden sm:block">{user.name}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Панель администратора</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Статистика диагностик и управление данными
          </p>
        </div>

        <Tabs defaultValue="stats" className="space-y-6">
          <TabsList className="h-10">
            <TabsTrigger value="stats" className="gap-2 text-sm">
              <BarChart3 className="h-4 w-4" />
              Статистика
            </TabsTrigger>
            <TabsTrigger value="free" className="gap-2 text-sm">
              <FileText className="h-4 w-4" />
              Бесплатные
            </TabsTrigger>
            <TabsTrigger value="paid" className="gap-2 text-sm">
              <CreditCard className="h-4 w-4" />
              Платные
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-6">
            <StatsSection />
          </TabsContent>

          <TabsContent value="free" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Бесплатные диагностики</h2>
                <p className="text-sm text-muted-foreground">
                  Все сессии экспресс-диагностики
                </p>
              </div>
            </div>
            <FreeSessionsTable />
          </TabsContent>

          <TabsContent value="paid" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Платные диагностики</h2>
                <p className="text-sm text-muted-foreground">
                  Углублённые диагностики с AI-отчётом
                </p>
              </div>
            </div>
            <PaidSessionsTable />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
