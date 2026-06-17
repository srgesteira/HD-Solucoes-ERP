"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { menuAlertsQueryKey } from "@/hooks/use-menu-alerts";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";

type Props = {
  productId: string;
  productName: string;
  engineeringWorkflowStatus: string | null;
  releasedForSale: boolean;
  onReleased?: () => void;
};

export function ProductReleaseForSalePanel({
  productId,
  productName,
  engineeringWorkflowStatus,
  releasedForSale,
  onReleased,
}: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const isReleased =
    releasedForSale || engineeringWorkflowStatus === "released";
  const isPending = engineeringWorkflowStatus === "pending_composition";

  if (isReleased) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
        <p className="font-medium flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Liberado para vendas
        </p>
        <p className="mt-1 text-emerald-800/90">
          O comercial pode usar o custo deste produto nos orçamentos.
        </p>
      </div>
    );
  }

  const handleRelease = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${productId}/release-for-sale`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        quotes_notified?: number;
        cost_price?: number;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao liberar produto");
      }
      const n = json.quotes_notified ?? 0;
      toast.success(
        n > 0
          ? `«${productName}» liberado. ${n} orçamento(s) notificado(s) para o comercial.`
          : `«${productName}» liberado para vendas.`
      );
      await queryClient.invalidateQueries({ queryKey: ["product", productId] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
      await queryClient.invalidateQueries({ queryKey: menuAlertsQueryKey });
      onReleased?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao liberar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        isPending
          ? "border-amber-300 bg-amber-50 animate-pulse ring-2 ring-amber-400/50"
          : "border-slate-200 bg-slate-50"
      )}
    >
      <p
        className={cn(
          "text-sm font-semibold",
          isPending ? "text-amber-950" : "text-slate-900"
        )}
      >
        {isPending
          ? "Estrutura solicitada pelo comercial"
          : "Pronto para liberar ao comercial?"}
      </p>
      <p
        className={cn(
          "mt-1 text-xs",
          isPending ? "text-amber-900/90" : "text-slate-600"
        )}
      >
        Cadastre pelo menos um item na composição (BOM) abaixo. Quando o custo
        estiver correcto, clique em liberar — o badge passa de «Em
        estruturação» para «Liberado».
        {isPending
          ? " O orçamento associado será destacado para o vendedor aplicar markup."
          : null}
      </p>
      <Button
        type="button"
        size="sm"
        className="mt-3"
        disabled={busy}
        onClick={() => void handleRelease()}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        Liberado para vendas
      </Button>
    </div>
  );
}
