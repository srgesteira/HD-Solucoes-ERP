"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  FINANCIAL_ACTION_LABELS,
  RETURN_FINANCIAL_ACTIONS,
  SALES_RETURN_ITEM_CONDITIONS,
  SALES_RETURN_REASON_LABELS,
  SALES_RETURN_REASONS,
  type ReturnFinancialAction,
  type SalesReturnItemCondition,
  type SalesReturnReason,
} from "@/modules/reverse/lib/returns-types";

type LineSeed = {
  sales_order_item_id: string;
  description: string | null;
  product_id: string | null;
  quantity: number;
  unit_price: number;
};

type SubmitItem = {
  sales_order_item_id: string;
  product_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  condition: SalesReturnItemCondition;
};

type Props = {
  open: boolean;
  salesOrderId: string;
  orderNumber: string;
  lines: LineSeed[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    sales_order_id: string;
    reason: SalesReturnReason;
    notes: string | null;
    financial_action: ReturnFinancialAction;
    restock_location: string | null;
    items: SubmitItem[];
  }) => void;
};

const CONDITION_LABEL: Record<SalesReturnItemCondition, string> = {
  a_grade: "A — vendável",
  b_grade: "B — recondicionar",
  scrap: "Sucata",
};

export function SalesReturnCreateModal({
  open,
  salesOrderId,
  orderNumber,
  lines,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState<SalesReturnReason>("defect");
  const [financialAction, setFinancialAction] =
    useState<ReturnFinancialAction>("refund");
  const [notes, setNotes] = useState("");
  const [restockLocation, setRestockLocation] = useState("");

  const [selected, setSelected] = useState<
    Record<
      string,
      { quantity: number; condition: SalesReturnItemCondition; checked: boolean }
    >
  >({});

  useEffect(() => {
    if (!open) return;
    const seed: typeof selected = {};
    for (const l of lines) {
      seed[l.sales_order_item_id] = {
        quantity: Number(l.quantity),
        condition: "a_grade",
        checked: false,
      };
    }
    setSelected(seed);
    setReason("defect");
    setFinancialAction("refund");
    setNotes("");
    setRestockLocation("");
  }, [open, lines]);

  const totalValue = useMemo(() => {
    return lines.reduce((acc, l) => {
      const s = selected[l.sales_order_item_id];
      if (!s?.checked) return acc;
      return acc + Number(s.quantity) * Number(l.unit_price);
    }, 0);
  }, [lines, selected]);

  if (!open) return null;

  const handleSubmit = () => {
    const items: SubmitItem[] = [];
    for (const l of lines) {
      const s = selected[l.sales_order_item_id];
      if (!s?.checked || !(s.quantity > 0)) continue;
      items.push({
        sales_order_item_id: l.sales_order_item_id,
        product_id: l.product_id,
        description: l.description,
        quantity: Number(s.quantity),
        unit_price: Number(l.unit_price),
        condition: s.condition,
      });
    }
    if (items.length === 0) return;
    onSubmit({
      sales_order_id: salesOrderId,
      reason,
      financial_action: financialAction,
      notes: notes.trim() ? notes.trim() : null,
      restock_location: restockLocation.trim() ? restockLocation.trim() : null,
      items,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-lg dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Iniciar devolução · {orderNumber}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-slate-500 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Motivo</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
                value={reason}
                onChange={(e) =>
                  setReason(e.target.value as SalesReturnReason)
                }
              >
                {SALES_RETURN_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {SALES_RETURN_REASON_LABELS[r]}
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
            <div>
              <Label>Local de retorno (opcional)</Label>
              <Input
                value={restockLocation}
                onChange={(e) => setRestockLocation(e.target.value)}
                placeholder="ex.: Almoxarifado A · Bay 3"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notas internas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalhes adicionais sobre a devolução"
                rows={2}
              />
            </div>
          </div>

          <div className="rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium w-8"></th>
                  <th className="px-3 py-2 text-left font-medium">
                    Item original
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Qtde devolvida
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Unit.</th>
                  <th className="px-3 py-2 text-left font-medium">Condição</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const s = selected[l.sales_order_item_id];
                  return (
                    <tr key={l.sales_order_item_id} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={s?.checked ?? false}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [l.sales_order_item_id]: {
                                quantity:
                                  prev[l.sales_order_item_id]?.quantity ??
                                  Number(l.quantity),
                                condition:
                                  prev[l.sales_order_item_id]?.condition ??
                                  "a_grade",
                                checked: e.target.checked,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">{l.description ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          className="ml-auto w-24 text-right tabular-nums"
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={Number(l.quantity)}
                          value={s?.quantity ?? Number(l.quantity)}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [l.sales_order_item_id]: {
                                ...(prev[l.sales_order_item_id] ?? {
                                  condition: "a_grade",
                                  checked: false,
                                }),
                                quantity: Number(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(l.unit_price).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="h-9 rounded-md border border-slate-300 px-2 text-sm"
                          value={s?.condition ?? "a_grade"}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [l.sales_order_item_id]: {
                                ...(prev[l.sales_order_item_id] ?? {
                                  quantity: Number(l.quantity),
                                  checked: false,
                                }),
                                condition: e.target
                                  .value as SalesReturnItemCondition,
                              },
                            }))
                          }
                        >
                          {SALES_RETURN_ITEM_CONDITIONS.map((c) => (
                            <option key={c} value={c}>
                              {CONDITION_LABEL[c]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-slate-500"
                    >
                      Pedido sem linhas para devolução.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right font-medium">
                    Total a devolver
                  </td>
                  <td className="px-3 py-2 font-medium tabular-nums">
                    {totalValue.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy || totalValue <= 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Criar devolução
          </Button>
        </div>
      </div>
    </div>
  );
}
