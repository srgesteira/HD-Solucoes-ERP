"use client";

import { useRouter } from "next/navigation";
import { Ban, Edit, Eye, RotateCcw, Trash2 } from "lucide-react";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/shared/ui/row-actions-menu";

type Props = {
  orderId: string;
  canEdit: boolean;
  canCancel: boolean;
  canDelete: boolean;
  canReactivate: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onReactivate: () => void;
};

export function SalesOrderRowActionsMenu({
  orderId,
  canEdit,
  canCancel,
  canDelete,
  canReactivate,
  onCancel,
  onDelete,
  onReactivate,
}: Props) {
  const router = useRouter();

  const items: RowActionItem[] = [
    {
      id: "view",
      label: "Visualizar",
      icon: <Eye className="h-4 w-4" />,
      onClick: () => router.push(`/sales/orders/${orderId}`),
    },
    {
      id: "edit",
      label: "Editar",
      icon: <Edit className="h-4 w-4" />,
      onClick: () => router.push(`/sales/orders/${orderId}/edit`),
      hidden: !canEdit,
    },
    {
      id: "cancel",
      label: "Cancelar",
      icon: <Ban className="h-4 w-4" />,
      onClick: onCancel,
      variant: "danger",
      hidden: !canCancel,
    },
    {
      id: "reactivate",
      label: "Reativar",
      icon: <RotateCcw className="h-4 w-4" />,
      onClick: onReactivate,
      variant: "success",
      hidden: !canReactivate,
    },
    {
      id: "delete",
      label: "Excluir",
      icon: <Trash2 className="h-4 w-4" />,
      onClick: onDelete,
      variant: "danger",
      hidden: !canDelete,
    },
  ];

  return <RowActionsMenu items={items} />;
}
