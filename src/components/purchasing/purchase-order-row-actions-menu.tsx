"use client";

import { Ban, Edit, Eye, Printer } from "lucide-react";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/ui/row-actions-menu";

type PurchaseOrderStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "partial"
  | "received"
  | "cancelled";

type Props = {
  orderId: string;
  status: string;
  isAdmin: boolean;
  canPurchasing: boolean;
  onView: () => void;
  onEdit: () => void;
  onPrint: () => void;
  onCancel: () => void;
};

const EDITABLE_STATUSES = new Set<PurchaseOrderStatus>(["draft", "sent"]);

export function PurchaseOrderRowActionsMenu({
  orderId,
  status,
  isAdmin,
  canPurchasing,
  onView,
  onEdit,
  onPrint,
  onCancel,
}: Props) {
  const st = status as PurchaseOrderStatus;
  const canEdit =
    canPurchasing &&
    EDITABLE_STATUSES.has(st) &&
    st !== "received" &&
    st !== "cancelled";
  const canCancel =
    isAdmin && st !== "cancelled" && st !== "received";

  const items: RowActionItem[] = [
    {
      id: "view",
      label: "Ver detalhes",
      icon: <Eye className="h-4 w-4" />,
      onClick: onView,
    },
    {
      id: "print",
      label: "Imprimir / PDF",
      icon: <Printer className="h-4 w-4" />,
      onClick: onPrint,
    },
    {
      id: "edit",
      label: "Editar",
      icon: <Edit className="h-4 w-4" />,
      onClick: onEdit,
      hidden: !canEdit,
    },
    {
      id: "cancel",
      label: "Cancelar pedido",
      icon: <Ban className="h-4 w-4" />,
      onClick: onCancel,
      variant: "danger",
      hidden: !canCancel,
    },
  ];

  void orderId;
  return <RowActionsMenu items={items} menuWidth={208} />;
}
