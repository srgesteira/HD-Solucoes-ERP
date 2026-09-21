"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  PackageCheck,
  RefreshCw,
  Send,
  Sparkles,
  Ungroup,
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
import { digitsOnlyDoc } from "@/modules/fiscal/lib/bling/bling-nfe-payload";

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

async function postEmitNfe(salesOrderId: string): Promise<void> {
  const res = await fetch("/api/nfe/emitir", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sales_order_id: salesOrderId }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao emitir nota");
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
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

  const reopenConferenceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/faturamento/fiscal/reopen-conference", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { updated?: number };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao reabrir conferência");
      return json.data?.updated ?? 0;
    },
    onSuccess: (updated) => {
      toast.success(
        updated > 0
          ? `${updated} pedido(s) voltaram para «Fiscal a conferir».`
          : "Não havia pedidos a reabrir."
      );
      setTab("fiscal_pending");
      invalidateList();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rows = data?.data ?? [];
  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));
  const groupHint = useMemo(() => {
    if (selectedRows.length < 2) {
      return "Seleccione 2 ou mais pedidos do mesmo cliente para uma nota só.";
    }
    const docs = new Set(
      selectedRows
        .map((r) => digitsOnlyDoc(r.client_document))
        .filter((d) => d.length >= 11)
    );
    if (docs.size !== 1) {
      return "Só é possível agrupar pedidos do mesmo cliente (mesmo CNPJ/CPF).";
    }
    const types = new Set(
      selectedRows.map((r) => r.invoice_document_type).filter(Boolean)
    );
    if (types.size !== 1) {
      return "Todos precisam do mesmo tipo de nota (NF-e produto ou industrialização).";
    }
    const t = [...types][0];
    if (t !== "nfe_product" && t !== "nfe_industrialization") {
      return "Agrupar só vale para NF-e de produto ou industrialização.";
    }
    if (selectedRows.some((r) => r.billing_closure || r.nfe_group_id)) {
      return "Há pedido já faturado ou já agrupado. Desagrupe primeiro.";
    }
    return null;
  }, [selectedRows]);

  const sharedGroupId =
    selectedRows.length > 0 &&
    selectedRows.every(
      (r) => r.nfe_group_id && r.nfe_group_id === selectedRows[0].nfe_group_id
    )
      ? selectedRows[0].nfe_group_id
      : null;

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const groupMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/faturamento/fiscal/group", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales_order_ids: ids }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { members?: Array<{ order_number: string }> };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao agrupar");
      return json.data;
    },
    onSuccess: (group) => {
      const nums = (group?.members ?? []).map((m) => m.order_number).join(", ");
      toast.success(
        `Pedidos agrupados numa nota: ${nums}. Na emissão, cada PV sai nas informações da NF.`
      );
      setSelectedIds([]);
      invalidateList();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const ungroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await fetch(
        `/api/faturamento/fiscal/group?groupId=${encodeURIComponent(groupId)}`,
        { method: "DELETE", credentials: "include" }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao desagrupar");
    },
    onSuccess: () => {
      toast.success("Pedidos desagrupados.");
      invalidateList();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const emitNfe = useCallback(
    async (orderId: string, warnings: string[] = []) => {
      if (warnings.length) {
        const ok = window.confirm(
          `${warnings.join("\n")}\n\nEmitir a nota mesmo assim?`
        );
        if (!ok) return;
      }
      setEmittingOrderId(orderId);
      try {
        await postEmitNfe(orderId);
        toast.success("Emissão enviada. Acompanhe o status da nota nesta lista.");
        invalidateList();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao emitir");
      } finally {
        setEmittingOrderId(null);
      }
    },
    []
  );

  const syncNfe = useCallback(async (nfeId: string) => {
    setSyncingNfeId(nfeId);
    try {
      await consultNfe(nfeId);
      toast.success("Estado da nota actualizado.");
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
        key: "select",
        label: "",
        type: "text",
        width: "w-[3%]",
        sortable: false,
        truncate: false,
        render: (row) => {
          const selectable =
            !row.billing_closure && row.billing_plan !== "without_invoice";
          return (
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-emerald-700"
              checked={selectedIds.includes(row.id)}
              disabled={!selectable}
              onChange={() => toggleSelected(row.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Seleccionar ${row.order_number}`}
            />
          );
        },
      },
      {
        key: "order_number",
        label: "Nº pedido",
        type: "text",
        width: "w-[11%]",
        accessor: (row) => row.order_number,
        truncate: false,
        render: (row) => (
          <div className="flex flex-col gap-0.5">
            <Link
              href={`/faturamento/fiscal/${row.id}`}
              className={cn(CRONOGRAMA_TOKENS.cellLink, "font-medium")}
              title="Abrir revisão fiscal do pedido"
            >
              {row.order_number}
            </Link>
            {row.nfe_group_orders?.length > 1 ? (
              <span
                className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-900 ring-1 ring-inset ring-sky-200"
                title={`Nota agrupada: ${row.nfe_group_orders.map((o) => o.order_number).join(", ")}`}
              >
                <Layers className="h-3 w-3 shrink-0" />
                {row.nfe_group_orders.map((o) => o.order_number).join(" + ")}
              </span>
            ) : null}
          </div>
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
        key: "unmapped_bling",
        label: "Bling",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => (row.unmapped_bling_skus ?? []).join(", "),
        render: (row) => {
          if (
            row.invoice_document_type !== "nfe_product" &&
            row.invoice_document_type !== "nfe_industrialization"
          ) {
            return <span className="text-slate-400">—</span>;
          }
          if (!row.unmapped_bling_skus?.length) {
            return (
              <span className="text-[10px] font-medium text-emerald-800">
                Produtos ok
              </span>
            );
          }
          return (
            <span
              className="inline-flex max-w-full rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ring-red-200 bg-red-50 text-red-800"
              title={row.unmapped_bling_skus.join(", ")}
            >
              Sem Bling ({row.unmapped_bling_skus.length})
            </span>
          );
        },
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
            <div className="flex flex-col gap-0.5">
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                  pill.className
                )}
                title={row.nfe_error ?? row.nfe_number ?? undefined}
              >
                {row.nfe_number ? `${pill.label} · ${row.nfe_number}` : pill.label}
              </span>
              {row.nfe_error ? (
                <span
                  className="line-clamp-3 text-[10px] leading-snug text-red-800"
                  title={row.nfe_error}
                >
                  {row.nfe_error}
                </span>
              ) : null}
              {row.nfe_pdf_url || row.nfe_xml_url ? (
                <span className="flex gap-1 text-[10px]">
                  {row.nfe_pdf_url ? (
                    <a
                      href={row.nfe_pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-700 hover:underline"
                    >
                      DANFE
                    </a>
                  ) : null}
                  {row.nfe_xml_url ? (
                    <a
                      href={row.nfe_xml_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-700 hover:underline"
                    >
                      XML
                    </a>
                  ) : null}
                </span>
              ) : null}
            </div>
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
  }, [selectedIds]);

  const emptyMessage = `Nenhum pedido em «${FISCAL_INVOICING_LIST_TAB_LABELS[tab]}»${
    search ? " para esta busca." : "."
  }`;

  const listPanel = (
    <CronogramaPanel
      search={
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <CronogramaSearch
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Buscar nº pedido, cliente ou produto…"
              className="flex-1"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={
                  selectedIds.length < 2 ||
                  groupHint != null ||
                  groupMutation.isPending
                }
                title={
                  groupHint ??
                  "Emitir uma NF-e só, com o número de cada pedido na nota"
                }
                onClick={() => groupMutation.mutate(selectedIds)}
              >
                {groupMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Layers className="h-4 w-4" />
                )}
                Agrupar numa nota
                {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
              </Button>
              {sharedGroupId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={ungroupMutation.isPending}
                  onClick={() => ungroupMutation.mutate(sharedGroupId)}
                >
                  {ungroupMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Ungroup className="h-4 w-4" />
                  )}
                  Desagrupar
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {groupHint ??
              (selectedIds.length >= 2
                ? "Pagamento e frete da nota seguem o pedido principal; cada PV sai nas informações complementares e no nome dos itens."
                : "Seleccione pedidos do mesmo cliente para emitir uma nota só.")}
          </p>
        </div>
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
          cn(
            selectedIds.includes(row.id) && "bg-sky-50/80",
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
          )
        }
        actionsColumn={{
          label: "Acções",
          width: "w-[10rem]",
          render: (row) => (
            <div className="flex flex-wrap items-center gap-1">
              {row.nfe_group_id &&
              !row.billing_closure &&
              row.nfe_status !== "authorized" &&
              row.nfe_status !== "processing" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  title="Desagrupar pedidos desta nota"
                  disabled={ungroupMutation.isPending}
                  onClick={() => ungroupMutation.mutate(row.nfe_group_id!)}
                >
                  <Ungroup className="h-3.5 w-3.5" />
                </Button>
              ) : null}
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
              {row.can_emit && row.billing_plan !== "without_invoice" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  className="h-7 px-2 text-[11px]"
                  title={
                    row.emit_blockers.length
                      ? row.emit_blockers.join(" ")
                      : "Emitir nota"
                  }
                  disabled={emittingOrderId === row.id}
                  onClick={() =>
                    void emitNfe(
                      row.id,
                      [
                        ...(row.nfe_group_orders.length > 1
                          ? [
                              `Uma nota só para: ${row.nfe_group_orders.map((o) => o.order_number).join(", ")}.`,
                            ]
                          : []),
                        ...(row.emit_warnings ?? []),
                      ]
                    )
                  }
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
              (row.nfe_status === "pending" ||
                row.nfe_status === "processing" ||
                row.nfe_status === "rejected" ||
                row.nfe_status === "error") ? (
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
        description="Conferência fiscal dos pedidos de venda."
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
        description="Lista por fase — conferência fiscal (frete, pagamento e dados da nota), liberação PCP e emissão."
      width="wide"
      density="comfortable"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={reopenConferenceMutation.isPending}
              onClick={() => {
                const ok = window.confirm(
                  "Voltar todos os pedidos sem nota autorizada para «Fiscal a conferir»? A conferência de frete e pagamento fica de novo obrigatória."
                );
                if (!ok) return;
                reopenConferenceMutation.mutate();
              }}
            >
              {reopenConferenceMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Voltar para conferência
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push("/faturamento/entrada")}
          >
            Fiscal de entrada
          </Button>
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
      <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {FISCAL_INVOICING_LIST_TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
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
