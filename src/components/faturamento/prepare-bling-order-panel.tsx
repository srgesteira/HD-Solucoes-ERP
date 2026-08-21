"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import type { FiscalOrderReview } from "@/modules/faturamento/lib/fiscal-order-review-service";
import { isBlingProductInvoiceType } from "@/modules/faturamento/lib/unmapped-bling-products";
import { formatShortDate } from "@/shared/utils/date";
import { cn } from "@/shared/utils/cn";

type Props = {
  orderId: string;
  review: FiscalOrderReview;
  canPrepare: boolean;
  className?: string;
};

export function PrepareBlingOrderPanel({
  orderId,
  review,
  canPrepare,
  className,
}: Props) {
  const queryClient = useQueryClient();
  if (!isBlingProductInvoiceType(review.invoice_document_type)) return null;

  const mapped = review.items.filter((it) => it.product_id && it.bling_product_id)
    .length;
  const withProduct = review.items.filter((it) => it.product_id).length;
  const prepared = Boolean(review.bling_pedido_venda_id);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/faturamento/fiscal/${encodeURIComponent(orderId)}/bling-pedido`,
        { method: "POST", credentials: "include" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        data?: {
          pedido_venda_id: number;
          created: boolean;
          products_created: number;
          products_linked: number;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao preparar o pedido no Bling");
      if (!json.data) throw new Error("Resposta inválida");
      return json.data;
    },
    onSuccess: (data) => {
      toast.success(
        data.created
          ? `Cliente, produtos e pedido criados no Bling (#${data.pedido_venda_id}). Já pode emitir a nota.`
          : `Cliente, produtos e pedido Bling #${data.pedido_venda_id} actualizados. Já pode emitir a nota.`
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
    <div
      className={cn(
        "print:hidden rounded-md border px-3 py-3 text-sm",
        prepared
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-sky-200 bg-sky-50 text-sky-950",
        className
      )}
    >
      <p className="font-semibold">
        {prepared
          ? `Pedido Bling #${review.bling_pedido_venda_id} pronto para emitir`
          : "Criar e actualizar pedido no Bling"}
      </p>
      <p className="mt-1 text-xs opacity-90">
        Espelha este pedido no Bling: cliente (CNPJ e endereço), produtos com NCM,
        itens, parcelas, frete (CIF/FOB) e transportadora. «Emitir nota» gera a
        NF-e <strong>a partir desse mesmo pedido</strong> no Bling — não cria uma
        nota solta. Se a nota for rejeitada, apagamos e voltamos a gerar no pedido.
      </p>
      <ul className="mt-2 space-y-0.5 text-xs">
        <li>
          Produtos vinculados: {mapped}/{withProduct}
        </li>
        {review.bling_pedido_prepared_at ? (
          <li>
            Última preparação: {formatShortDate(review.bling_pedido_prepared_at)}
          </li>
        ) : null}
      </ul>
      <Button
        type="button"
        size="sm"
        className="mt-3"
        disabled={!canPrepare || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        Criar e actualizar pedido no Bling
      </Button>
    </div>
  );
}
