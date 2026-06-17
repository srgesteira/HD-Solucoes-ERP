"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  buildUnifiedCostHistorySlots,
  hasAnyCostHistory,
  priceTypeLabel,
  type ProductPriceHistoryRow,
} from "@/modules/engenharia/lib/products/product-price-history";
import { fmtBRL } from "@/shared/utils/format-brl";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

async function fetchPriceHistory(productId: string): Promise<ProductPriceHistoryRow[]> {
  const res = await fetch(`/api/products/${productId}/price-history`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductPriceHistoryRow[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar histórico de custos");
  }
  return json.data ?? [];
}

type Props = {
  productId: string;
};

export function ProductCostHistoryTable({ productId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["product-price-history", productId],
    queryFn: () => fetchPriceHistory(productId),
    enabled: Boolean(productId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        A carregar histórico de custos…
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-600 py-2">
        {error instanceof Error ? error.message : "Erro ao carregar histórico."}
      </p>
    );
  }

  const rows = data ?? [];
  if (!hasAnyCostHistory(rows)) {
    return (
      <p className="text-sm text-slate-600 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
        Nenhum custo registrado ainda. Ao salvar o produto ou recalcular a BOM, o
        histórico será gerado.
      </p>
    );
  }

  const slots = buildUnifiedCostHistorySlots(rows);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-800">Histórico de custos</p>
      <div className="rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 font-medium text-slate-700">Posição</th>
              <th className="px-3 py-2 font-medium text-slate-700 text-right">
                Valor (R$)
              </th>
              <th className="px-3 py-2 font-medium text-slate-700">Data</th>
              <th className="px-3 py-2 font-medium text-slate-700">Tipo</th>
              <th className="px-3 py-2 font-medium text-slate-700 text-right">
                % Dedução
              </th>
              <th className="px-3 py-2 font-medium text-slate-700 text-right">
                Valor c/ dedução
              </th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr
                key={slot.position}
                className={
                  slot.position === 1
                    ? "border-b border-slate-100 bg-brand-50/40"
                    : "border-b border-slate-100 last:border-0"
                }
              >
                <td className="px-3 py-2 font-medium text-slate-800">
                  {slot.position}
                  {slot.position === 1 ? (
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      (actual)
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                  {slot.value != null ? fmtBRL(slot.value) : "—"}
                </td>
                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                  {fmtDate(slot.quote_date)}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {priceTypeLabel(slot.price_type)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {slot.position === 6 ? (
                    slot.tax_deduction_percent != null &&
                    Number.isFinite(slot.tax_deduction_percent) ? (
                      `${Number(slot.tax_deduction_percent).toFixed(2)}%`
                    ) : (
                      <span className="text-slate-400">Não informado</span>
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                  {slot.position === 6 ? (
                    slot.value_after_deduction != null ? (
                      fmtBRL(slot.value_after_deduction)
                    ) : slot.value != null ? (
                      <span className="text-slate-400">Não informado</span>
                    ) : (
                      "—"
                    )
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
