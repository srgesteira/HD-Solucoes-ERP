"use client";

import { useRouter } from "next/navigation";
import { Edit, Layers, Trash2 } from "lucide-react";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/ui/row-actions-menu";

type Props = {
  productId: string;
  productType: string;
  onDeactivate: () => void;
  onHardDelete: () => void;
};

export function ProductRowActionsMenu({
  productId,
  productType,
  onDeactivate,
  onHardDelete,
}: Props) {
  const router = useRouter();

  const items: RowActionItem[] = [
    {
      id: "edit",
      label: "Editar",
      icon: <Edit className="h-4 w-4" />,
      onClick: () => router.push(`/products/${productId}/edit`),
    },
    {
      id: "bom",
      label: "Estrutura (BOM)",
      icon: <Layers className="h-4 w-4" />,
      onClick: () => router.push(`/products/${productId}/structure`),
      hidden: productType !== "finished",
    },
    {
      id: "deactivate",
      label: "Marcar como inativo",
      onClick: onDeactivate,
    },
    {
      id: "delete",
      label: "Excluir permanentemente",
      icon: <Trash2 className="h-4 w-4" />,
      onClick: onHardDelete,
      variant: "danger",
    },
  ];

  return <RowActionsMenu items={items} menuWidth={208} />;
}
