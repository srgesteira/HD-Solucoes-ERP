"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";

type Props = {
  orderId: string;
  productId: string;
  sku?: string | null;
  className?: string;
};

export function CreateBlingProductButton({
  orderId,
  productId,
  sku,
  className,
}: Props) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/faturamento/fiscal/${encodeURIComponent(orderId)}/bling-product`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: productId }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        data?: { bling_product_id: number; created: boolean; codigo: string };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao criar produto no Bling");
      if (!json.data) throw new Error("Resposta inválida");
      return json.data;
    },
    onSuccess: (data) => {
      toast.success(
        data.created
          ? `Produto ${data.codigo} criado no Bling. O contador só precisa preencher NCM/CFOP/CSOSN.`
          : `Produto ${data.codigo} já existia no Bling — vínculo gravado.`
      );
      void queryClient.invalidateQueries({
        queryKey: ["fiscal-order-review", orderId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["fiscal-order-print", orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ["fiscal-invoicing"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("print:hidden", className)}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : null}
      Criar no Bling
      {sku ? ` (${sku})` : ""}
    </Button>
  );
}
