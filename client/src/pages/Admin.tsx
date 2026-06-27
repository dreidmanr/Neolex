import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  CreditCard,
  FileText,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
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

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: SortDir }) {
  if (field !== sortField) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
  return sortDir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 ml-1 text-primary" />
    : <ArrowDown className="h-3.5 w-3.5 ml-1 text-primary" />;
}

function SortableHead({
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: {
  field: string;
  label: string;
  sortField: string;
  sortDir: SortDir;
  onSort: (f: string) => void;
}) {
  return (
    <TableHead
      className="whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center">
        {label}
        <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
      </span>
    </TableHead>
  );
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

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = [...data];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.contactEmail ?? "").toLowerCase().includes(q) ||
        (r.contactName ?? "").toLowerCase().includes(q) ||
        (r.productName ?? "").toLowerCase().includes(q)
      );
    }

    // Status filter
    if (filterStatus !== "all") {
      rows = rows.filter(r => r.status === filterStatus);
    }

    // Risk filter
    if (filterRisk !== "all") {
      rows = rows.filter(r => r.riskCategory === filterRisk);
    }

    // Sort
    rows.sort((a, b) => {
      let av: unknown, bv: unknown;
      if (sortField === "createdAt") { av = a.createdAt; bv = b.createdAt; }
      else if (sortField === "email") { av = a.contactEmail ?? ""; bv = b.contactEmail ?? ""; }
      else if (sortField === "product") { av = a.productName ?? ""; bv = b.productName ?? ""; }
      else if (sortField === "score") { av = a.totalScore ?? -1; bv = b.totalScore ?? -1; }
      else if (sortField === "risk") { av = a.riskCategory ?? ""; bv = b.riskCategory ?? ""; }
      else { av = ""; bv = ""; }

      if (av === null || av === undefined) av = "";
      if (bv === null || bv === undefined) bv = "";

      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
      else cmp = String(av).localeCompare(String(bv), "ru");

      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [data, search, filterStatus, filterRisk, sortField, sortDir]);

  if (isLoading) {
    return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-destructive" />
        <p className="text-sm">Ошибка загрузки данных: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Поиск по email, имени, продукту..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="started">Начата</SelectItem>
            <SelectItem value="consented">Согласие</SelectItem>
            <SelectItem value="contact_collected">Контакт</SelectItem>
            <SelectItem value="in_progress">В процессе</SelectItem>
            <SelectItem value="completed">Завершена</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterRisk} onValueChange={setFilterRisk}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue placeholder="Категория риска" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            <SelectItem value="low">Низкий</SelectItem>
            <SelectItem value="moderate">Умеренный</SelectItem>
            <SelectItem value="high">Высокий</SelectItem>
            <SelectItem value="critical">Критический</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} из {data?.length ?? 0}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Нет записей по выбранным фильтрам</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <SortableHead field="createdAt" label="Дата" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHead field="email" label="Email" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <TableHead className="whitespace-nowrap">Имя</TableHead>
                  <SortableHead field="product" label="Продукт" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <TableHead className="whitespace-nowrap">Статус</TableHead>
                  <SortableHead field="risk" label="Риск" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHead field="score" label="Балл" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
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
            Показано {filtered.length} из {data?.length ?? 0} записей
          </div>
        </div>
      )}
    </div>
  );
}

// ── Paid Sessions Table ───────────────────────────────────────────────────────

