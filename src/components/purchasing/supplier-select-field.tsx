"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/utils/cn";
import {
  SupplierQuickCreateModal,
  type SupplierOption,
} from "@/components/purchasing/supplier-quick-create-modal";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-50";

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (supplierId: string) => void;
  suppliers: SupplierOption[];
  loading?: boolean;
  errorMessage?: string | null;
  allowQuickCreate?: boolean;
  onSupplierCreated?: (supplier: SupplierOption) => void;
  emptyOptionLabel?: string;
  className?: string;
  disabled?: boolean;
};

export function SupplierSelectField({
  id = "supplier",
  label = "Fornecedor",
  value,
  onChange,
  suppliers,
  loading,
  errorMessage,
  allowQuickCreate = true,
  onSupplierCreated,
  emptyOptionLabel = "Sem fornecedor",
  className,
  disabled = false,
}: Props) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [extra, setExtra] = useState<SupplierOption[]>([]);

  const merged = [...suppliers];
  for (const s of extra) {
    if (!merged.some((m) => m.id === s.id)) merged.push(s);
  }
  merged.sort((a, b) =>
    `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "pt")
  );

  const handleCreated = (s: SupplierOption) => {
    setExtra((prev) => [...prev, s]);
    onChange(s.id);
    onSupplierCreated?.(s);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {allowQuickCreate && !disabled ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setQuickOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Novo fornecedor
          </Button>
        ) : null}
      </div>
      <select
        id={id}
        className={cn(SELECT_CLASS)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
        aria-busy={loading}
      >
        <option value="">{emptyOptionLabel}</option>
        {merged.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code} — {s.name}
          </option>
        ))}
      </select>
      {errorMessage ? (
        <p className="text-xs text-red-600">{errorMessage}</p>
      ) : null}
      {loading ? (
        <p className="text-xs text-slate-500">A carregar fornecedores…</p>
      ) : null}

      <SupplierQuickCreateModal
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
