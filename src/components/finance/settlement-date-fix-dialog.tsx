"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { BrDateInput } from "@/shared/ui/br-date-input";
import { Label } from "@/shared/ui/label";
import { formatShortDate } from "@/shared/utils/date";

type SettlementDateFixDialogProps = {
  /** Título já liquidado a corrigir; null = fechado. */
  target: { id: string; label: string; paymentDate: string | null } | null;
  kind: "payable" | "receivable";
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Corrige a data real de um pagamento/recebimento já baixado (ex.: baixa em lote
 * feita com a data de hoje). Ajusta o título e o movimento do extrato; o valor
 * não muda e fica uma nota de auditoria no título.
 */
export function SettlementDateFixDialog({
  target,
  kind,
  onClose,
  onSaved,
}: SettlementDateFixDialogProps) {
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDate(target?.paymentDate?.slice(0, 10) ?? "");
  }, [target]);

  if (!target) return null;

  const word = kind === "payable" ? "pagamento" : "recebimento";

  async function save() {
    if (!target || !date) {
      toast.error(`Indique a data do ${word}.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/finance/${kind === "payable" ? "payables" : "receivables"}/${target.id}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_date: date }),
        }
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Erro ao corrigir a data");
        return;
      }
      toast.success(`Data do ${word} corrigida.`);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Corrigir data do {word}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            {target.label}
            <br />
            Data atual: {formatShortDate(target.paymentDate)}
          </p>
          <div className="space-y-1">
            <Label>Data real do {word}</Label>
            <BrDateInput value={date || null} onChange={(iso) => setDate(iso ?? "")} />
          </div>
          <p className="text-xs text-slate-500">
            Corrige o título e o movimento do extrato. O valor não muda e fica uma nota de
            auditoria no título.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
