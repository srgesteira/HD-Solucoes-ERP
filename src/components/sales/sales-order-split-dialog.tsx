"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Split } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { NumericInput } from "@/shared/ui/numeric-input";
import { fmtBRL } from "@/shared/utils/format-brl";
import {
  quoteLineItemCode,
  quoteLineItemName,
  type QuotePrintItem,
} from "@/modules/vendas/lib/sales/quote-display";
import {
  lineNetSubtotal,
  roundMoney,
} from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";

export type SplitDialogItem = {
  id: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount?: number | null;
  product?: unknown;
};

type Props = {
  open: boolean;
  orderNumber: string;
  items: SplitDialogItem[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (lines: { itemId: string; quantityToNew: number }[]) => void;
};

export function SalesOrderSplitDialog({
  open,
  orderNumber,
  items,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const [qtyNew, setQtyNew] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    const init: Record<string, number> = {};
    for (const it of items) init[it.id] = 0;
    setQtyNew(init);
  }, [open, items]);

  const rows = useMemo(() => {
    return items.map((it) => {
      const orig = Number(it.quantity);
      const toNew = Math.min(Math.max(0, Number(qtyNew[it.id] ?? 0)), orig);
      const stay = roundMoney(orig - toNew);
      const discOrig = Number(it.discount ?? 0);
      const discStay =
        orig > 0 ? roundMoney(discOrig * (stay / orig)) : 0;
      const discNew = roundMoney(discOrig - discStay);
      return {
        it,
        orig,
        toNew,
        stay,
        stayTotal: lineNetSubtotal(stay, Number(it.unit_price), discStay),
        newTotal: lineNetSubtotal(toNew, Number(it.unit_price), discNew),
      };
    });
  }, [items, qtyNew]);

  const sumStay = rows.reduce((s, r) => s + r.stay, 0);
  const sumNew = rows.reduce((s, r) => s + r.toNew, 0);
  const totalStay = rows.reduce((s, r) => s + r.stayTotal, 0);
  const totalNew = rows.reduce((s, r) => s + r.newTotal, 0);
  const valid = sumStay > 1e-9 && sumNew > 1e-9;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="split-order-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="split-order-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"
        >
          <Split className="h-5 w-5" />
          Desmembrar pedido {orderNumber}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Indique, em cada linha, quanto fica neste pedido e quanto vai para um
          pedido novo (mesmo cliente e condições). Tem de ficar pelo menos uma
          quantidade no original e sair pelo menos uma para o novo.
        </p>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                <th className="px-3 py-2 text-left font-medium">Produto</th>
                <th className="px-3 py-2 text-right font-medium">Qtd actual</th>
                <th className="px-3 py-2 text-right font-medium">Fica</th>
                <th className="px-3 py-2 text-right font-medium">Vai para o novo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ it, orig, stay, toNew }) => (
                <tr
                  key={it.id}
                  className="border-b border-slate-100 dark:border-slate-800"
                >
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-slate-500">
                      {quoteLineItemCode(
                        it.product as QuotePrintItem["product"],
                        it.description
                      )}
                    </div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {quoteLineItemName(
                        it.product as QuotePrintItem["product"],
                        it.description
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{orig}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {stay}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <NumericInput
                      value={toNew}
                      onChange={(n) =>
                        setQtyNew((prev) => ({
                          ...prev,
                          [it.id]: Math.min(Math.max(0, n), orig),
                        }))
                      }
                      maxDecimals={3}
                      className="h-8 w-24 ml-auto text-right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
          <span>
            Original: {fmtBRL(totalStay)}
          </span>
          <span>
            Pedido novo: {fmtBRL(totalNew)}
          </span>
        </div>
        {!valid ? (
          <p className="mt-2 text-xs text-amber-700">
            Deixe quantidade no original e envie pelo menos uma unidade para o
            novo.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !valid}
            onClick={() =>
              onConfirm(
                rows
                  .filter((r) => r.toNew > 1e-9)
                  .map((r) => ({ itemId: r.it.id, quantityToNew: r.toNew }))
              )
            }
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                A desmembrar…
              </>
            ) : (
              "Criar pedido novo"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
