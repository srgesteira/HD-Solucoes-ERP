"use client";

import { cn } from "@/shared/utils/cn";
import {
  deriveProductLifecycle,
  PRODUCT_LIFECYCLE_BADGE_CLASS,
  PRODUCT_LIFECYCLE_LABELS,
  prefixCodeFromJoin,
  type ProductLifecycleInput,
} from "@/modules/engenharia/lib/products/product-lifecycle";

type Props = ProductLifecycleInput & {
  prefix?: Parameters<typeof prefixCodeFromJoin>[0];
  className?: string;
};

export function ProductLifecycleBadge({
  prefix,
  prefix_code,
  className,
  ...flags
}: Props) {
  const lifecycle = deriveProductLifecycle({
    ...flags,
    prefix_code: prefix_code ?? prefixCodeFromJoin(prefix) ?? null,
  });

  if (!lifecycle) return null;

  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        PRODUCT_LIFECYCLE_BADGE_CLASS[lifecycle],
        className
      )}
      title={`Ciclo: ${PRODUCT_LIFECYCLE_LABELS[lifecycle]}`}
    >
      {PRODUCT_LIFECYCLE_LABELS[lifecycle]}
    </span>
  );
}
