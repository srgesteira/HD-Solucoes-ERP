"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { ProductComboboxField } from "@/components/products/product-combobox-field";
import type { ProductSearchHit } from "@/components/products/product-search-types";

type OpHit = {
  id: string;
  order_number: string;
  status: string;
  product_hint: string | null;
};

async function searchOps(search: string): Promise<OpHit[]> {
  const res = await fetch(
    `/api/inventory/manual-out?search=${encodeURIComponent(search)}`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: OpHit[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao buscar OPs");
  return json.data ?? [];
}

async function postManualOut(body: {
  product_id: string;
  quantity: number;
  reason?: string;
  production_order_id?: string | null;
}): Promise<{ order_number: string | null }> {
  const res = await fetch("/api/inventory/manual-out", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    order_number?: string | null;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao registar saída");
  return { order_number: json.order_number ?? null };
}

type Props = {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSaved: () => void;
  setSaving: (v: boolean) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export function ManualInventoryOutModal({
  open,
  saving,
  onClose,
  onSaved,
  setSaving,
  onError,
  onSuccess,
}: Props) {
  const [product, setProduct] = useState<ProductSearchHit | null>(null);
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [opSearch, setOpSearch] = useState("");
  const [debouncedOp, setDebouncedOp] = useState("");
  const [selectedOp, setSelectedOp] = useState<OpHit | null>(null);

  useEffect(() => {
    if (!open) return;
    setProduct(null);
    setQty("1");
    setReason("");
    setOpSearch("");
    setSelectedOp(null);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedOp(opSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [opSearch]);

  const opsQ = useQuery({
    queryKey: ["manual-out-ops", debouncedOp],
    queryFn: () => searchOps(debouncedOp),
    enabled: open && !selectedOp && debouncedOp.length >= 2,
  });

  if (!open) return null;

  const qtyNum = Number(String(qty).replace(",", "."));
  const canSave =
    Boolean(product) && Number.isFinite(qtyNum) && qtyNum > 0 && !saving;

  const handleSave = async () => {
    if (!product || !canSave) return;
    setSaving(true);
    try {
      const result = await postManualOut({
        product_id: product.id,
        quantity: qtyNum,
        reason: reason.trim() || undefined,
        production_order_id: selectedOp?.id ?? null,
      });
      onSuccess(
        result.order_number
          ? `Saída registada — origem OP ${result.order_number}.`
          : "Saída manual registada."
      );
      onSaved();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao registar saída");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-3"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Saída manual de estoque
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Use quando um item foi excluído no abastecimento e depois precisa
                baixar. Informe a OP para a origem aparecer no extrato.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Produto</Label>
              <ProductComboboxField
                value={product}
                onChange={setProduct}
                productType="all"
                showNewProductButton={false}
                catalogTitle="Seleccionar produto para saída"
                placeholder="Digite código ou descrição…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manual-out-qty">Quantidade</Label>
              <Input
                id="manual-out-qty"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>OP (origem)</Label>
              {selectedOp ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div className="text-sm">
                    <div className="font-mono font-medium text-emerald-900">
                      {selectedOp.order_number}
                    </div>
                    {selectedOp.product_hint ? (
                      <div className="text-xs text-emerald-800">
                        {selectedOp.product_hint}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedOp(null)}
                  >
                    Limpar
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Buscar nº da OP (mín. 2 caracteres)…"
                    value={opSearch}
                    onChange={(e) => setOpSearch(e.target.value)}
                  />
                  {debouncedOp.length >= 2 ? (
                    <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200">
                      {opsQ.isFetching ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        </div>
                      ) : (opsQ.data ?? []).length === 0 ? (
                        <p className="px-3 py-3 text-center text-xs text-slate-500">
                          Nenhuma OP encontrada.
                        </p>
                      ) : (
                        <ul className="divide-y divide-slate-100">
                          {(opsQ.data ?? []).map((op) => (
                            <li key={op.id}>
                              <button
                                type="button"
                                className="flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50"
                                onClick={() => {
                                  setSelectedOp(op);
                                  setOpSearch("");
                                }}
                              >
                                <span className="font-mono text-sm font-medium">
                                  {op.order_number}
                                </span>
                                {op.product_hint ? (
                                  <span className="text-xs text-slate-500">
                                    {op.product_hint}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manual-out-reason">Motivo (opcional)</Label>
              <Input
                id="manual-out-reason"
                placeholder="Ex.: Embalagem usada depois de liberar a produção"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSave}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirmar saída
            </Button>
          </div>
        </div>
      </div>

    </>
  );
}
