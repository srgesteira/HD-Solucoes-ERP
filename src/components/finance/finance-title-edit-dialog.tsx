"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { BrDateInput } from "@/shared/ui/br-date-input";
import { Label } from "@/shared/ui/label";
import { fmtFinanceBrl } from "@/components/finance/finance-table-ui";

type FinanceTitleEditDialogProps = {
  open: boolean;
  title: string;
  description: string;
  currentAmount: number;
  originalAmount?: number;
  dueDate: string;
  amountLocked?: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (data: { amount: number; dueDate: string }) => void | Promise<void>;
};

export function FinanceTitleEditDialog({
  open,
  title,
  description,
  currentAmount,
  originalAmount,
  dueDate,
  amountLocked,
  saving = false,
  onClose,
  onSave,
}: FinanceTitleEditDialogProps) {
  const [amount, setAmount] = useState(String(currentAmount));
  const [date, setDate] = useState(dueDate);

  useEffect(() => {
    if (!open) return;
    setAmount(String(currentAmount));
    setDate(dueDate);
  }, [open, currentAmount, dueDate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">{description}</p>
          {originalAmount != null ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-500">Valor original</p>
                <p className="font-medium">{fmtFinanceBrl(originalAmount)}</p>
              </div>
              <div>
                <p className="text-slate-500">Saldo actual</p>
                <p className="font-medium">{fmtFinanceBrl(currentAmount)}</p>
              </div>
            </div>
          ) : null}
          {amountLocked ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Este título já foi ajustado manualmente. Novas alterações de valor
              mantêm a trava activa.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Acordos comerciais podem alterar valor e data de vencimento antes
              da liquidação.
            </p>
          )}
          <div className="space-y-1">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Data de vencimento</Label>
            <BrDateInput
              value={date || null}
              onChange={(iso) => setDate(iso ?? "")}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                const parsed = parseFloat(amount.replace(",", "."));
                if (!Number.isFinite(parsed) || parsed <= 0) {
                  toast.error("Indique um valor válido.");
                  return;
                }
                if (!date) {
                  toast.error("Indique a data de vencimento.");
                  return;
                }
                void onSave({ amount: parsed, dueDate: date });
              }}
            >
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
