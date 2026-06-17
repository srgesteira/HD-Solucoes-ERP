"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  FileText,
  History,
  Loader2,
  Pencil,
  Receipt,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/shared/ui/app-page";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { BrDateInput } from "@/shared/ui/br-date-input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import {
  isFiscalReadyForInvoice,
  type FiscalStatus,
} from "@/modules/fiscal/lib/fiscal-rules-types";
import { CompanyDocumentBranding } from "@/components/company/company-document-branding";
import type { Tables } from "@/modules/core/types/database";
import type { ReceivableStatus } from "@/modules/core/types/finance.types";
import type { SalesOrderStatus } from "@/modules/core/types/sales.types";
import { defaultExpectedDeliveryForOrder } from "@/modules/vendas/lib/sales/sales-flow";
import { fmtBRL } from "@/shared/utils/format-brl";
import { formatShortDate } from "@/shared/utils/date";
import { SalesOrderChangeHistory } from "@/components/sales/sales-order-change-history";
import { SalesReturnCreateModal } from "@/components/sales/sales-return-create-modal";

/** Progressão permitida pelo UI (exclude cancelled via acção separada). */
const SALES_FLOW: SalesOrderStatus[] = [
  "pending",
  "confirmed",
  "in_production",
  "shipped",
  "delivered",
];

type ProductNested = { name?: string | null } | null;

type SaleItemLine = {
  id: string;
  description: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  total_price?: number | null;
  product?: unknown;
};

type QuoteBrief =
  | { id: string; quote_number?: string | null }
  | null;

type SalesOrderDetail = {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  order_date: string;
  expected_delivery: string | null;
  actual_delivery: string | null;
  client_name: string;
  client_document: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  payment_installments: number;
  payment_days_to_first_due: number;
  payment_days_between_installments: number;
  subtotal: number;
  discount: number;
  tax: number;
  total_icms?: number;
  total_ipi?: number;
  total_tax_base?: number;
  total: number;
  notes: string | null;
  quote_id: string | null;
  quote?: unknown;
  ready_for_invoice?: boolean | null;
  fiscal_status?: string | null;
  items?: SaleItemLine[] | null;
  nfes?: unknown;
};

type ReceivableRow = {
  id: string;
  description: string | null;
  document_number: string | null;
  due_date: string;
  issue_date: string;
  original_amount: number;
  current_amount: number;
  paid_amount: number;
  status: string;
  payment_date: string | null;
};

function unwrapProduct(raw: SaleItemLine["product"]): string {
  if (raw == null) return "—";
  const o = Array.isArray(raw) ? raw[0] : raw;
  if (!o || typeof o !== "object") return "—";
  const n = (o as { name?: unknown }).name;
  return typeof n === "string" && n.trim() ? n : "—";
}

function unwrapQuote(raw: unknown): QuoteBrief {
  if (!raw || typeof raw !== "object") return null;
  const o = Array.isArray(raw) ? raw[0] : raw;
  if (!o || typeof o !== "object") return null;
  const rec = o as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id : "";
  const quote_number =
    typeof rec.quote_number === "string" ? rec.quote_number : null;
  if (!id) return null;
  return { id, quote_number };
}

type NfeLineBrief = {
  id: string;
  status: string;
  nfe_number: string | null;
  nfe_key: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  error_message: string | null;
};

function unwrapNfes(raw: unknown): NfeLineBrief[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [];
  const out: NfeLineBrief[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    if (!id) continue;
    out.push({
      id,
      status: typeof r.status === "string" ? r.status : "",
      nfe_number:
        typeof r.nfe_number === "string" ? r.nfe_number : null,
      nfe_key: typeof r.nfe_key === "string" ? r.nfe_key : null,
      xml_url: typeof r.xml_url === "string" ? r.xml_url : null,
      pdf_url: typeof r.pdf_url === "string" ? r.pdf_url : null,
      error_message:
        typeof r.error_message === "string" ? r.error_message : null,
    });
  }
  return out;
}

