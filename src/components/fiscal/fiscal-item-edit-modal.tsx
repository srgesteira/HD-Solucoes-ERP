"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Save } from "lucide-react";
import type {
  FiscalOrderReviewItem,
  ManualFiscalItemInput,
} from "@/modules/faturamento/lib/fiscal-order-review-service";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type Props = {
  item: FiscalOrderReviewItem | null;
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (itemId: string, payload: ManualFiscalItemInput) => void;
};

function toFormState(item: FiscalOrderReviewItem): ManualFiscalItemInput {
  return {
    cfop: item.cfop ?? "",
    icms_rate: item.icms_rate ?? 0,
    icms_value: item.icms_value,
    ipi_rate: item.ipi_rate ?? 0,
    ipi_value: item.ipi_value,
    tax_base: item.tax_base,
    pis_rate: item.pis_rate ?? 0,
    cofins_rate: item.cofins_rate ?? 0,
    icms_st: item.icms_st ?? false,
    icms_st_rate: item.icms_st_rate ?? 0,
    cbs_rate: item.cbs_rate ?? 0,
    ibs_rate: item.ibs_rate ?? 0,
    ibs_cbs_classificacao: item.ibs_cbs_classificacao,
  };
}

export function FiscalItemEditModal({
  item,
  open,
  saving,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<ManualFiscalItemInput | null>(null);

  useEffect(() => {
    if (item && open) setForm(toFormState(item));
  }, [item, open]);

  if (!open || !item || !form) return null;

  const setNum = (key: keyof ManualFiscalItemInput, raw: string) => {
    const v = raw.trim() === "" ? 0 : Number(raw.replace(",", "."));
    setForm((f) => (f ? { ...f, [key]: Number.isFinite(v) ? v : 0 } : f));
  };

  const handleSubmit = () => {
    if (!form.cfop.trim()) return;
    onSave(item.id, {
      ...form,
      cfop: form.cfop.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Editar fiscal — item {item.line_number}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {item.product_name ?? item.description}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="cfop">CFOP *</Label>
            <Input
              id="cfop"
              inputMode="numeric"
              maxLength={4}
              placeholder="Ex.: 5102"
              value={form.cfop}
              onChange={(e) =>
                setForm((f) =>
                  f ? { ...f, cfop: e.target.value.replace(/\D/g, "").slice(0, 4) } : f
                )
              }
            />
          </div>

          <div>
            <Label htmlFor="tax_base">Base de cálculo (R$)</Label>
            <Input
              id="tax_base"
              inputMode="decimal"
              value={form.tax_base ?? ""}
              onChange={(e) => setNum("tax_base", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="icms_rate">ICMS %</Label>
            <Input
              id="icms_rate"
              inputMode="decimal"
              value={form.icms_rate}
              onChange={(e) => setNum("icms_rate", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="icms_value">ICMS R$</Label>
            <Input
              id="icms_value"
              inputMode="decimal"
              value={form.icms_value ?? ""}
              onChange={(e) => setNum("icms_value", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ipi_rate">IPI %</Label>
            <Input
              id="ipi_rate"
              inputMode="decimal"
              value={form.ipi_rate}
              onChange={(e) => setNum("ipi_rate", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ipi_value">IPI R$</Label>
            <Input
              id="ipi_value"
              inputMode="decimal"
              value={form.ipi_value ?? ""}
              onChange={(e) => setNum("ipi_value", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pis_rate">PIS %</Label>
            <Input
              id="pis_rate"
              inputMode="decimal"
              value={form.pis_rate ?? 0}
              onChange={(e) => setNum("pis_rate", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cofins_rate">COFINS %</Label>
            <Input
              id="cofins_rate"
              inputMode="decimal"
              value={form.cofins_rate ?? 0}
              onChange={(e) => setNum("cofins_rate", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="icms_st_rate">ICMS ST %</Label>
            <Input
              id="icms_st_rate"
              inputMode="decimal"
              value={form.icms_st_rate ?? 0}
              onChange={(e) => setNum("icms_st_rate", e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.icms_st ?? false}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, icms_st: e.target.checked } : f))
                }
              />
              ICMS ST
            </label>
          </div>
          <div>
            <Label htmlFor="cbs_rate">CBS %</Label>
            <Input
              id="cbs_rate"
              inputMode="decimal"
              value={form.cbs_rate ?? 0}
              onChange={(e) => setNum("cbs_rate", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ibs_rate">IBS %</Label>
            <Input
              id="ibs_rate"
              inputMode="decimal"
              value={form.ibs_rate ?? 0}
              onChange={(e) => setNum("ibs_rate", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ibs_cbs">Classificação IBS/CBS</Label>
            <Input
              id="ibs_cbs"
              value={form.ibs_cbs_classificacao ?? ""}
              onChange={(e) =>
                setForm((f) =>
                  f
                    ? { ...f, ibs_cbs_classificacao: e.target.value || null }
                    : f
                )
              }
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Deixe ICMS/IPI em R$ vazio para recalcular automaticamente a partir das
          alíquotas e da base. CFOP e alíquotas ficam gravados como edição manual.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving || form.cfop.length !== 4}
            onClick={handleSubmit}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Gravar fiscal manual
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FiscalItemEditButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-6 px-1.5 text-[10px]"
      disabled={disabled}
      title="Editar CFOP e impostos manualmente"
      onClick={onClick}
    >
      <Pencil className="h-3 w-3" />
      Editar
    </Button>
  );
}
