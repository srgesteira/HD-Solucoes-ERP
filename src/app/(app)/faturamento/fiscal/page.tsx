"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  FileText,
  Loader2,
  PackageCheck,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  FiscalStatusBadge,
  ReadyForInvoiceCompositeBadge,
} from "@/components/fiscal/fiscal-status-badge";
import {
  FiscalAiAssistantModal,
  type FiscalAiAssistantResponse,
} from "@/components/fiscal/fiscal-ai-assistant-modal";
import { FiscalOutboundKanban } from "@/components/faturamento/fiscal-outbound-kanban";
import { Button } from "@/shared/ui/button";
import { AppPage } from "@/shared/ui/app-page";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  CRONOGRAMA_TOKENS,
  CronogramaError,
  CronogramaPagination,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import type { FiscalInvoicingListRow } from "@/modules/faturamento/lib/fiscal-invoicing-list-service";
import {
  creditStatusPill,
  formatFiscalListDate,
  nfeStatusPill,
  salesOrderStatusPill,
} from "@/modules/faturamento/lib/fiscal-invoicing-list-display";
import { billingNfeDisplayLabel } from "@/modules/faturamento/lib/sales-order-billing-display";
import {
  FISCAL_INVOICING_LIST_TAB_DEFAULT,
  FISCAL_INVOICING_LIST_TAB_LABELS,
  FISCAL_INVOICING_LIST_TABS,
  type FiscalInvoicingListTab,
} from "@/modules/faturamento/lib/fiscal-invoicing-list-tabs";

type ApiResponse = {
  data: FiscalInvoicingListRow[];
  pagination: { page: number; limit: number; total: number };
  tab?: string;
  error?: string;
};

const fiscalInvoicingQueryKey = (filters: {
  tab: FiscalInvoicingListTab;
  search: string;
  page: number;
  limit: number;
}) => ["fiscal-invoicing", filters] as const;

