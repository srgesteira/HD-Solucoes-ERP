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

  const isPending = engineeringWorkflowStatus === "pending_composition";
  const isReleased = releasedForSale || engineeringWorkflowStatus === "released";

  if (!isPending && isReleased) {
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

  if (!isPending) return null;

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
        "rounded-lg border border-amber-300 bg-amber-50 px-4 py-3",
        "animate-pulse ring-2 ring-amber-400/50"
      )}
    >
      <p className="text-sm font-semibold text-amber-950">
        Estrutura solicitada pelo comercial
      </p>
      <p className="mt-1 text-xs text-amber-900/90">
        Cadastre a BOM abaixo e clique em liberar quando o custo estiver correcto.
        O orçamento associado será destacado para o vendedor aplicar markup.
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
