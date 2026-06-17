"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileOutput, Loader2, Mail, Search, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import type { PurchaseRequisitionRow } from "@/modules/compras/lib/purchasing-requisitions";
import { SupplierSelectField } from "@/components/purchasing/supplier-select-field";
import type { SupplierOption } from "@/components/purchasing/supplier-quick-create-modal";
import {
  SUPPLIERS_ACTIVE_QUERY_KEY,
  SUPPLIERS_QUERY_KEY,
} from "@/modules/compras/lib/suppliers/query-keys";
import { formatShortDate } from "@/shared/utils/date";

export const requisitionsQueryKey = ["purchasing-requisitions"] as const;
export const requisitionsCountQueryKey = ["purchasing-requisitions-count"] as const;

async function fetchRequisitions(): Promise<{
  rows: PurchaseRequisitionRow[];
  pending: number;
}> {
  const res = await fetch("/api/purchasing/requisitions", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    rows?: PurchaseRequisitionRow[];
    pending?: number;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar requisições");
  return { rows: json.rows ?? [], pending: json.pending ?? 0 };
}

export async function fetchRequisitionsCount(): Promise<number> {
  const res = await fetch("/api/purchasing/requisitions/count", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    count?: number;
    pending?: number;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao contar requisições");
  return json.count ?? json.pending ?? 0;
}

async function fetchSuppliers(): Promise<SupplierOption[]> {
  const res = await fetch(
    "/api/purchasing/suppliers?is_active=true&limit=100",
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: Array<{
      id: string;
      code: string;
      name: string;
      document?: string | null;
      email?: string | null;
      phone?: string | null;
    }>;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar fornecedores");
  return (json.data ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    document: s.document ?? null,
    email: s.email ?? null,
    phone: s.phone ?? null,
  }));
}

function formatDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? String(iso) : formatted;
}