async function fetchFiscalInvoicing(filters: {
  tab: FiscalInvoicingListTab;
  search: string;
  page: number;
  limit: number;
}): Promise<ApiResponse> {
  const params = new URLSearchParams();
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));
  params.append("tab", filters.tab);
  if (filters.search.trim()) params.append("search", filters.search.trim());

  const res = await fetch(`/api/faturamento/fiscal?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ApiResponse;

  if (!res.ok) {
    throw new Error(
      typeof json.error === "string"
        ? json.error
        : "Erro ao carregar faturamento fiscal"
    );
  }

  if (!json.data || !json.pagination) {
    throw new Error("Resposta inválida da API");
  }

  return json;
}

async function postEmitNfse(salesOrderId: string): Promise<{ nfe_id: string }> {
  const res = await fetch("/api/nfe/emitir", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sales_order_id: salesOrderId }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    nfe_id?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao emitir NFS-e");
  if (!json.nfe_id) throw new Error("Resposta inválida da API");
  return { nfe_id: json.nfe_id };
}

async function consultNfe(nfeId: string): Promise<void> {
  const res = await fetch(
    `/api/nfe/consultar?nfe_id=${encodeURIComponent(nfeId)}`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao consultar NFS-e");
}

async function postPlanWithoutInvoice(orderId: string): Promise<void> {
  const res = await fetch(
    `/api/faturamento/fiscal/${encodeURIComponent(orderId)}/plan-without-invoice`,
    { method: "POST", credentials: "include" }
  );
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao marcar sem nota");
}

async function postCloseWithoutInvoice(orderId: string): Promise<void> {
  const res = await fetch(
    `/api/faturamento/fiscal/${encodeURIComponent(orderId)}/close-without-invoice`,
    { method: "POST", credentials: "include" }
  );
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao fechar sem nota");
}

async function postFiscalAiAssistant(
  salesOrderId: string,
  description: string
): Promise<FiscalAiAssistantResponse> {
  const res = await fetch("/api/ai/fiscal-order-assistant", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sales_order_id: salesOrderId, description }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: FiscalAiAssistantResponse & { fiscalStatus?: string };
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro no assistente fiscal");
  return {
    status: json.data?.status ?? "applied",
    summary: json.data?.summary ?? "Fiscal aplicado.",
    questions: json.data?.questions ?? [],
    fiscalStatus: json.data?.fiscalStatus,
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

export default function FiscalInvoicingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { canMenu } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canFaturamento = isAdmin || canMenu("faturamento");

  const [tab, setTab] = useState<FiscalInvoicingListTab>(
    FISCAL_INVOICING_LIST_TAB_DEFAULT
  );
  const [viewMode, setViewMode] = useState<"kanban" | "lista">("kanban");
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();
  const [page, setPage] = useState(1);
  const limit = 25;
  const [syncingNfeId, setSyncingNfeId] = useState<string | null>(null);
  const [emittingOrderId, setEmittingOrderId] = useState<string | null>(null);
  const [closingWithoutInvoiceId, setClosingWithoutInvoiceId] = useState<
    string | null
  >(null);
  const [planningWithoutInvoiceId, setPlanningWithoutInvoiceId] = useState<
    string | null
  >(null);
  const [aiTarget, setAiTarget] = useState<FiscalInvoicingListRow | null>(null);
  const [aiDescription, setAiDescription] = useState("");
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search, tab]);

  const queryFilters = useMemo(
    () => ({ search, tab, page, limit }),
    [search, tab, page, limit]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: fiscalInvoicingQueryKey(queryFilters),
    queryFn: () => fetchFiscalInvoicing(queryFilters),
    staleTime: 60_000,
    enabled: canFaturamento,
  });

  const totalPages = data?.pagination
    ? Math.max(1, Math.ceil(data.pagination.total / limit))
    : 0;

  const rangeDescription = useMemo(() => {
    if (!data?.pagination) return "";
    const { total } = data.pagination;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    return `${start}–${end} de ${total}`;
  }, [data?.pagination, page, limit]);

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: ["fiscal-invoicing"] });
  };

  const emitMutation = useMutation({
    mutationFn: async (orderId: string) => {
      setEmittingOrderId(orderId);
      const { nfe_id } = await postEmitNfse(orderId);
      for (let i = 0; i < 12; i++) {
        await consultNfe(nfe_id);
        await new Promise((r) => setTimeout(r, 1200));
      }
    },
    onSuccess: () => {
      toast.success("NFS-e enviada — verifique o estado na listagem.");
      invalidateList();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setEmittingOrderId(null),
  });

  const syncNfe = useCallback(async (nfeId: string) => {
    setSyncingNfeId(nfeId);
    try {
      await consultNfe(nfeId);
      toast.success("Estado da NFS-e actualizado.");
      invalidateList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSyncingNfeId(null);
    }
  }, []);

  const planWithoutInvoiceMutation = useMutation({
    mutationFn: async (orderId: string) => {
      setPlanningWithoutInvoiceId(orderId);
      await postPlanWithoutInvoice(orderId);
    },
    onSuccess: () => {
      toast.success(
        "Pedido marcado como «Sem nota» — aguardando liberação da produção."
      );
      setTab("waiting");
      invalidateList();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setPlanningWithoutInvoiceId(null),
  });

  const closeWithoutInvoiceMutation = useMutation({
    mutationFn: async (orderId: string) => {
      setClosingWithoutInvoiceId(orderId);
      await postCloseWithoutInvoice(orderId);
    },
    onSuccess: () => {
      toast.success("Pedido concluído — entrega sem nota fiscal.");
      setTab("nfe_authorized");
      invalidateList();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setClosingWithoutInvoiceId(null),
  });

  const runFiscalAi = async () => {
    if (!aiTarget) return;
    setAiLoading(true);
    try {
      const out = await postFiscalAiAssistant(aiTarget.id, aiDescription);
      if (out.status === "needs_input") {
        setAiQuestions(out.questions);
        toast.message(out.summary);
        return;
      }
      if (out.status === "rules_applied") {
        toast.info(out.summary);
      } else {
        toast.success(out.summary);
      }
      setAiTarget(null);
      setAiDescription("");
      setAiQuestions([]);
      invalidateList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setAiLoading(false);
    }
  };

  function onTabChange(next: string) {
    setTab(next as FiscalInvoicingListTab);
    setPage(1);
  }

  const tableColumns = useMemo((): SortableTableColumn<FiscalInvoicingListRow>[] => {
    return [
      {
        key: "order_number",
        label: "Nº pedido",
        type: "text",
        width: "w-[9%]",
        accessor: (row) => row.order_number,
        render: (row) => (
          <Link
            href={`/faturamento/fiscal/${row.id}`}
            className={cn(CRONOGRAMA_TOKENS.cellLink, "font-medium")}
            title="Abrir revisão fiscal do pedido"
          >
            {row.order_number}
          </Link>
        ),
      },
      {
        key: "client_name",
        label: "Cliente",
        type: "text",
        width: "w-[16%]",
        accessor: (row) => row.client_name,
      },
      {
        key: "order_date",
        label: "Data",
        type: "date",
        width: "w-[7%]",
        accessor: (row) => row.order_date,
        render: (row) => formatFiscalListDate(row.order_date),
      },
      {
        key: "status",
        label: "Status PV",
        type: "text",
        width: "w-[9%]",
        accessor: (row) => row.status,
        render: (row) => {
          const pill = salesOrderStatusPill(row.status);
          return (
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                pill.className
              )}
            >
              {pill.label}
            </span>
          );
        },
      },
      {
        key: "ready_for_invoice",
        label: "Liberação",
        type: "text",
        width: "w-[11%]",
        accessor: (row) => String(row.ready_for_invoice),
        render: (row) => (
          <ReadyForInvoiceCompositeBadge
            readyForInvoice={row.ready_for_invoice}
            fiscalStatus={row.fiscal_status ?? "pending"}
          />
        ),
      },
      {
        key: "fiscal_status",
        label: "Fiscal",
        type: "text",
        width: "w-[9%]",
        accessor: (row) => row.fiscal_status ?? "pending",
        render: (row) => (
          <FiscalStatusBadge status={row.fiscal_status ?? "pending"} />
        ),
      },
      {
        key: "nfe_status",
        label: "NF-e",
        type: "text",
        width: "w-[9%]",
        accessor: (row) => row.nfe_status ?? "",
        render: (row) => {
          const semNota = billingNfeDisplayLabel({
            billing_plan: row.billing_plan ?? null,
            billing_closure: row.billing_closure ?? null,
            nfe_status: row.nfe_status,
          });
          if (semNota.label) {
            return (
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                  semNota.className
                )}
              >
                {semNota.label}
              </span>
            );
          }
          const pill = nfeStatusPill(row.nfe_status);
          return (
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                pill.className
              )}
              title={row.nfe_number ?? undefined}
            >
              {row.nfe_number ? `${pill.label} · ${row.nfe_number}` : pill.label}
            </span>
          );
        },
      },
      {
        key: "total",
        label: "Valor total",
        type: "number",
        width: "w-[9%]",
        accessor: (row) => row.total,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellMuted}>
            {formatCurrency(row.total)}
          </span>
        ),
      },
      {
        key: "credit_status",
        label: "Crédito",
        type: "text",
        width: "w-[9%]",
        accessor: (row) => row.credit_status ?? "",
        render: (row) => {
          const pill = creditStatusPill(row.credit_status);
          if (!pill) return <span className="text-slate-400">—</span>;
          return (
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                pill.className
              )}
            >
              {pill.label}
            </span>
          );
        },
      },
    ];
  }, []);

  const emptyMessage = `Nenhum pedido em «${FISCAL_INVOICING_LIST_TAB_LABELS[tab]}»${
    search ? " para esta busca." : "."
  }`;

  const listPanel = (
    <CronogramaPanel
      search={
        <CronogramaSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Buscar nº pedido, cliente ou produto…"
        />
      }
      error={
        error ? (
          <CronogramaError message={error.message} onRetry={() => void refetch()} />
        ) : null
      }
      footer={
        data?.pagination?.total ? (
          <CronogramaPagination
            page={page}
            totalPages={totalPages}
            rangeDescription={rangeDescription}
            itemCount={data?.data?.length}
            onPageChange={setPage}
          />
        ) : null
      }
    >
      <SortableTable
        columns={tableColumns}
        data={data?.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        emptyMessage={emptyMessage}
        rowClassName={(row) =>
          row.ready_for_invoice &&
          !row.billing_closure &&
          !(
            row.fiscal_status === "rules_applied" ||
            row.fiscal_status === "manual_override" ||
            row.fiscal_status === "approved"
          )
            ? "animate-pulse bg-amber-50/80"
            : tab === "ready" &&
                (row.can_emit || row.billing_plan === "without_invoice")
              ? "animate-pulse bg-emerald-50/60 dark:bg-emerald-950/20"
              : ""
        }
        actionsColumn={{
          label: "Acções",
          width: "w-[10rem]",
          render: (row) => (
            <div className="flex flex-wrap items-center gap-1">
              {isAdmin &&
              tab === "fiscal_pending" &&
              row.billing_plan !== "without_invoice" &&
              !row.billing_closure ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={planningWithoutInvoiceId === row.id}
                  title="Marcar entrega sem NF-e"
                  onClick={() => planWithoutInvoiceMutation.mutate(row.id)}
                >
                  {planningWithoutInvoiceId === row.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PackageCheck className="h-3.5 w-3.5" />
                  )}
                </Button>
              ) : null}
              {isAdmin &&
              (row.fiscal_status === "pending" ||
                row.fiscal_status === "no_rules" ||
                row.fiscal_status === "review_required") ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  title="Assistente fiscal (IA) — sem regra cadastrada"
                  onClick={() => {
                    setAiTarget(row);
                    setAiQuestions([]);
                    setAiDescription("");
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {isAdmin && row.can_emit && row.billing_plan !== "without_invoice" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  className="h-7 px-2 text-[11px]"
                  disabled={emittingOrderId === row.id}
                  title="Emitir NFS-e"
                  onClick={() => emitMutation.mutate(row.id)}
                >
                  {emittingOrderId === row.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              ) : null}
              {isAdmin &&
              tab === "ready" &&
              row.billing_plan === "without_invoice" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  className="h-7 gap-1 px-2 text-[11px]"
                  disabled={
                    !row.can_confirm_without_invoice ||
                    closingWithoutInvoiceId === row.id
                  }
                  title={
                    row.can_confirm_without_invoice
                      ? "Confirmar entrega sem nota — vai para Autorizadas"
                      : "Aguardando liberação da produção ou crédito para confirmar sem nota"
                  }
                  onClick={() => closeWithoutInvoiceMutation.mutate(row.id)}
                >
                  {closingWithoutInvoiceId === row.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PackageCheck className="h-3.5 w-3.5" />
                  )}
                  Confirmar sem nota
                </Button>
              ) : null}
              {row.nfe_id &&
              (row.nfe_status === "pending" || row.nfe_status === "processing") ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={syncingNfeId === row.nfe_id}
                  title="Sincronizar NF-e"
                  onClick={() => void syncNfe(row.nfe_id!)}
                >
                  {syncingNfeId === row.nfe_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                title="Revisão fiscal"
                onClick={() => router.push(`/faturamento/fiscal/${row.id}`)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          ),
        }}
      />
    </CronogramaPanel>
  );

  if (!canFaturamento) {
    return (
      <AppPage
        title="Faturamento fiscal"
        description="Emissão de NFS-e e acompanhamento fiscal dos pedidos de venda."
        width="wide"
      >
        <p className="text-slate-600 py-12 text-center">
          Sem permissão para aceder ao módulo Faturamento.
        </p>
      </AppPage>
    );
  }

  return (
    <AppPage
      title="Faturamento fiscal"
      description="Kanban de saída — conferência fiscal, liberação PCP e emissão (via Expedição)."
      width="wide"
      density="comfortable"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "kanban" ? "primary" : "ghost"}
              className="h-8 px-3 text-xs"
              onClick={() => setViewMode("kanban")}
            >
              Kanban
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "lista" ? "primary" : "ghost"}
              className="h-8 px-3 text-xs"
              onClick={() => setViewMode("lista")}
            >
              Lista
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push("/settings/fiscal-rules")}
          >
            <FileText className="h-4 w-4" />
            Regras fiscais
          </Button>
        </div>
      }
    >
      {viewMode === "kanban" ? (
        <div className="space-y-4">
          <CronogramaSearch
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Buscar nº pedido, cliente ou produto…"
          />
          <FiscalOutboundKanban search={search} enabled={canFaturamento} />
          <p className="text-xs text-slate-500">
            Notas em curso / erros / autorizadas: use a vista{" "}
            <button
              type="button"
              className="text-emerald-700 hover:underline"
              onClick={() => setViewMode("lista")}
            >
              Lista
            </button>
            .
          </p>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
          <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0">
            {FISCAL_INVOICING_LIST_TABS.map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-900"
              >
                {FISCAL_INVOICING_LIST_TAB_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>

          {FISCAL_INVOICING_LIST_TABS.map((key) => (
            <TabsContent key={key} value={key} className="mt-0">
              {tab === key ? listPanel : null}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <FiscalAiAssistantModal
        open={aiTarget != null}
        orderLabel={aiTarget?.order_number}
        loading={aiLoading}
        description={aiDescription}
        questions={aiQuestions}
        onDescriptionChange={setAiDescription}
        onClose={() => {
          setAiTarget(null);
          setAiDescription("");
          setAiQuestions([]);
        }}
        onSubmit={() => void runFiscalAi()}
      />

      <p className="text-center text-sm pt-2">
        <Link
          href="/finance/credit-analysis"
          className="text-emerald-700 hover:underline"
        >
          Ir para análise de crédito
        </Link>
        {" · "}
        <Link href="/sales/orders" className="text-emerald-700 hover:underline">
          Ir para pedidos de venda
        </Link>
      </p>
    </AppPage>
  );
}