function fmtDay(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

function salesOrderStatusPill(
  status: string
): { label: string; className: string } {
  switch (status as SalesOrderStatus) {
    case "pending":
      return {
        label: "Pendente",
        className:
          "bg-amber-50 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-700/50",
      };
    case "confirmed":
      return {
        label: "Confirmado",
        className:
          "bg-blue-50 text-blue-950 ring-1 ring-blue-200 dark:bg-blue-950/45 dark:text-blue-100",
      };
    case "in_production":
      return {
        label: "Em produção",
        className:
          "bg-violet-50 text-violet-950 ring-1 ring-violet-200 dark:bg-violet-950/45 dark:text-violet-100",
      };
    case "shipped":
      return {
        label: "Expedido",
        className:
          "bg-orange-50 text-orange-950 ring-1 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-100",
      };
    case "delivered":
      return {
        label: "Entregue",
        className:
          "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-100",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        className:
          "bg-red-50 text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100",
      };
    case "superseded":
      return {
        label: "Substituído",
        className:
          "bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-200",
      };
    default:
      return {
        label: status,
        className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
      };
  }
}

function receivableStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Pendente",
    partial: "Parcial",
    paid: "Pago",
    overdue: "Em atraso",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}

function receivableStatusPill(status: string): string {
  switch (status as ReceivableStatus) {
    case "pending":
      return "bg-amber-50 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100";
    case "partial":
      return "bg-sky-50 text-sky-950 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100";
    case "paid":
      return "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200 dark:bg-emerald-950/35";
    case "overdue":
      return "bg-orange-50 text-orange-950 ring-orange-200 dark:bg-orange-950/35 dark:text-orange-100";
    case "cancelled":
      return "bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

async function fetchOrder(id: string): Promise<SalesOrderDetail> {
  const res = await fetch(`/api/sales/orders/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar pedido");
  if (!json.data || typeof json.data !== "object")
    throw new Error("Resposta inválida");
  return json.data as SalesOrderDetail;
}

interface ReceivablesApiResponse {
  data: ReceivableRow[];
  pagination: { page: number; limit: number; total: number };
}

async function fetchReceivablesForOrder(
  salesOrderId: string
): Promise<ReceivableRow[]> {
  const params = new URLSearchParams();
  params.append("sales_order_id", salesOrderId);
  params.append("page", "1");
  params.append("limit", "100");

  const res = await fetch(`/api/finance/receivables?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ReceivablesApiResponse & {
    error?: string;
  };
  if (!res.ok)
    throw new Error(json.error ?? "Erro ao carregar contas a receber");
  if (!Array.isArray(json.data)) throw new Error("Resposta inválida");
  return json.data;
}

async function postEmitNfseApi(
  salesOrderId: string
): Promise<{ nfe_id: string }> {
  const res = await fetch("/api/nfe/emitir", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sales_order_id: salesOrderId }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    nfe_id?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao emitir NFS-e"
    );
  }
  if (!json.nfe_id) throw new Error("Resposta inválida da API.");
  return { nfe_id: json.nfe_id };
}

async function getConsultNfeApi(
  nfeId: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `/api/nfe/consultar?nfe_id=${encodeURIComponent(nfeId)}`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    data?: Record<string, unknown> | null;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao consultar NFS-e"
    );
  }
  return json.data ?? null;
}

type CompanyBrandingRow = Tables<"company_settings"> & {
  focusnfe_configured?: boolean;
};

async function fetchCompanyBranding(): Promise<CompanyBrandingRow | null> {
  const res = await fetch("/api/company/settings", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: CompanyBrandingRow | null;
  };
  if (!res.ok) return null;
  return json.data ?? null;
}

async function putOrder(
  id: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`/api/sales/orders/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar pedido");
}

async function reactivateSalesOrder(id: string): Promise<void> {
  const res = await fetch(`/api/sales/orders/${id}/reactivate`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao reativar pedido");
}

async function putReceivablePayment(
  id: string,
  body: {
    received_amount: number;
    payment_date?: string;
    interest_adjustment?: number;
    discount_adjustment?: number;
  }
): Promise<void> {
  const res = await fetch(`/api/finance/receivables/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok)
    throw new Error(json.error ?? "Erro ao registar recebimento");
}

function installmentLabel(
  rows: ReceivableRow[],
  row: ReceivableRow,
  index: number
): string {
  if (row.description?.trim()) return row.description;
  const dn = row.document_number;
  if (dn && dn.includes("-")) return `Parcela ${dn}`;
  return `Parcela ${index + 1}/${rows.length}`;
}

function nfeStatusLabelPt(s: string): string {
  const map: Record<string, string> = {
    pending: "Pendente",
    processing: "Em processamento",
    authorized: "Autorizada",
    rejected: "Rejeitada",
    cancelled: "Cancelada",
    error: "Erro",
  };
  return map[s] ?? s;
}

/** Próximo passo possível (uma transição de cada vez). */
function nextStatusOptions(current: SalesOrderStatus): SalesOrderStatus[] {
  const i = SALES_FLOW.indexOf(current);
  if (i < 0) return [current];
  if (i >= SALES_FLOW.length - 1) return [current];
  return [current, SALES_FLOW[i + 1] as SalesOrderStatus];
}