export function PurchaseRequisitionsPanel() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState(
    "Solicito cotação dos itens abaixo, com prazo de entrega e condições de pagamento."
  );
  const [quoteEmails, setQuoteEmails] = useState("");
  const [bulkSupplierId, setBulkSupplierId] = useState("");
  const [quoteQty, setQuoteQty] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: requisitionsQueryKey,
    queryFn: fetchRequisitions,
  });

  const suppliersQ = useQuery({
    queryKey: SUPPLIERS_ACTIVE_QUERY_KEY,
    queryFn: fetchSuppliers,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: requisitionsQueryKey });
    void qc.invalidateQueries({ queryKey: requisitionsCountQueryKey });
    void qc.invalidateQueries({ queryKey: ["purchasing-orders"] });
    void qc.invalidateQueries({ queryKey: SUPPLIERS_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: SUPPLIERS_ACTIVE_QUERY_KEY });
  };

  const followUpMut = useMutation({
    mutationFn: async (args: { id: string; follow_up_date: string | null }) => {
      const res = await fetch("/api/purchasing/requisitions", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao guardar follow-up");
    },
    onSuccess: invalidate,
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const issueMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/purchasing/requisitions/${id}/issue`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        purchase_order_id?: string;
        po_number?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao emitir PC");
      return json;
    },
    onSuccess: (data) => {
      toast.success(
        data.po_number
          ? `PC ${data.po_number} criado em rascunho.`
          : "Pedido de compra criado."
      );
      invalidate();
      setSelected(new Set());
      if (data.purchase_order_id) {
        router.push(`/purchasing/orders/${data.purchase_order_id}`);
      }
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao emitir PC"),
    onSettled: () => setIssuingId(null),
  });

  const issueBulkMut = useMutation({
    mutationFn: async (args: { ids: string[]; supplier_id?: string }) => {
      const res = await fetch("/api/purchasing/requisitions/issue-bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisition_ids: args.ids,
          supplier_id: args.supplier_id || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { purchase_order_id: string; po_number: string; linked_count: number };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao emitir PC agrupado");
      return json.data!;
    },
    onSuccess: (data) => {
      toast.success(
        `PC ${data.po_number} criado com ${data.linked_count} item(ns).`
      );
      setBulkOpen(false);
      setSelected(new Set());
      invalidate();
      router.push(`/purchasing/orders/${data.purchase_order_id}`);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao emitir PC"),
  });

  const quoteMut = useMutation({
    mutationFn: async (args: {
      ids: string[];
      emails: string[];
      message: string;
      quantities: Record<string, number>;
    }) => {
      const res = await fetch("/api/purchasing/requisitions/send-quotation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisition_ids: args.ids,
          supplier_emails: args.emails,
          message: args.message,
          quantities: args.quantities,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { email_sent: boolean; warning?: string | null };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao solicitar orçamento");
      return json.data;
    },
    onSuccess: (data) => {
      if (data?.warning) toast.warning(data.warning);
      else if (data?.email_sent) toast.success("Orçamento enviado por e-mail.");
      else toast.success("Orçamento registado (e-mail não enviado).");
      setQuoteOpen(false);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao enviar orçamento"),
  });

  const filtered = (q.data?.rows ?? []).filter((row) => {
    const t = search.trim().toLowerCase();
    if (!t) return true;
    return (
      row.description.toLowerCase().includes(t) ||
      (row.product_code ?? "").toLowerCase().includes(t) ||
      (row.preferred_supplier_name ?? "").toLowerCase().includes(t) ||
      (row.trace_key ?? "").toLowerCase().includes(t) ||
      (row.production_order_number ?? "").toLowerCase().includes(t)
    );
  });

  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.id)),
    [filtered, selected]
  );

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openQuoteModal = () => {
    const qty: Record<string, string> = {};
    for (const r of selectedRows) {
      qty[r.id] = String(r.quantity);
    }
    setQuoteQty(qty);
    const emails = new Set<string>();
    for (const r of selectedRows) {
      const sup = suppliersQ.data?.find((s) => s.id === r.preferred_supplier_id);
      if (sup?.email) emails.add(sup.email);
    }
    setQuoteEmails([...emails].join(", "));
    setQuoteOpen(true);
  };

  const openBulkModal = () => {
    const prefIds = [
      ...new Set(
        selectedRows.map((r) => r.preferred_supplier_id).filter(Boolean)
      ),
    ] as string[];
    setBulkSupplierId(prefIds.length === 1 ? prefIds[0]! : "");
    setBulkOpen(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">
          Requisições de compras (MRP)
        </CardTitle>
        <p className="text-sm text-slate-500 font-normal">
          Materiais e MO externa gerados pelo MRP. Agrupe por fornecedor, solicite
          orçamento ou emita o pedido de compra.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden
            />
            <Input
              placeholder="Buscar OP, produto, fornecedor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {selected.size > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={openQuoteModal}>
                <Mail className="h-4 w-4" />
                Solicitar orçamento ({selected.size})
              </Button>
              <Button type="button" size="sm" onClick={openBulkModal}>
                <Package className="h-4 w-4" />
                Emitir PC agrupado ({selected.size})
              </Button>
            </div>
          ) : null}
        </div>

        {q.isLoading ? (
          <p className="py-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar…
          </p>
        ) : q.isError ? (
          <p className="py-8 text-center text-sm text-red-600">
            {q.error instanceof Error ? q.error.message : "Erro"}
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            Nenhuma requisição pendente. Execute o MRP nos pedidos confirmados.
          </p>
        ) : (
          <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white">
            <table className="w-full text-sm text-left min-w-[1000px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-2 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={
                        filtered.length > 0 && selected.size === filtered.length
                      }
                      onChange={toggleAll}
                      aria-label="Seleccionar todas"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Ordem de produção
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">Produto</th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Quantidade
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Fornecedor sugerido
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Data prevista
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Follow-up
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right w-[8rem]">
                    Acções
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const busy = issuingId === row.id && issueMut.isPending;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-2 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleOne(row.id)}
                          aria-label={`Seleccionar ${row.product_code ?? row.description}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {row.production_order_id ? (
                          <Link
                            href={`/production/orders/${row.production_order_id}`}
                            className="text-brand-700 hover:underline font-mono text-xs font-semibold"
                          >
                            {row.production_order_number ?? "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {row.quotation_sent_at ? (
                          <span className="block text-[10px] text-emerald-700 mt-0.5">
                            Orçamento enviado
                          </span>
                        ) : null}
                        {row.is_external_labor ? (
                          <span className="block text-[10px] text-violet-700 mt-0.5">
                            MO externa
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 max-w-[14rem]">
                        {row.product_code ? (
                          <span className="block text-xs font-mono text-slate-500">
                            {row.product_code}
                          </span>
                        ) : null}
                        <span className="line-clamp-2">
                          {row.product_name ?? row.description}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                        {row.quantity} {row.unit}
                      </td>
                      <td className="px-3 py-2.5 max-w-[12rem]">
                        <span className="line-clamp-2">
                          {row.preferred_supplier_name ?? "—"}
                        </span>
                        {!row.preferred_supplier_name ? (
                          <span className="block text-[10px] text-slate-500 mt-0.5">
                            Defina fornecedor preferencial no produto
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700">
                        {formatDate(row.expected_date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="date"
                          className="h-8 rounded-md border border-slate-300 px-2 text-xs"
                          defaultValue={row.follow_up_date ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value || null;
                            if (v !== (row.follow_up_date ?? "")) {
                              followUpMut.mutate({
                                id: row.id,
                                follow_up_date: v,
                              });
                            }
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setIssuingId(row.id);
                            issueMut.mutate(row.id);
                          }}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileOutput className="h-4 w-4" />
                          )}
                          Emitir PC
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {quoteOpen ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-slate-900">
                Solicitar orçamento
              </h3>
              <p className="text-sm text-slate-600">
                {selectedRows.length} item(ns) seleccionado(s). Ajuste quantidades se
                necessário.
              </p>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">E-mails (separados por vírgula)</span>
                <textarea
                  className="mt-1 w-full min-h-[60px] rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={quoteEmails}
                  onChange={(e) => setQuoteEmails(e.target.value)}
                  placeholder="fornecedor@empresa.com"
                />
              </label>
              {suppliersQ.data?.length ? (
                <div className="flex flex-wrap gap-1">
                  {suppliersQ.data
                    .filter((s) => s.email)
                    .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="text-xs rounded-full border border-slate-200 px-2 py-0.5 hover:bg-slate-50"
                        onClick={() => {
                          const parts = quoteEmails
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean);
                          if (s.email && !parts.includes(s.email)) {
                            setQuoteEmails(
                              [...parts, s.email].join(", ")
                            );
                          }
                        }}
                      >
                        + {s.name}
                      </button>
                    ))}
                </div>
              ) : null}
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Mensagem</span>
                <textarea
                  className="mt-1 w-full min-h-[80px] rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={quoteMessage}
                  onChange={(e) => setQuoteMessage(e.target.value)}
                />
              </label>
              <ul className="space-y-2 text-sm border border-slate-100 rounded-md p-2 max-h-40 overflow-y-auto">
                {selectedRows.map((r) => (
                  <li key={r.id} className="flex gap-2 items-center">
                    <span className="flex-1 truncate font-mono text-xs text-slate-600">
                      {r.product_code}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="w-24 h-8 rounded border border-slate-300 px-2 text-right text-xs"
                      value={quoteQty[r.id] ?? String(r.quantity)}
                      onChange={(e) =>
                        setQuoteQty((q) => ({ ...q, [r.id]: e.target.value }))
                      }
                    />
                    <span className="text-xs text-slate-500">{r.unit}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setQuoteOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={quoteMut.isPending}
                  onClick={() => {
                    const quantities: Record<string, number> = {};
                    for (const r of selectedRows) {
                      const n = Number(quoteQty[r.id] ?? r.quantity);
                      if (Number.isFinite(n) && n > 0) quantities[r.id] = n;
                    }
                    quoteMut.mutate({
                      ids: selectedRows.map((r) => r.id),
                      emails: quoteEmails
                        .split(",")
                        .map((e) => e.trim())
                        .filter(Boolean),
                      message: quoteMessage,
                      quantities,
                    });
                  }}
                >
                  {quoteMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Enviar
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {bulkOpen ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Emitir PC agrupado
              </h3>
              <p className="text-sm text-slate-600">
                Será criado um único pedido de compra com {selectedRows.length}{" "}
                item(ns).
              </p>
              <SupplierSelectField
                id="bulk-supplier"
                label="Fornecedor"
                value={bulkSupplierId}
                onChange={setBulkSupplierId}
                suppliers={suppliersQ.data ?? []}
                loading={suppliersQ.isLoading}
                errorMessage={
                  suppliersQ.isError
                    ? suppliersQ.error instanceof Error
                      ? suppliersQ.error.message
                      : "Erro ao carregar fornecedores"
                    : null
                }
                emptyOptionLabel="Fornecedor sugerido / primeiro activo"
                onSupplierCreated={() => {
                  void qc.invalidateQueries({
                    queryKey: SUPPLIERS_ACTIVE_QUERY_KEY,
                  });
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBulkOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={issueBulkMut.isPending}
                  onClick={() =>
                    issueBulkMut.mutate({
                      ids: selectedRows.map((r) => r.id),
                      supplier_id: bulkSupplierId || undefined,
                    })
                  }
                >
                  {issueBulkMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Package className="h-4 w-4" />
                  )}
                  Emitir PC
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}