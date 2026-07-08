"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Loader2,
  PackageCheck,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type {
  ProductionSupplyBomLine,
  ProductionSupplyBomPreview,
  ProductionSupplyMaterialOverride,
} from "@/modules/almoxarifado/lib/production-supply";
import { cn } from "@/shared/utils/cn";

type SubstituteHit = {
  id: string;
  technical_code: string | null;
  name: string;
  unit: string | null;
  quantity_on_hand: number;
  available: number;
};

type EditableLine = ProductionSupplyBomLine & {
  draft_quantity: number;
  excluded: boolean;
};

async function fetchBomPreview(
  orderItemId: string
): Promise<ProductionSupplyBomPreview> {
  const res = await fetch(
    `/api/inventory/production-supply?order_item_id=${encodeURIComponent(orderItemId)}`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductionSupplyBomPreview;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar estrutura");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function searchSubstitutes(
  search: string,
  excludeIds: string[]
): Promise<SubstituteHit[]> {
  const params = new URLSearchParams({ search });
  if (excludeIds.length) params.set("exclude", excludeIds.join(","));
  const res = await fetch(
    `/api/inventory/production-supply?${params.toString()}`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: SubstituteHit[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro na busca");
  return json.data ?? [];
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(n);
}

type Props = {
  orderItemId: string | null;
  confirming: boolean;
  onClose: () => void;
  onConfirm: (
    orderItemId: string,
    materials: ProductionSupplyMaterialOverride[]
  ) => void;
};

export function SupplyBomReviewModal({
  orderItemId,
  confirming,
  onClose,
  onConfirm,
}: Props) {
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [swapLineKey, setSwapLineKey] = useState<string | null>(null);
  const [swapSearch, setSwapSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const previewQ = useQuery({
    queryKey: ["production-supply-bom", orderItemId],
    queryFn: () => fetchBomPreview(orderItemId!),
    enabled: Boolean(orderItemId),
  });

  useEffect(() => {
    if (!previewQ.data) return;
    setLines(
      previewQ.data.lines.map((l) => ({
        ...l,
        draft_quantity: l.quantity,
        excluded: false,
      }))
    );
    setSwapLineKey(null);
    setSwapSearch("");
  }, [previewQ.data]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(swapSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [swapSearch]);

  const excludeIds = useMemo(() => lines.map((l) => l.product_id), [lines]);

  const searchQ = useQuery({
    queryKey: ["production-supply-substitute", debouncedSearch, excludeIds],
    queryFn: () => searchSubstitutes(debouncedSearch, excludeIds),
    enabled: Boolean(swapLineKey) && debouncedSearch.length >= 2,
  });

  if (!orderItemId) return null;

  const applySubstitute = (hit: SubstituteHit) => {
    if (!swapLineKey) return;
    setLines((prev) =>
      prev.map((l) =>
        l.line_key === swapLineKey
          ? {
              ...l,
              product_id: hit.id,
              product_code: hit.technical_code,
              product_name: hit.name,
              unit: hit.unit,
              quantity_on_hand: hit.quantity_on_hand,
              available: hit.available,
              reserved_quantity: 0,
              substituted: hit.id !== l.original_product_id,
              excluded: false,
            }
          : l
      )
    );
    setSwapLineKey(null);
    setSwapSearch("");
  };

  const restoreOriginal = (lineKey: string) => {
    const original = previewQ.data?.lines.find((l) => l.line_key === lineKey);
    if (!original) return;
    setLines((prev) =>
      prev.map((l) =>
        l.line_key === lineKey
          ? {
              ...original,
              draft_quantity: original.quantity,
              excluded: false,
            }
          : l
      )
    );
  };

  const excludeLine = (lineKey: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.line_key === lineKey
          ? { ...l, excluded: true, substituted: false }
          : l
      )
    );
    if (swapLineKey === lineKey) {
      setSwapLineKey(null);
      setSwapSearch("");
    }
  };

  const reinstateLine = (lineKey: string) => {
    setLines((prev) =>
      prev.map((l) => (l.line_key === lineKey ? { ...l, excluded: false } : l))
    );
  };

  const activeLines = lines.filter((l) => !l.excluded);
  const excludedCount = lines.length - activeLines.length;

  const handleConfirm = () => {
    const materials: ProductionSupplyMaterialOverride[] = lines.map((l) => ({
      product_id: l.excluded ? l.original_product_id : l.product_id,
      quantity: l.draft_quantity > 0 ? l.draft_quantity : l.quantity,
      original_product_id: l.original_product_id,
      excluded: l.excluded,
    }));
    onConfirm(orderItemId, materials);
  };

  const header = previewQ.data;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900">
              Abastecimento — estrutura (BOM)
            </h3>
            {header ? (
              <p className="mt-0.5 text-sm text-slate-600">
                OP <strong className="font-mono">{header.order_number}</strong>
                {" · "}
                <span className="font-mono text-xs">{header.product_code}</span>{" "}
                {header.product_name} × {fmtQty(header.quantity)}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-slate-500">A carregar componentes…</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={confirming}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {previewQ.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              A explodir estrutura…
            </div>
          ) : previewQ.error ? (
            <p className="py-10 text-center text-sm text-red-700">
              {previewQ.error instanceof Error
                ? previewQ.error.message
                : "Erro ao carregar"}
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-500">
                Revise os materiais. Em falta: <strong>Trocar</strong> por outro
                item ou <strong>Excluir</strong> deste abastecimento (ex.: saco de
                embalagem) para liberar a produção sem baixa. Só ao confirmar{" "}
                <strong>Abastecido</strong> o sistema dá baixa nos itens
                restantes.
              </p>
              {excludedCount > 0 ? (
                <p className="mb-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
                  {excludedCount} item(ns) excluído(s) deste abastecimento — sem
                  saída de estoque; o empenho MRP desses itens será libertado.
                </p>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-2 py-2 font-medium">Componente</th>
                      <th className="px-2 py-2 font-medium text-right">Qtd</th>
                      <th className="px-2 py-2 font-medium text-right">Saldo</th>
                      <th className="px-2 py-2 font-medium text-right">Disponível</th>
                      <th className="px-2 py-2 font-medium">Estado</th>
                      <th className="px-2 py-2 font-medium text-right">Acções</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const short =
                        !l.excluded && l.available + 0.0001 < l.draft_quantity;
                      return (
                        <tr
                          key={l.line_key}
                          className={cn(
                            "border-b border-slate-100 last:border-0",
                            l.excluded && "bg-slate-100/80 opacity-70",
                            l.substituted && !l.excluded && "bg-sky-50/60",
                            short && !l.substituted && "bg-amber-50/50"
                          )}
                        >
                          <td className="px-2 py-2">
                            <div
                              className={cn(
                                "font-mono text-xs text-slate-700",
                                l.excluded && "line-through"
                              )}
                            >
                              {l.product_code ?? "—"}
                            </div>
                            <div
                              className={cn(
                                "text-xs text-slate-600",
                                l.excluded && "line-through"
                              )}
                            >
                              {l.product_name ?? "—"}
                            </div>
                            {l.substituted && !l.excluded ? (
                              <div className="mt-0.5 text-[10px] text-sky-800">
                                Original: {l.original_product_id.slice(0, 8)}…
                              </div>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Input
                              className="ml-auto h-8 w-24 text-right tabular-nums"
                              inputMode="decimal"
                              disabled={l.excluded}
                              value={String(l.draft_quantity)}
                              onChange={(e) => {
                                const v = Number(
                                  e.target.value.replace(",", ".")
                                );
                                setLines((prev) =>
                                  prev.map((row) =>
                                    row.line_key === l.line_key
                                      ? {
                                          ...row,
                                          draft_quantity: Number.isFinite(v)
                                            ? Math.max(0, v)
                                            : 0,
                                        }
                                      : row
                                  )
                                );
                              }}
                            />
                            {l.unit ? (
                              <div className="text-[10px] text-slate-400">{l.unit}</div>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {fmtQty(l.quantity_on_hand)}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-2 text-right tabular-nums",
                              short ? "font-semibold text-amber-800" : ""
                            )}
                          >
                            {fmtQty(l.available)}
                          </td>
                          <td className="px-2 py-2">
                            {l.excluded ? (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                Excluído
                              </span>
                            ) : l.substituted ? (
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-900">
                                Trocado
                              </span>
                            ) : short ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                                Sem saldo
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                                OK
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              {l.excluded ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 px-2 text-[11px]"
                                  title="Voltar a incluir no abastecimento"
                                  onClick={() => reinstateLine(l.line_key)}
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                  Incluir
                                </Button>
                              ) : (
                                <>
                                  {l.substituted ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-[11px]"
                                      title="Restaurar original da BOM"
                                      onClick={() => restoreOriginal(l.line_key)}
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1 px-2 text-[11px]"
                                    onClick={() => {
                                      setSwapLineKey(l.line_key);
                                      setSwapSearch("");
                                    }}
                                  >
                                    <ArrowRightLeft className="h-3.5 w-3.5" />
                                    Trocar
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 gap-1 px-2 text-[11px] text-red-700 hover:bg-red-50 hover:text-red-800"
                                    title="Excluir deste abastecimento (sem baixa)"
                                    onClick={() => excludeLine(l.line_key)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Excluir
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {swapLineKey ? (
                <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">
                      Substituir componente
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSwapLineKey(null)}
                    >
                      Fechar busca
                    </Button>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      className="pl-8"
                      placeholder="Buscar por código ou nome (mín. 2 caracteres)…"
                      value={swapSearch}
                      onChange={(e) => setSwapSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white">
                    {debouncedSearch.length < 2 ? (
                      <p className="px-3 py-4 text-center text-xs text-slate-500">
                        Digite para buscar um item substituto.
                      </p>
                    ) : searchQ.isFetching ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : (searchQ.data ?? []).length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-slate-500">
                        Nenhum produto encontrado.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {(searchQ.data ?? []).map((hit) => (
                          <li key={hit.id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
                              onClick={() => applySubstitute(hit)}
                            >
                              <div className="min-w-0">
                                <div className="font-mono text-xs text-slate-700">
                                  {hit.technical_code ?? "—"}
                                </div>
                                <div className="truncate text-xs text-slate-600">
                                  {hit.name}
                                </div>
                              </div>
                              <div className="shrink-0 text-right text-[11px] text-slate-500">
                                Disp. {fmtQty(hit.available)}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={confirming}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              confirming ||
              previewQ.isLoading ||
              !!previewQ.error ||
              lines.length === 0 ||
              activeLines.some((l) => l.draft_quantity <= 0)
            }
            onClick={handleConfirm}
          >
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PackageCheck className="h-4 w-4" />
            )}
            Confirmar abastecido
          </Button>
        </div>
      </div>
    </div>
  );
}
