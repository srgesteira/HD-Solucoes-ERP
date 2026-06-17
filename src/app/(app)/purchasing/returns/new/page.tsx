"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { AppPage } from "@/shared/ui/app-page";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/shared/ui/page-helpers";
import {
  FINANCIAL_ACTION_LABELS,
  PURCHASE_RETURN_REASON_LABELS,
  PURCHASE_RETURN_REASONS,
  RETURN_FINANCIAL_ACTIONS,
  type PurchaseReturnReason,
  type ReturnFinancialAction,
} from "@/modules/reverse/lib/returns-types";

type PurchaseItem = {
  id: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  product?: { id: string; name?: string | null } | null;
};

async function fetchPurchaseItems(poId: string): Promise<PurchaseItem[]> {
  const res = await fetch(`/api/purchasing/orders/${poId}/items`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: PurchaseItem[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao buscar itens do pedido");
  return json.data ?? [];
}

async function createReturn(payload: Record<string, unknown>): Promise<{
  id: string;
}> {
  const res = await fetch("/api/purchase-returns", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as {
    purchase_return?: { id: string };
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao criar devolução");
  return json.purchase_return!;
}

export default function NewPurchaseReturnPage() {
  const router = useRouter();
  const search = useSearchParams();
  const poId = search?.get("po") ?? "";

  const [reason, setReason] = useState<PurchaseReturnReason>("defect");
  const [financialAction, setFinancialAction] =
    useState<ReturnFinancialAction>("refund");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<
    Record<string, { quantity: number; unit_price: number; checked: boolean }>
  >({});

  const itemsQuery = useQuery({
    queryKey: ["po-items-for-return", poId],
    queryFn: () => fetchPurchaseItems(poId),
    enabled: Boolean(poId),
  });

  useEffect(() => {
    if (!itemsQuery.data) return;
    const seed: typeof selected = {};
    for (const it of itemsQuery.data) {
      seed[it.id] = {
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        checked: false,
      };
    }
    setSelected(seed);
  }, [itemsQuery.data]);

  const total = useMemo(() => {
    if (!itemsQuery.data) return 0;
    return itemsQuery.data.reduce((acc, it) => {
      const s = selected[it.id];
      if (!s?.checked) return acc;
      return acc + Number(s.quantity) * Number(s.unit_price);
    }, 0);
  }, [itemsQuery.data, selected]);

  const createMut = useMutation({
    mutationFn: createReturn,
    onSuccess: (ret) => {
      toast.success("Devolução de compra criada.");
      router.push(`/purchasing/returns/${ret.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!poId) {
    return (
      <AppPage
        title="Nova devolução de compra"
        backHref="/purchasing/returns"
        width="narrow"
      >
        <EmptyState
          icon={RotateCcw}
          title="Pedido de origem ausente"
          description="Esta página precisa do pedido de compra via ?po=. Volte ao pedido e clique em 'Iniciar devolução'."
        />
      </AppPage>
    );
  }

  const handleSubmit = () => {
    if (!itemsQuery.data) return;
    const items: Array<Record<string, unknown>> = [];
    for (const it of itemsQuery.data) {
      const s = selected[it.id];
      if (!s?.checked || !(s.quantity > 0)) continue;
      items.push({
        purchase_order_item_id: it.id,
        product_id: it.product?.id ?? null,
        description: it.description,
        quantity: Number(s.quantity),
        unit_price: Number(s.unit_price),
      });
    }
    if (items.length === 0) {
      toast.error("Selecione pelo menos um item para devolver.");
      return;
    }
    createMut.mutate({
      purchase_order_id: poId,
      reason,
      financial_action: financialAction,
      notes: notes.trim() ? notes.trim() : null,
      items,
    });
  };

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5" /> Nova devolução de compra
        </span>
      }
      description="§10.3: devolver ao fornecedor com baixa de estoque e geração de receivable contra ele (refund / credit_note)."
      backHref={`/purchasing/orders/${poId}`}
      density="comfortable"
    >

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cabeçalho</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Motivo</Label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={reason}
              onChange={(e) =>
                setReason(e.target.value as PurchaseReturnReason)
              }
            >
              {PURCHASE_RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {PURCHASE_RETURN_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Ação financeira</Label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={financialAction}
              onChange={(e) =>
                setFinancialAction(e.target.value as ReturnFinancialAction)
              }
            >
              {RETURN_FINANCIAL_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {FINANCIAL_ACTION_LABELS[a]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes do retorno"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Itens do pedido</CardTitle>
        </CardHeader>
        <CardContent>
          {itemsQuery.isLoading ? (
            <LoadingState />
          ) : itemsQuery.error ? (
            <ErrorState message={(itemsQuery.error as Error).message} />
          ) : !itemsQuery.data || itemsQuery.data.length === 0 ? (
            <EmptyState title="Pedido sem itens" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-8"></th>
                    <th className="px-3 py-2 text-left font-medium">
                      Descrição
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Qtde</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Unit.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itemsQuery.data.map((it) => {
                    const s = selected[it.id];
                    return (
                      <tr key={it.id} className="border-t">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={s?.checked ?? false}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [it.id]: {
                                  quantity: prev[it.id]?.quantity ?? Number(it.quantity),
                                  unit_price: prev[it.id]?.unit_price ?? Number(it.unit_price),
                                  checked: e.target.checked,
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          {it.description ?? it.product?.name ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={Number(it.quantity)}
                            className="ml-auto w-24 text-right tabular-nums"
                            value={s?.quantity ?? Number(it.quantity)}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [it.id]: {
                                  ...(prev[it.id] ?? {
                                    unit_price: Number(it.unit_price),
                                    checked: false,
                                  }),
                                  quantity: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="ml-auto w-28 text-right tabular-nums"
                            value={s?.unit_price ?? Number(it.unit_price)}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [it.id]: {
                                  ...(prev[it.id] ?? {
                                    quantity: Number(it.quantity),
                                    checked: false,
                                  }),
                                  unit_price: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right font-medium">
                      Total a devolver
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {total.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/purchasing/orders/${poId}`)}
          disabled={createMut.isPending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={createMut.isPending || total <= 0}
        >
          {createMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Criar devolução
        </Button>
      </div>
    </AppPage>
  );
}
