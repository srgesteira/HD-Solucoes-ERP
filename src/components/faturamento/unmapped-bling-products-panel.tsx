"use client";

import { CreateBlingProductButton } from "@/components/faturamento/create-bling-product-button";
import type { FiscalOrderReviewItem } from "@/modules/faturamento/lib/fiscal-order-review-service";
import { uniqueUnmappedBlingItems } from "@/modules/faturamento/lib/unmapped-bling-products";
import { cn } from "@/shared/utils/cn";

type Props = {
  orderId: string;
  invoiceDocumentType: string | null;
  items: FiscalOrderReviewItem[];
  className?: string;
};

export function UnmappedBlingProductsPanel({
  orderId,
  invoiceDocumentType,
  items,
  className,
}: Props) {
  const unmapped = uniqueUnmappedBlingItems(items, invoiceDocumentType);
  if (!unmapped.length) return null;

  return (
    <div
      className={cn(
        "print:hidden rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900",
        className
      )}
    >
      <p className="font-semibold">
        {unmapped.length === 1
          ? "1 produto sem cadastro no Bling"
          : `${unmapped.length} produtos sem cadastro no Bling`}
      </p>
      <p className="mt-0.5 text-xs text-red-800/90">
        Cria SKU, nome, unidade e NCM da conferência. O pedido completo
        (cliente + itens + CFOP) fica no botão «Preparar pedido no Bling».
      </p>
      <ul className="mt-2 space-y-2">
        {unmapped.map((it) => (
          <li
            key={it.product_id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              <span className="font-medium">
                {it.product_code || "sem SKU"}
              </span>
              {it.product_name ? ` — ${it.product_name}` : ""}
            </span>
            <CreateBlingProductButton
              orderId={orderId}
              productId={it.product_id!}
              sku={it.product_code}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
