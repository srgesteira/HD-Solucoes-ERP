"use client";

import { useEffect, useState } from "react";
import { Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { BrDateInput } from "@/shared/ui/br-date-input";
import { Label } from "@/shared/ui/label";
import { formatShortDate, todayIsoSaoPaulo } from "@/shared/utils/date";

export type CloseWithoutInvoiceTarget = {
  id: string;
  orderNumber: string;
  /** Data real de entrega já registada no pedido (não é sobrescrita). */
  actualDelivery: string | null;
};

type Props = {
  target: CloseWithoutInvoiceTarget | null;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (actualDelivery: string) => void;
};

/** Confirma entrega sem nota pedindo a data real de entrega. */
export function CloseWithoutInvoiceDialog({
  target,
  pending,
  onCancel,
  onConfirm,
}: Props) {
  const existing = target?.actualDelivery?.slice(0, 10) || null;
  const [date, setDate] = useState<string>(existing ?? todayIsoSaoPaulo());

  useEffect(() => {
    setDate(existing ?? todayIsoSaoPaulo());
  }, [existing, target?.id]);

  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">
            Confirmar sem nota — pedido {target.orderNumber}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="close-without-invoice-delivery">Data real de entrega</Label>
            <BrDateInput
              id="close-without-invoice-delivery"
              value={date || null}
              onChange={(iso) => setDate(iso ?? "")}
              disabled={Boolean(existing) || pending}
              placeholder="dd/mm/aaaa"
              title={
                existing
                  ? "Data já registada no pedido — não será alterada."
                  : undefined
              }
            />
          </div>
          <p className="text-xs text-slate-500">
            {existing
              ? `O pedido já tem entrega registada em ${formatShortDate(existing)}; essa data é mantida e serve de base aos vencimentos.`
              : "Os vencimentos das parcelas pendentes são calculados a partir desta data."}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!date) {
                  toast.error("Indique a data real de entrega.");
                  return;
                }
                onConfirm(date);
              }}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackageCheck className="h-4 w-4" />
              )}
              Confirmar sem nota
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