function PaidSessionsTable() {
  const { data, isLoading, error } = trpc.admin.getPaidSessions.useQuery();

  const [search, setSearch] = useState("");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [filterReport, setFilterReport] = useState("all");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = [...data];

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.contactEmail ?? "").toLowerCase().includes(q) ||
        (r.contactName ?? "").toLowerCase().includes(q) ||
        (r.productName ?? "").toLowerCase().includes(q)
      );
    }

    if (filterPayment !== "all") {
      rows = rows.filter(r => r.paymentStatus === filterPayment);
    }

    if (filterRisk !== "all") {
      rows = rows.filter(r => r.riskCategory === filterRisk);
    }

    if (filterReport === "ready") {
      rows = rows.filter(r => !!r.reportGeneratedAt);
    } else if (filterReport === "pending") {
      rows = rows.filter(r => !r.reportGeneratedAt);
    }

    rows.sort((a, b) => {
      let av: unknown, bv: unknown;
      if (sortField === "createdAt") { av = a.createdAt; bv = b.createdAt; }
      else if (sortField === "email") { av = a.contactEmail ?? ""; bv = b.contactEmail ?? ""; }
      else if (sortField === "product") { av = a.productName ?? ""; bv = b.productName ?? ""; }
      else if (sortField === "amount") { av = a.paymentAmount ?? 0; bv = b.paymentAmount ?? 0; }
      else if (sortField === "risk") { av = a.riskCategory ?? ""; bv = b.riskCategory ?? ""; }
      else { av = ""; bv = ""; }

      if (av === null || av === undefined) av = "";
      if (bv === null || bv === undefined) bv = "";

      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
      else cmp = String(av).localeCompare(String(bv), "ru");

      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [data, search, filterPayment, filterRisk, filterReport, sortField, sortDir]);

  if (isLoading) {
    return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-destructive" />
        <p className="text-sm">Ошибка загрузки данных: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Поиск по email, имени, продукту..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={filterPayment} onValueChange={setFilterPayment}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue placeholder="Оплата" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="pending">Ожидание</SelectItem>
            <SelectItem value="paid">Оплачено</SelectItem>
            <SelectItem value="failed">Ошибка</SelectItem>
            <SelectItem value="refunded">Возврат</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterRisk} onValueChange={setFilterRisk}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue placeholder="Категория риска" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            <SelectItem value="low">Низкий</SelectItem>
            <SelectItem value="moderate">Умеренный</SelectItem>
            <SelectItem value="high">Высокий</SelectItem>
            <SelectItem value="critical">Критический</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterReport} onValueChange={setFilterReport}>
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue placeholder="Отчёт" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все отчёты</SelectItem>
            <SelectItem value="ready">Готов</SelectItem>
            <SelectItem value="pending">Не готов</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} из {data?.length ?? 0}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Нет записей по выбранным фильтрам</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <SortableHead field="createdAt" label="Дата" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHead field="email" label="Email" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <TableHead className="whitespace-nowrap">Имя</TableHead>
                  <SortableHead field="product" label="Продукт" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <TableHead className="whitespace-nowrap">Оплата</TableHead>
                  <SortableHead field="amount" label="Сумма" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <TableHead className="whitespace-nowrap">Статус</TableHead>
                  <SortableHead field="risk" label="Риск" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <TableHead className="whitespace-nowrap">Отчёт</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
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
                      <Badge variant={PAYMENT_VARIANT[row.paymentStatus] ?? "outline"} className="text-xs">
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
            Показано {filtered.length} из {data?.length ?? 0} записей
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stats / KPI Section ───────────────────────────────────────────────────────

function StatsSection() {
  const { data, isLoading } = trpc.admin.getStats.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!data) return null;

  const freeConversionRate =
    data.free.total > 0 ? Math.round((data.free.completed / data.free.total) * 100) : 0;
  const paidConversionRate =
    data.paid.total > 0 ? Math.round((data.paid.paid / data.paid.total) * 100) : 0;

  const catMap = Object.fromEntries(
    data.free.byCategory.map((c) => [c.riskCategory ?? "unknown", c.count])
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Бесплатная диагностика
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard icon={Users} label="Всего сессий" value={data.free.total} sub="все статусы" />
          <KpiCard icon={CheckCircle2} label="Завершено" value={data.free.completed} sub={`${freeConversionRate}% конверсия`} color="text-green-600" />
          <KpiCard icon={AlertTriangle} label="Высокий / Критический" value={(catMap["high"] ?? 0) + (catMap["critical"] ?? 0)} sub="требуют внимания" color="text-destructive" />
          <KpiCard icon={BarChart3} label="Умеренный / Низкий" value={(catMap["moderate"] ?? 0) + (catMap["low"] ?? 0)} sub="меньший риск" />
        </div>
      </div>

      {data.free.completed > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Распределение по категориям риска
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["low", "moderate", "high", "critical"] as const).map((cat) => (
              <Card key={cat} className="p-4">
                <div className="flex items-center justify-between">
                  <Badge variant={RISK_VARIANT[cat]} className="text-xs">{RISK_LABELS[cat]}</Badge>
                  <span className="text-xl font-bold">{catMap[cat] ?? 0}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.free.completed > 0 ? Math.round(((catMap[cat] ?? 0) / data.free.completed) * 100) : 0}% от завершённых
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Платная диагностика
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard icon={CreditCard} label="Всего сессий" value={data.paid.total} sub="все статусы" />
          <KpiCard icon={CheckCircle2} label="Оплачено" value={data.paid.paid} sub={`${paidConversionRate}% конверсия`} color="text-green-600" />
          <KpiCard icon={FileText} label="Отчётов готово" value={data.paid.completed} sub="AI-отчёт сгенерирован" />
          <KpiCard icon={TrendingUp} label="Выручка" value={formatAmount(data.paid.revenue)} sub="оплаченные сессии" color="text-green-600" />
        </div>
      </div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────

export default function Admin() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 max-w-sm">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">Требуется авторизация</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Для доступа к панели администратора необходимо войти в систему.
          </p>
          <button onClick={() => setLocation("/")} className="text-sm text-primary underline underline-offset-4">
            На главную
          </button>
        </div>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 max-w-sm">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-semibold mb-2">Доступ запрещён</h2>
          <p className="text-muted-foreground text-sm mb-6">
            У вашего аккаунта нет прав администратора.
          </p>
          <button onClick={() => setLocation("/")} className="text-sm text-primary underline underline-offset-4">
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
            <div>
              <h2 className="text-lg font-semibold">Бесплатные диагностики</h2>
              <p className="text-sm text-muted-foreground">Все сессии экспресс-диагностики</p>
            </div>
            <FreeSessionsTable />
          </TabsContent>

          <TabsContent value="paid" className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Платные диагностики</h2>
              <p className="text-sm text-muted-foreground">Углублённые диагностики с AI-отчётом</p>
            </div>
            <PaidSessionsTable />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