export default function SalesOrderDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canSales = isAdmin || can("sales");

  const orderQuery = useQuery({
    queryKey: ["sales-order", id],
    queryFn: () => fetchOrder(id),
    enabled: Boolean(id),
  });

  const companyBrandingQuery = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanyBranding,
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const receivablesQuery = useQuery({
    queryKey: ["receivables", "sales-order", id],
    queryFn: () => fetchReceivablesForOrder(id),
    enabled: Boolean(id),
  });

  const [expectedDeliveryDraft, setExpectedDeliveryDraft] = useState("");
  const [paymentInstallmentsDraft, setPaymentInstallmentsDraft] = useState("1");
  const [paymentDaysFirstDraft, setPaymentDaysFirstDraft] = useState("30");
  const [paymentDaysBetweenDraft, setPaymentDaysBetweenDraft] = useState("30");

  useEffect(() => {
    const row = orderQuery.data;
    if (!row) return;
    setExpectedDeliveryDraft(
      row.expected_delivery
        ? String(row.expected_delivery).slice(0, 10)
        : defaultExpectedDeliveryForOrder(row.order_date)
    );
    setPaymentInstallmentsDraft(String(row.payment_installments ?? 1));
    setPaymentDaysFirstDraft(String(row.payment_days_to_first_due ?? 30));
    setPaymentDaysBetweenDraft(
      String(row.payment_days_between_installments ?? 30)
    );
  }, [orderQuery.data]);

  const q = orderQuery.data;
  const quoteInfo = unwrapQuote(q?.quote);
  const quoteLinkId = quoteInfo?.id ?? q?.quote_id ?? null;
  const st = (q?.status ?? "pending") as SalesOrderStatus;
  const canNavigateToEdit =
    canSales && st !== "cancelled" && st !== "superseded";
  /** Edição comercial apenas na página /edit (uma tela unificada). */
  const canEditCommercialInline = false;
  const nfeList = useMemo(() => unwrapNfes(q?.nfes), [q?.nfes]);
  const hasBlockingNfe = useMemo(
    () =>
      nfeList.some((n) =>
        ["pending", "processing", "authorized"].includes(n.status)
      ),
    [nfeList]
  );
  const canEmitNfe =
    isAdmin &&
    st === "confirmed" &&
    q?.ready_for_invoice === true &&
    isFiscalReadyForInvoice(
      q?.ready_for_invoice === true,
      (q?.fiscal_status ?? "pending") as FiscalStatus
    ) &&
    !hasBlockingNfe &&
    Boolean(companyBrandingQuery.data?.focusnfe_configured);
  const canCancelAdmin =
    isAdmin && st !== "delivered" && st !== "cancelled";
  const canReactivateAdmin = isAdmin && st === "cancelled";
  const showStatusControl =
    isAdmin && SALES_FLOW.includes(st) && st !== "delivered";

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [salesReturnOpen, setSalesReturnOpen] = useState(false);

  const canCreateReturn =
    isAdmin && !["draft", "cancelled", "rejected"].includes(st);
  const salesReturnMutation = useMutation({
    mutationFn: async (payload: Parameters<
      Parameters<typeof SalesReturnCreateModal>[0]["onSubmit"]
    >[0]) => {
      const res = await fetch("/api/sales-returns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        sales_return?: { id: string };
        error?: string;
      };
      if (!res.ok)
        throw new Error(json.error ?? "Erro ao criar devolução");
      return json.sales_return!;
    },
    onSuccess: (ret) => {
      toast.success("Devolução criada.");
      setSalesReturnOpen(false);
      router.push(`/sales/returns/${ret.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [nfeOpen, setNfeOpen] = useState(false);
  const [nfeBusy, setNfeBusy] = useState(false);
  const [nfeSyncId, setNfeSyncId] = useState<string | null>(null);
  const [nfeProgress, setNfeProgress] = useState("");

  const statusOptions = useMemo(
    () =>
      q ? nextStatusOptions(q.status as SalesOrderStatus) : ([] as SalesOrderStatus[]),
    [q]
  );

  const [baumodal, setBaumodal] = useState<ReceivableRow | null>(null);
  const [recvAmount, setRecvAmount] = useState("");
  const [recvDate, setRecvDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [recvInterest, setRecvInterest] = useState("0");
  const [recvDiscount, setRecvDiscount] = useState("0");

  useEffect(() => {
    if (baumodal) {
      const cur = baumodal.current_amount;
      setRecvAmount(cur > 0 ? String(cur.toFixed(2)) : "");
      setRecvDate(new Date().toISOString().slice(0, 10));
      setRecvInterest("0");
      setRecvDiscount("0");
    }
  }, [baumodal]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["sales-order", id] });
    void queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    void queryClient.invalidateQueries({
      queryKey: ["receivables", "sales-order", id],
    });
    void queryClient.invalidateQueries({ queryKey: ["receivables"] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: SalesOrderStatus) =>
      putOrder(id, { status }),
    onSuccess: () => {
      toast.success("Estado do pedido actualizado.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => putOrder(id, { status: "cancelled" }),
    onSuccess: () => {
      toast.success("Pedido cancelado.");
      setCancelOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivateSalesOrder(id),
    onSuccess: () => {
      toast.success("Pedido reativado com sucesso.");
      setReactivateOpen(false);
      invalidate();
      router.push(`/sales/orders/${id}/edit`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paymentMutation = useMutation({
    mutationFn: (args: {
      receivableId: string;
      payload: {
        received_amount: number;
        payment_date?: string;
        interest_adjustment?: number;
        discount_adjustment?: number;
      };
    }) => putReceivablePayment(args.receivableId, args.payload),
    onSuccess: () => {
      toast.success("Recebimento registado.");
      setBaumodal(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runEmitNfseFlow = async () => {
    if (!id) return;
    setNfeBusy(true);
    setNfeProgress("A enviar à FocusNFe…");
    try {
      const { nfe_id } = await postEmitNfseApi(id);
      for (let i = 0; i < 24; i++) {
        setNfeProgress(`A consultar estado… (${i + 1}/24)`);
        const row = await getConsultNfeApi(nfe_id);
        void queryClient.invalidateQueries({ queryKey: ["sales-order", id] });
        const st = typeof row?.status === "string" ? row.status : "";
        if (
          st === "authorized" ||
          st === "error" ||
          st === "cancelled"
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      toast.success("Processamento da NFS-e concluído (ver estado abaixo).");
      setNfeOpen(false);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setNfeBusy(false);
      setNfeProgress("");
    }
  };

  const syncOneNfe = async (nfeId: string) => {
    setNfeSyncId(nfeId);
    try {
      await getConsultNfeApi(nfeId);
      toast.success("Estado da NFS-e actualizado.");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setNfeSyncId(null);
    }
  };

  const receivableSorted = useMemo(() => {
    const list = [...(receivablesQuery.data ?? [])];
    list.sort((a, b) => {
      const da = a.due_date.slice(0, 10);
      const db = b.due_date.slice(0, 10);
      return da.localeCompare(db);
    });
    return list;
  }, [receivablesQuery.data]);

  const headerPill = q ? salesOrderStatusPill(q.status) : null;

  return (
    <AppPage
      backHref="/sales/orders"
      title={q ? `Pedido ${q.order_number}` : "Pedido de venda"}
      density="comfortable"
      actions={
        <>
          {canNavigateToEdit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.push(`/sales/orders/${id}/edit`)}
            >
              <Pencil className="h-4 w-4" />
              Editar pedido
            </Button>
          ) : null}
          {canEmitNfe ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setNfeOpen(true)}
            >
              <Receipt className="h-4 w-4" />
              Emitir NFS-e
            </Button>
          ) : null}
          {canCancelAdmin ? (
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => setCancelOpen(true)}
            >
              <Ban className="h-4 w-4" />
              Cancelar
            </Button>
          ) : null}
          {canReactivateAdmin ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              onClick={() => setReactivateOpen(true)}
            >
              <RotateCcw className="h-4 w-4" />
              Reativar pedido
            </Button>
          ) : null}
          {canCreateReturn ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSalesReturnOpen(true)}
            >
              <RotateCcw className="h-4 w-4" />
              Iniciar devolução
            </Button>
          ) : null}
          {showStatusControl ? (
            <div className="flex flex-wrap items-center gap-2">
              <Label
                htmlFor="so-status-select"
                className="text-sm text-slate-600 whitespace-nowrap"
              >
                Atualizar estado
              </Label>
              <select
                id="so-status-select"
                aria-label="Atualizar estado do pedido"
                className={cn(
                  "h-8 rounded-md border border-slate-300 bg-white px-2 text-xs min-w-[10.5rem]",
                  "dark:bg-slate-950 dark:border-slate-600"
                )}
                value={st}
                disabled={
                  statusMutation.isPending || statusOptions.length <= 1
                }
                onChange={(e) => {
                  const next = e.target.value as SalesOrderStatus;
                  if (next === st) return;
                  statusMutation.mutate(next);
                }}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {salesOrderStatusPill(s).label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </>
      }
    >
      {isAdmin && st === "confirmed" && !companyBrandingQuery.data?.focusnfe_configured ? (
        <p className="w-full text-xs text-amber-800 dark:text-amber-200">
          Para emitir NF-e, configure o token FocusNFe em{" "}
          <Link href="/settings/company" className="underline font-medium">
            Empresa
          </Link>
          .
        </p>
      ) : null}
      {isAdmin && st === "confirmed" && hasBlockingNfe ? (
        <p className="w-full text-xs text-slate-600 dark:text-slate-400">
          Já existe NF-e em curso ou autorizada para este pedido. Sincronize na
          Focus antes de nova emissão.
        </p>
      ) : null}

      {orderQuery.isLoading ? (
        <div className="flex items-center gap-2 text-slate-600 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      ) : orderQuery.error ? (
        <p className="text-red-700 text-sm">
          {orderQuery.error instanceof Error
            ? orderQuery.error.message
            : "Erro"}
        </p>
      ) : q ? (
        <>
          <CompanyDocumentBranding
            settings={companyBrandingQuery.data ?? null}
            documentLabel="Pedido de venda"
          />
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <CardTitle className="text-xl sm:text-2xl">
                      Pedido {q.order_number}
                    </CardTitle>
                    {headerPill ? (
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2.5 py-0.5 text-xs font-medium",
                          headerPill.className
                        )}
                      >
                        {headerPill.label}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <span>
                      <span className="text-slate-500">Criação:</span>{" "}
                      <span className="tabular-nums font-medium text-slate-800 dark:text-slate-200">
                        {fmtDay(q.created_at)}
                      </span>
                    </span>
                    <span>
                      <span className="text-slate-500">Entrega real:</span>{" "}
                      <span className="tabular-nums font-medium text-slate-800 dark:text-slate-200">
                        {fmtDay(q.actual_delivery)}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-sm">
                  {quoteLinkId ? (
                    <Link
                      href={`/sales/quotes/${quoteLinkId}`}
                      className="inline-flex items-center gap-1.5 text-brand-700 hover:underline dark:text-brand-400"
                    >
                      <FileText className="h-4 w-4" />
                      Orçamento{" "}
                      {quoteInfo?.quote_number
                        ? quoteInfo.quote_number
                        : quoteLinkId.slice(0, 8)}
                    </Link>
                  ) : null}
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-slate-500">Nome</p>
                <p className="font-medium">{q.client_name}</p>
              </div>
              <div>
                <p className="text-slate-500">Documento</p>
                <p className="font-medium">{q.client_document ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">E-mail</p>
                <p className="font-medium">{q.client_email ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">Telefone</p>
                <p className="font-medium">{q.client_phone ?? "—"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-slate-500">Endereço</p>
                <p className="font-medium whitespace-pre-wrap">
                  {q.client_address?.trim() ? q.client_address : "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Condições comerciais</CardTitle>
              <p className="text-sm text-slate-500 font-normal">
                Visível ao cliente — prazo de entrega e pagamento. Para alterar
                itens, preços ou dados comerciais, use{" "}
                {canNavigateToEdit ? (
                  <button
                    type="button"
                    className="text-brand-700 font-medium underline"
                    onClick={() => router.push(`/sales/orders/${id}/edit`)}
                  >
                    Editar pedido
                  </button>
                ) : (
                  "a página de edição"
                )}
                .
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="so-expected-delivery">
                  Prazo de entrega <span className="text-red-600">*</span>
                </Label>
                {canEditCommercialInline ? (
                  <BrDateInput
                    id="so-expected-delivery"
                    className="max-w-xs"
                    value={expectedDeliveryDraft || null}
                    onChange={async (next) => {
                      if (!id || !q) return;
                      const cur = q.expected_delivery
                        ? String(q.expected_delivery).slice(0, 10)
                        : "";
                      setExpectedDeliveryDraft(next ?? "");
                      if ((next ?? "") === cur) return;
                      if (!next) {
                        toast.error("Prazo de entrega é obrigatório.");
                        setExpectedDeliveryDraft(cur);
                        return;
                      }
                      try {
                        await putOrder(id, {
                          expected_delivery: next,
                        });
                        await queryClient.invalidateQueries({
                          queryKey: ["sales-order", id],
                        });
                        toast.success("Prazo de entrega actualizado.");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Erro"
                        );
                        setExpectedDeliveryDraft(cur);
                      }
                    }}
                  />
                ) : (
                  <p className="font-medium tabular-nums">
                    {fmtDay(q.expected_delivery)}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="so-payment-installments">Parcelas</Label>
                {canEditCommercialInline ? (
                  <Input
                    id="so-payment-installments"
                    type="number"
                    min={1}
                    value={paymentInstallmentsDraft}
                    onChange={(e) =>
                      setPaymentInstallmentsDraft(e.target.value)
                    }
                    onBlur={async () => {
                      if (!id || !q) return;
                      const pi = parseInt(paymentInstallmentsDraft, 10);
                      const pd1 = parseInt(paymentDaysFirstDraft, 10);
                      const pdb = parseInt(paymentDaysBetweenDraft, 10);
                      if (
                        !Number.isFinite(pi) ||
                        pi < 1 ||
                        !Number.isFinite(pd1) ||
                        pd1 < 0 ||
                        !Number.isFinite(pdb) ||
                        pdb < 0
                      ) {
                        toast.error("Valores de pagamento inválidos.");
                        return;
                      }
                      if (
                        pi === q.payment_installments &&
                        pd1 === q.payment_days_to_first_due &&
                        pdb === q.payment_days_between_installments
                      ) {
                        return;
                      }
                      try {
                        await putOrder(id, {
                          payment_installments: pi,
                          payment_days_to_first_due: pd1,
                          payment_days_between_installments: pdb,
                        });
                        await queryClient.invalidateQueries({
                          queryKey: ["sales-order", id],
                        });
                        toast.success("Condições de pagamento actualizadas.");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Erro"
                        );
                      }
                    }}
                  />
                ) : (
                  <p className="font-medium tabular-nums">
                    {q.payment_installments}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="so-payment-days-first">
                  Dias até 1.ª parcela
                </Label>
                {canEditCommercialInline ? (
                  <Input
                    id="so-payment-days-first"
                    type="number"
                    min={0}
                    value={paymentDaysFirstDraft}
                    onChange={(e) => setPaymentDaysFirstDraft(e.target.value)}
                    onBlur={async () => {
                      const el = document.getElementById(
                        "so-payment-installments"
                      ) as HTMLInputElement | null;
                      el?.blur();
                    }}
                  />
                ) : (
                  <p className="font-medium tabular-nums">
                    {q.payment_days_to_first_due}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="so-payment-days-between">
                  Dias entre parcelas
                </Label>
                {canEditCommercialInline ? (
                  <Input
                    id="so-payment-days-between"
                    type="number"
                    min={0}
                    value={paymentDaysBetweenDraft}
                    onChange={(e) =>
                      setPaymentDaysBetweenDraft(e.target.value)
                    }
                    onBlur={async () => {
                      const el = document.getElementById(
                        "so-payment-installments"
                      ) as HTMLInputElement | null;
                      el?.blur();
                    }}
                  />
                ) : (
                  <p className="font-medium tabular-nums">
                    {q.payment_days_between_installments}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Itens</CardTitle>
            </CardHeader>
            <CardContent className="rounded-lg border border-slate-200 overflow-x-auto dark:border-slate-800">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                    <th className="px-3 py-2 text-left font-medium">Produto</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Descrição
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Qtd</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Unitário
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(q.items) && q.items.length > 0 ? (
                    q.items.map((line) => (
                      <tr
                        key={line.id}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-3 py-2 font-medium">
                          {unwrapProduct(line.product)}
                        </td>
                        <td className="px-3 py-2">
                          {line.description ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(line.quantity)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtBRL(Number(line.unit_price))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {fmtBRL(
                            Number(
                              line.total_price ??
                                line.quantity * line.unit_price
                            )
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-slate-500"
                      >
                        Sem itens neste pedido.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5" />
                Histórico de alterações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SalesOrderChangeHistory orderId={id} />
            </CardContent>
          </Card>

          {nfeList.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Notas fiscais
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="rounded-lg border border-slate-200 overflow-x-auto dark:border-slate-800">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                        <th className="px-3 py-2 text-left font-medium">
                          N.º / ref.
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Estado
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Chave
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Documentos
                        </th>
                        <th className="px-3 py-2 text-right font-medium w-[5.5rem]">
                          Acções
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {nfeList.map((n) => (
                        <tr
                          key={n.id}
                          className="border-b border-slate-100 dark:border-slate-800"
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {n.nfe_number ?? n.id.slice(0, 8)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                              {nfeStatusLabelPt(n.status)}
                            </span>
                            {n.error_message ? (
                              <span className="block text-xs text-red-600 mt-1 line-clamp-2">
                                {n.error_message}
                              </span>
                            ) : null}
                          </td>
                          <td
                            className="px-3 py-2 font-mono text-xs max-w-[12rem] truncate"
                            title={n.nfe_key ?? undefined}
                          >
                            {n.nfe_key ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-xs space-y-1">
                            {n.pdf_url ? (
                              <a
                                href={n.pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-brand-700 underline dark:text-brand-400"
                              >
                                PDF
                              </a>
                            ) : null}
                            {n.xml_url ? (
                              <a
                                href={n.xml_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-brand-700 underline dark:text-brand-400"
                              >
                                XML
                              </a>
                            ) : null}
                            {!n.pdf_url && !n.xml_url ? "—" : null}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isAdmin ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={nfeSyncId === n.id}
                                onClick={() => void syncOneNfe(n.id)}
                              >
                                {nfeSyncId === n.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                Sync
                              </Button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Totais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="tabular-nums font-medium">
                    {fmtBRL(q.subtotal)}
                  </span>
                </div>
                {q.discount > 0 ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Desconto</span>
                    <span className="tabular-nums font-medium text-red-700 dark:text-red-400">
                      − {fmtBRL(q.discount)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Total ICMS</span>
                  <span className="tabular-nums font-medium">
                    {fmtBRL(Number(q.total_icms ?? 0))}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Total IPI</span>
                  <span className="tabular-nums font-medium">
                    {fmtBRL(Number(q.total_ipi ?? 0))}
                  </span>
                </div>
                {q.tax > 0 ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Outros impostos</span>
                    <span className="tabular-nums font-medium">
                      {fmtBRL(q.tax)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 dark:border-slate-700">
                  <span className="font-semibold">Total final</span>
                  <span className="tabular-nums font-semibold">
                    {fmtBRL(q.total)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {q.notes?.trim() ? q.notes : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Contas a receber</CardTitle>
              {receivablesQuery.isError ? (
                <p className="text-sm text-red-600 mt-1">
                  {receivablesQuery.error instanceof Error
                    ? receivablesQuery.error.message
                    : "Erro ao carregar parcelas"}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="rounded-lg border border-slate-200 overflow-x-auto dark:border-slate-800">
              {receivablesQuery.isLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center text-slate-500 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A carregar parcelas…
                </div>
              ) : receivableSorted.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  Nenhuma parcela para este pedido.
                </p>
              ) : (
                <table className="w-full text-sm min-w-[860px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                      <th className="px-3 py-2 text-left font-medium">
                        Parcela
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Vencimento
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Valor
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Estado
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Data pagamento
                      </th>
                      <th className="px-3 py-2 text-right font-medium w-[7rem]">
                        Acções
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivableSorted.map((row, idx) => {
                      const canBaixa =
                        isAdmin &&
                        (row.status === "pending" || row.status === "partial");
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-slate-100 dark:border-slate-800"
                        >
                          <td className="px-3 py-2 max-w-[14rem]">
                            <span className="line-clamp-2">
                              {installmentLabel(
                                receivableSorted,
                                row,
                                idx
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                            {fmtDay(row.due_date)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className="font-medium">
                              {fmtBRL(row.original_amount)}
                            </span>
                            {row.status !== "paid" &&
                            row.current_amount !== row.original_amount ? (
                              <span className="block text-xs text-slate-500">
                                Saldo: {fmtBRL(row.current_amount)}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                                receivableStatusPill(row.status)
                              )}
                            >
                              {receivableStatusLabel(row.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                            {fmtDay(row.payment_date)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {canBaixa ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setBaumodal(row)}
                              >
                                Dar baixa
                              </Button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {nfeOpen && isAdmin ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nfe-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !nfeBusy) setNfeOpen(false);
          }}
        >
          <div
            className="relative z-10 w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="nfe-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Emitir NFS-e (FocusNFe)
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Será montado automaticamente um pedido de NFS-e a partir do
              pedido de venda (prestador = dados da empresa, tomador = cliente,
              serviço = total do pedido). O município pode exigir campos
              adicionais — consulte a{" "}
              <a
                href="https://doc.focusnfe.com.br/reference/emitir_nfse"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 underline dark:text-brand-400"
              >
                documentação FocusNFe
              </a>
              .
            </p>
            {nfeProgress ? (
              <p className="mt-4 text-sm text-slate-600 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                {nfeProgress}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={nfeBusy}
                onClick={() => setNfeOpen(false)}
              >
                Fechar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={nfeBusy}
                onClick={() => void runEmitNfseFlow()}
              >
                {nfeBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A processar…
                  </>
                ) : (
                  "Emitir e acompanhar"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelOpen && isAdmin ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="so-detail-cancel-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !cancelMutation.isPending)
              setCancelOpen(false);
          }}
        >
          <div
            className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="so-detail-cancel-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Cancelar pedido
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              O pedido passará ao estado <strong>cancelado</strong>. Confirma?
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={cancelMutation.isPending}
                onClick={() => setCancelOpen(false)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A processar…
                  </>
                ) : (
                  "Confirmar"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {reactivateOpen && isAdmin ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="so-detail-reactivate-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !reactivateMutation.isPending)
              setReactivateOpen(false);
          }}
        >
          <div
            className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="so-detail-reactivate-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Reativar pedido
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Tem certeza que deseja reativar este pedido cancelado? Ele voltará
              ao estado <strong>pendente</strong> e poderá ser editado antes de
              nova confirmação.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reactivateMutation.isPending}
                onClick={() => setReactivateOpen(false)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={reactivateMutation.isPending}
                onClick={() => reactivateMutation.mutate()}
              >
                {reactivateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A reativar…
                  </>
                ) : (
                  "Reativar pedido"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {baumodal && isAdmin ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recv-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !paymentMutation.isPending)
              setBaumodal(null);
          }}
        >
          <div
            className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="recv-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Registar recebimento
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Saldo actual: {fmtBRL(baumodal.current_amount)} (máx. a receber
              nesta operação: não superior ao saldo)
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="recv-amt">Valor recebido *</Label>
                <Input
                  id="recv-amt"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="mt-1"
                  value={recvAmount}
                  onChange={(e) => setRecvAmount(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="recv-dt">Data do pagamento</Label>
                <BrDateInput
                  id="recv-dt"
                  className="mt-1"
                  value={recvDate || null}
                  onChange={(iso) => setRecvDate(iso ?? "")}
                />
              </div>
              <div>
                <Label htmlFor="recv-int">Juros (acréscimo)</Label>
                <Input
                  id="recv-int"
                  type="number"
                  step="0.01"
                  min="0"
                  className="mt-1"
                  value={recvInterest}
                  onChange={(e) => setRecvInterest(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="recv-disc">Desconto concedido</Label>
                <Input
                  id="recv-disc"
                  type="number"
                  step="0.01"
                  min="0"
                  className="mt-1"
                  value={recvDiscount}
                  onChange={(e) => setRecvDiscount(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={paymentMutation.isPending}
                onClick={() => setBaumodal(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={paymentMutation.isPending}
                onClick={() => {
                  const amt = parseFloat(recvAmount.replace(",", "."));
                  if (!Number.isFinite(amt) || amt <= 0) {
                    toast.error("Indique um valor recebido válido.");
                    return;
                  }
                  if (amt - baumodal.current_amount > 0.01) {
                    toast.error(
                      "O valor não pode ser superior ao saldo actual."
                    );
                    return;
                  }
                  const interest = parseFloat(
                    recvInterest.replace(",", ".") || "0"
                  );
                  const discount = parseFloat(
                    recvDiscount.replace(",", ".") || "0"
                  );
                  if (!Number.isFinite(interest) || interest < 0) {
                    toast.error("Juros inválidos.");
                    return;
                  }
                  if (!Number.isFinite(discount) || discount < 0) {
                    toast.error("Desconto inválido.");
                    return;
                  }
                  paymentMutation.mutate({
                    receivableId: baumodal.id,
                    payload: {
                      received_amount: amt,
                      payment_date: recvDate || undefined,
                      interest_adjustment:
                        interest > 0 ? interest : undefined,
                      discount_adjustment:
                        discount > 0 ? discount : undefined,
                    },
                  });
                }}
              >
                {paymentMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A guardar…
                  </>
                ) : (
                  "Confirmar"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {salesReturnOpen && q ? (
        <SalesReturnCreateModal
          open={salesReturnOpen}
          salesOrderId={q.id}
          orderNumber={q.order_number}
          lines={(q.items ?? []).map((it) => ({
            sales_order_item_id: it.id,
            description: it.description,
            product_id:
              typeof (
                Array.isArray(it.product) ? it.product[0] : it.product
              ) === "object" &&
              (Array.isArray(it.product) ? it.product[0] : it.product) !== null
                ? ((Array.isArray(it.product) ? it.product[0] : it.product) as {
                    id?: string;
                  }).id ?? null
                : null,
            quantity: Number(it.quantity),
            unit_price: Number(it.unit_price),
          }))}
          busy={salesReturnMutation.isPending}
          onClose={() => setSalesReturnOpen(false)}
          onSubmit={(p) => salesReturnMutation.mutate(p)}
        />
      ) : null}
    </AppPage>
  );
}
