"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Factory,
  LayoutDashboard,
  Loader2,
  Package,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";

type InsightRow = {
  id: string;
  tenant_id?: string;
  insight_type: string;
  title: string;
  description: string;
  recommendation: string | null;
  priority: string | null;
  metrics: Record<string, unknown> | null;
  is_dismissed: boolean | null;
  is_read: boolean | null;
  analyzed_at: string | null;
  created_at: string | null;
};

type SalesOrderRow = {
  id: string;
  total: number;
  order_date?: string;
};

type SalesGoalRow = {
  id: string;
  year: number;
  month: number;
  goal_amount: number;
  achieved_amount: number;
  progress_percent: number | null;
  user?: { full_name: string | null; email: string } | null;
};

type ReceivableRow = {
  current_amount: number;
  due_date: string;
  status: string;
};

type ProdAgg = { name: string; quantity: number; revenue: number };

const PRIORITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const INSIGHT_TYPE_LABELS: Record<string, string> = {
  profit_analysis: "Lucratividade",
  top_products: "Produtos",
  customer_analysis: "Clientes",
  sales_forecast: "Previsão de vendas",
  payment_risk: "Risco / inadimplência",
  production_efficiency: "Produção",
  inventory_alert: "Estoque",
  price_suggestion: "Preços",
};

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function monthRangeISO(d: Date): { from: string; to: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${y}-${pad(m + 1)}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${pad(m + 1)}-${pad(last)}`;
  return { from, to };
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Segunda-feira da semana que contém a data (YYYY-MM-DD). */
function mondayOfWeekContaining(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoDateLocal(d);
}

function sortInsights(a: InsightRow, b: InsightRow): number {
  const pa = PRIORITY_RANK[a.priority ?? "medium"] ?? 2;
  const pb = PRIORITY_RANK[b.priority ?? "medium"] ?? 2;
  if (pb !== pa) return pb - pa;
  const ta = new Date(a.analyzed_at ?? a.created_at ?? 0).getTime();
  const tb = new Date(b.analyzed_at ?? b.created_at ?? 0).getTime();
  return tb - ta;
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; json: T }> {
  const res = await fetch(url, { credentials: "include", ...init });
  let json = {} as T;
  try {
    json = (await res.json()) as T;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, json };
}

async function fetchAllPaged<T>(
  buildUrl: (page: number) => string,
  extract: (body: Record<string, unknown>) => {
    chunk: T[];
    total: number;
  },
  maxPages = 50
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  while (page <= maxPages) {
    const { ok, json } = await fetchJson<Record<string, unknown>>(
      buildUrl(page)
    );
    if (!ok) throw new Error(String((json as { error?: string }).error ?? "Erro ao carregar"));
    const { chunk, total } = extract(json);
    out.push(...chunk);
    if (chunk.length === 0 || out.length >= total) break;
    page += 1;
  }
  return out;
}

type SalesOrderItemRow = {
  product_id: string | null;
  quantity: number;
  total_price: number;
  total_cost: number | null;
  description?: string | null;
  product?: { name?: string | null } | { name?: string | null }[] | null;
};

async function chunkMap<T, R>(
  items: T[],
  size: number,
  fn: (chunk: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const part = items.slice(i, i + size);
    const r = await fn(part);
    results.push(...r);
  }
  return results;
}

type DashboardMetrics = {
  monthRevenue: number;
  monthProfitEstimate: number;
  onTimeRate: number;
  overdueTotal: number;
  topProducts: ProdAgg[];
  receivablesByWeek: { label: string; total: number; key: string }[];
  goals: SalesGoalRow[];
  productionSample: number;
};

export default function ConsultantDashboardPage() {
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [refreshingAnalysis, setRefreshingAnalysis] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  /** null = a carregar; só relevante para admins (botão «Atualizar Análises»). */
  const [anthropicConfigured, setAnthropicConfigured] = useState<
    boolean | null
  >(null);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const base =
        `/api/bi/insights?include_dismissed=true&limit=${encodeURIComponent(String(120))}`;
      const { ok, json } = await fetchJson<{ data?: InsightRow[] }>(base);
      if (!ok) {
        throw new Error(
          (json as { error?: string }).error ?? "Erro ao carregar insights"
        );
      }
      setInsights((json.data ?? []).slice().sort(sortInsights));
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao carregar insights");
      setInsights([]);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  const fetchRole = useCallback(async () => {
    try {
      const { ok, json } = await fetchJson<{ role?: string }>("/api/me");
      if (ok && json.role === "admin") setIsAdmin(true);
      else setIsAdmin(false);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const fetchAiEnv = useCallback(async () => {
    try {
      const { ok, json } = await fetchJson<{
        anthropicConfigured?: boolean;
      }>("/api/ai/business-analysis");
      if (ok && typeof json.anthropicConfigured === "boolean") {
        setAnthropicConfigured(json.anthropicConfigured);
      } else {
        setAnthropicConfigured(null);
      }
    } catch {
      setAnthropicConfigured(null);
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    setBulkLoading(true);
    const today = new Date();
    const { from, to } = monthRangeISO(today);

    try {
      const orders = await fetchAllPaged<SalesOrderRow>(
        (page) =>
          `/api/sales/orders?date_from=${from}&date_to=${to}&limit=100&page=${page}`,
        (body) => ({
          chunk: (body.data as SalesOrderRow[]) ?? [],
          total: Number((body.pagination as { total?: number })?.total ?? 0),
        })
      );

      const monthRevenue = orders.reduce(
        (s, o) => s + Number(o.total ?? 0),
        0
      );

      const itemsNested = await chunkMap(
        orders,
        8,
        async (slice) =>
          Promise.all(
            slice.map(async (order) => {
              const r = await fetchJson<{ data?: SalesOrderItemRow[] }>(
                `/api/sales/orders/${order.id}/items`
              );
              if (!r.ok) return [];
              return r.json.data ?? [];
            })
          )
      );

      const flatItems = itemsNested.flat();
      let totalCost = 0;
      const prodMap = new Map<string, ProdAgg>();
      let orphanIdx = 0;
      for (const it of flatItems) {
        const cost = Number(it.total_cost ?? 0);
        totalCost += cost;
        const pid =
          it.product_id ?? `sem_produto:${orphanIdx++}:${it.description ?? ""}`;
        let name =
          typeof it.product === "object" && it.product && !Array.isArray(it.product)
            ? it.product.name ?? "Produto"
            : Array.isArray(it.product) && it.product[0]
              ? it.product[0].name ?? "Produto"
              : "Produto";
        if (!it.product_id) name = (it.description ?? "Item").trim() || "Item";
        const cur = prodMap.get(pid) ?? {
          name,
          quantity: 0,
          revenue: 0,
        };
        cur.quantity += Number(it.quantity ?? 0);
        cur.revenue += Number(it.total_price ?? 0);
        prodMap.set(pid, cur);
      }

      const topProducts = [...prodMap.values()]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      const monthProfitEstimate = monthRevenue - totalCost;

      const prodOrders = await fetchAllPaged<{ delivery_deadline: string | null; finished_at: string | null }>(
        (page) =>
          `/api/production/orders?status=finished&limit=100&page=${page}`,
        (body) => ({
          chunk:
            (body.data as {
              delivery_deadline: string | null;
              finished_at: string | null;
            }[]) ?? [],
          total: Number((body.pagination as { total?: number })?.total ?? 0),
        }),
        3
      );

      let delayed = 0;
      const sampleLimit = Math.min(prodOrders.length, 120);
      for (let i = 0; i < sampleLimit; i++) {
        const o = prodOrders[i];
        if (!o) continue;
        const dl = o.delivery_deadline;
        const fi = o.finished_at;
        if (!dl || !fi) continue;
        if (fi.slice(0, 10) > dl) delayed++;
      }
      const considered = prodOrders.filter(
        (o) => o.delivery_deadline && o.finished_at
      ).length;
      const onTimeRate =
        considered > 0
          ? ((considered - delayed) / considered) * 100
          : 0;

      const receivables = await fetchAllPaged<ReceivableRow>(
        (page) =>
          `/api/finance/receivables?overdue=1&limit=100&page=${page}`,
        (body) => ({
          chunk: (body.data as ReceivableRow[]) ?? [],
          total: Number((body.pagination as { total?: number })?.total ?? 0),
        }),
        20
      );
      const overdueTotal = receivables.reduce(
        (s, r) => s + Number(r.current_amount ?? 0),
        0
      );

      const openRecv = await fetchAllPaged<ReceivableRow>(
        (page) => `/api/finance/receivables?limit=100&page=${page}`,
        (body) => ({
          chunk: (body.data as ReceivableRow[]) ?? [],
          total: Number((body.pagination as { total?: number })?.total ?? 0),
        }),
        15
      );
      const activeRecv = openRecv.filter((r) =>
        ["pending", "partial", "overdue"].includes(r.status)
      );

      const now = new Date();
      const weekStart = startOfWeekMonday(now);
      const mondayKeys = Array.from({ length: 8 }, (_, w) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + w * 7);
        return isoDateLocal(d);
      });
      const allowedWeeks = new Set(mondayKeys);
      const weekTotals = new Map<string, number>();
      for (const r of activeRecv) {
        const k = mondayOfWeekContaining(r.due_date);
        if (!allowedWeeks.has(k)) continue;
        weekTotals.set(
          k,
          (weekTotals.get(k) ?? 0) + Number(r.current_amount ?? 0)
        );
      }

      const receivablesByWeek = mondayKeys.map((key) => {
        const d = new Date(`${key}T12:00:00`);
        return {
          key,
          label: d.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          }),
          total: weekTotals.get(key) ?? 0,
        };
      });

      const y = today.getFullYear();
      const m = today.getMonth() + 1;
      const goalsRes = await fetchJson<{ data?: SalesGoalRow[] }>(
        `/api/sales/goals?year=${y}&month=${m}`
      );
      const goals = goalsRes.ok ? goalsRes.json.data ?? [] : [];

      setMetrics({
        monthRevenue,
        monthProfitEstimate,
        onTimeRate,
        overdueTotal,
        topProducts,
        receivablesByWeek,
        goals,
        productionSample: considered,
      });
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error ? e.message : "Erro ao carregar indicadores"
      );
      setMetrics(null);
    } finally {
      setBulkLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([
      fetchInsights(),
      fetchRole(),
      loadMetrics(),
      fetchAiEnv(),
    ]);
  }, [fetchInsights, fetchRole, fetchAiEnv, loadMetrics]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeInsights = useMemo(
    () => insights.filter((i) => !i.is_dismissed),
    [insights]
  );

  const lastAnalyzedAt = useMemo(() => {
    const ts = insights
      .map((i) => i.analyzed_at ?? i.created_at)
      .filter(Boolean) as string[];
    if (!ts.length) return null;
    return ts.reduce((a, b) => (a > b ? a : b));
  }, [insights]);

  const staleSuggestion = useMemo(() => {
    if (!lastAnalyzedAt) return true;
    const t = new Date(lastAnalyzedAt).getTime();
    return Date.now() - t > 24 * 60 * 60 * 1000;
  }, [lastAnalyzedAt]);

  const priorityInsights = useMemo(
    () =>
      activeInsights.filter(
        (i) => i.priority === "high" || i.priority === "critical"
      ),
    [activeInsights]
  );

  const filteredList = useMemo(() => {
    let list = activeInsights.slice().sort(sortInsights);
    if (typeFilter) {
      list = list.filter((i) => i.insight_type === typeFilter);
    }
    return list;
  }, [activeInsights, typeFilter]);

  const maxWeekTotal = useMemo(
    () =>
      Math.max(
        1,
        ...((metrics?.receivablesByWeek ?? []).map((w) => w.total))
      ),
    [metrics?.receivablesByWeek]
  );

  const maxTopQty = useMemo(
    () =>
      Math.max(
        1,
        ...((metrics?.topProducts ?? []).map((p) => p.quantity))
      ),
    [metrics?.topProducts]
  );

  async function markRead(id: string) {
    try {
      const res = await fetch("/api/bi/insights", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightId: id, is_read: true }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao atualizar");
      await fetchInsights();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function dismiss(id: string) {
    try {
      const res = await fetch("/api/bi/insights", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightId: id, is_dismissed: true }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao dispensar");
      await fetchInsights();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function runAnalysis() {
    setRefreshingAnalysis(true);
    try {
      const res = await fetch("/api/ai/business-analysis", {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao analisar");
      toast.success("Análises atualizadas.");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setRefreshingAnalysis(false);
    }
  }

  async function handleRefreshDashboard() {
    await loadAll();
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-24">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand-700 mb-1">
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Inteligência de negócio
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Agente Consultor</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-xl">
            Indicadores, insights da IA e ações rápidas num só lugar.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="text-xs text-slate-500 whitespace-nowrap">
            {lastAnalyzedAt ? (
              <>
                Última análise:{" "}
                <span className="font-medium text-slate-700">
                  {new Date(lastAnalyzedAt).toLocaleString("pt-BR")}
                </span>
              </>
            ) : (
              "Ainda não há análises registadas."
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={insightsLoading || bulkLoading}
              onClick={() => void handleRefreshDashboard()}
            >
              {insightsLoading || bulkLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1">Recarregar</span>
            </Button>
            {isAdmin ? (
              <Button
                type="button"
                size="sm"
                className="bg-brand-700 hover:bg-brand-800"
                disabled={
                  refreshingAnalysis ||
                  anthropicConfigured === false
                }
                title={
                  anthropicConfigured === false
                    ? "Configure ANTHROPIC_API_KEY na Vercel para ativar a análise por IA."
                    : undefined
                }
                onClick={() => void runAnalysis()}
              >
                {refreshingAnalysis ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span className="ml-1">Atualizar Análises</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {isAdmin && anthropicConfigured === false ? (
        <div
          className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
          role="status"
        >
          <strong className="font-semibold">Análise por IA desativada neste deploy:</strong>{" "}
          defina a variável de ambiente{" "}
          <code className="rounded bg-sky-100/90 px-1 text-xs">ANTHROPIC_API_KEY</code> na
          Vercel (Project → Settings → Environment Variables → Production), com uma chave de{" "}
          <span className="whitespace-nowrap">console.anthropic.com</span>, e faça{" "}
          <strong>Redeploy</strong>. Os KPIs e o resto do dashboard funcionam sem esta chave.
        </div>
      ) : null}

      {(staleSuggestion || !lastAnalyzedAt) && !insightsLoading ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center gap-2 justify-between">
          <span>
            Os insights podem estar desatualizados
            {!lastAnalyzedAt
              ? " — execute uma análise para gerar recomendações."
              : " há mais de 24 horas — considere atualizar."}
          </span>
          {isAdmin ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-amber-300 shrink-0"
              disabled={
                refreshingAnalysis || anthropicConfigured === false
              }
              title={
                anthropicConfigured === false
                  ? "Configure ANTHROPIC_API_KEY na Vercel para ativar a análise por IA."
                  : undefined
              }
              onClick={() => void runAnalysis()}
            >
              Atualizar agora
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* KPIs */}
      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">
          KPIs principais (mês atual)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Faturamento do mês</CardDescription>
              <CardTitle className="text-2xl font-bold text-slate-900 tabular-nums">
                {metrics
                  ? formatBRL(metrics.monthRevenue)
                  : bulkLoading
                    ? "…"
                    : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Lucro estimado</CardDescription>
              <CardTitle
                className={`text-2xl font-bold tabular-nums ${
                  metrics && metrics.monthProfitEstimate >= 0
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                {metrics
                  ? formatBRL(metrics.monthProfitEstimate)
                  : bulkLoading
                    ? "…"
                    : "—"}
              </CardTitle>
              <CardDescription className="text-xs">
                Total pedidos − custo dos itens (estimativa)
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Entrega no prazo</CardDescription>
              <CardTitle className="text-2xl font-bold text-slate-900 tabular-nums">
                {metrics
                  ? formatPct(metrics.onTimeRate)
                  : bulkLoading
                    ? "…"
                    : "—"}
              </CardTitle>
              <CardDescription className="text-xs">
                {metrics && metrics.productionSample > 0
                  ? `Com base em ${metrics.productionSample} OP(s) finalizadas com prazo`
                  : "Sem amostra suficiente"}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="shadow-sm ring-1 ring-rose-100">
            <CardHeader className="pb-2">
              <CardDescription>Inadimplência (em atraso)</CardDescription>
              <CardTitle className="text-2xl font-bold text-rose-700 tabular-nums">
                {metrics
                  ? formatBRL(metrics.overdueTotal)
                  : bulkLoading
                    ? "…"
                    : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Gráficos coluna */}
        <Card className="lg:col-span-1 shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base">Metas do mês</CardTitle>
            <CardDescription>Progresso (vendas)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {bulkLoading && !metrics ? (
              <p className="text-sm text-slate-500">A carregar…</p>
            ) : metrics && metrics.goals.length > 0 ? (
              metrics.goals.slice(0, 6).map((g) => {
                const pct = Math.min(
                  100,
                  Math.max(
                    0,
                    g.progress_percent ??
                      (g.goal_amount > 0
                        ? (g.achieved_amount / g.goal_amount) * 100
                        : 0)
                  )
                );
                const label =
                  g.user?.full_name?.trim() ||
                  g.user?.email?.split("@")[0] ||
                  "Equipa";
                return (
                  <div key={g.id} className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span className="truncate pr-2">{label}</span>
                      <span className="tabular-nums shrink-0">
                        {formatBRL(g.achieved_amount)} /{" "}
                        {formatBRL(g.goal_amount)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand-600 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">
                Nenhuma meta definida para este mês via API de metas.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base">Top 5 produtos</CardTitle>
            <CardDescription>Por quantidade vendida no mês</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            {bulkLoading && !metrics ? (
              <p className="text-sm text-slate-500">A carregar…</p>
            ) : metrics && metrics.topProducts.length > 0 ? (
              metrics.topProducts.map((p, idx) => (
                <div key={`${p.name}-${idx}`} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-slate-800 truncate pr-2">
                      {idx + 1}. {p.name}
                    </span>
                    <span className="text-slate-600 whitespace-nowrap">
                      {p.quantity} un.
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-500/90"
                      style={{
                        width: `${(p.quantity / maxTopQty) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                Sem vendas registadas neste período.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base">
              Contas a receber por semana
            </CardTitle>
            <CardDescription>
              Volume por semana de vencimento (aberto)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            {bulkLoading && !metrics ? (
              <p className="text-sm text-slate-500">A carregar…</p>
            ) : metrics?.receivablesByWeek?.length ? (
              metrics.receivablesByWeek.map((w) => (
                <div key={w.key} className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Semana {w.label}</span>
                    <span className="tabular-nums">{formatBRL(w.total)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500/90"
                      style={{
                        width: `${(w.total / maxWeekTotal) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Sem dados.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insights prioritários */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">
            Insights prioritários
          </h2>
          {insightsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : null}
        </div>
        {priorityInsights.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-8 text-center text-sm text-slate-500">
              Nenhum insight de prioridade alta ou crítica. Excelente — ou
              atualize as análises.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {priorityInsights.map((ins) => (
              <Card
                key={ins.id}
                className={`shadow-sm ${
                  ins.priority === "critical"
                    ? "ring-2 ring-red-500 border-red-200"
                    : "border-amber-200 ring-1 ring-amber-100"
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">
                      {ins.title}
                    </CardTitle>
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        ins.priority === "critical"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {ins.priority}
                    </span>
                  </div>
                  <CardDescription className="text-xs">
                    {INSIGHT_TYPE_LABELS[ins.insight_type] ?? ins.insight_type}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-slate-700">{ins.description}</p>
                  {ins.recommendation ? (
                    <div className="rounded-md bg-slate-50 border border-slate-100 p-3 text-slate-800">
                      <span className="text-xs font-semibold text-slate-500 block mb-1">
                        Recomendação
                      </span>
                      {ins.recommendation}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {!ins.is_read ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void markRead(ins.id)}
                      >
                        Marcar como lido
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400 self-center">
                        Lido
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-slate-600"
                      onClick={() => void dismiss(ins.id)}
                    >
                      Dispensar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Todos os insights */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            Todos os insights
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 shrink-0" htmlFor="ins-type">
              Tipo
            </label>
            <select
              id="ins-type"
              className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(INSIGHT_TYPE_LABELS).map(([val, lab]) => (
                <option key={val} value={val}>
                  {lab}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {filteredList.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="py-8 text-center text-sm text-slate-500">
                Nenhum insight ativo com este filtro.
              </CardContent>
            </Card>
          ) : (
            filteredList.map((ins) => (
              <Card
                key={ins.id}
                className={`shadow-sm ${
                  ins.priority === "critical" ? "ring-2 ring-red-500" : ""
                }`}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">
                          {ins.title}
                        </h3>
                        <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {ins.priority ?? "medium"}
                        </span>
                        <span className="text-[10px] uppercase text-slate-500">
                          {INSIGHT_TYPE_LABELS[ins.insight_type] ??
                            ins.insight_type}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{ins.description}</p>
                      {ins.recommendation ? (
                        <p className="text-sm text-slate-600 border-l-2 border-brand-200 pl-3">
                          {ins.recommendation}
                        </p>
                      ) : null}
                      <p className="text-xs text-slate-400">
                        {ins.analyzed_at
                          ? new Date(ins.analyzed_at).toLocaleString("pt-BR")
                          : ins.created_at
                            ? new Date(ins.created_at).toLocaleString("pt-BR")
                            : ""}
                      </p>
                    </div>
                    <div className="flex md:flex-col gap-2 shrink-0">
                      {!ins.is_read ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void markRead(ins.id)}
                        >
                          Marcar como lido
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void dismiss(ins.id)}
                      >
                        Dispensar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* Ações rápidas */}
      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">
          Ações rápidas
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/products", label: "Produtos", icon: Package },
            { href: "/sales/orders", label: "Pedidos de Venda", icon: ShoppingBag },
            { href: "/production/orders", label: "Produção", icon: Factory },
            { href: "/purchasing/orders", label: "Compras", icon: ShoppingCart },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="block">
              <Card className="shadow-sm h-full hover:border-brand-300 hover:shadow-md transition-all">
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{label}</p>
                    <p className="text-xs text-brand-700 flex items-center gap-0.5">
                      Abrir <ArrowRight className="h-3 w-3" />
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
