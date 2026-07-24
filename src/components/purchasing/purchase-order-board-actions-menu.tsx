"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Eye,
  FileDown,
  Mail,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/shared/ui/row-actions-menu";

type Props = {
  orderId: string;
  poNumber: string;
  status: string;
  canPurchasing?: boolean;
};

async function putOrderStatus(orderId: string, status: string): Promise<void> {
  const res = await fetch(`/api/purchasing/orders/${orderId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar estado");
}

export function PurchaseOrderBoardActionsMenu({
  orderId,
  poNumber,
  status,
  canPurchasing = false,
}: Props) {
  const router = useRouter();
  const qc = useQueryClient();

  const invalidateOrders = async () => {
    await qc.invalidateQueries({ queryKey: ["purchasing-orders-board"] });
    await qc.invalidateQueries({ queryKey: ["purchasing-orders"] });
    await qc.invalidateQueries({ queryKey: ["purchasing-order", orderId] });
    await qc.invalidateQueries({
      queryKey: ["purchasing-order-header", orderId],
    });
  };

  const downloadPdf = async () => {
    try {
      const res = await fetch(`/api/purchasing/orders/${orderId}/pdf`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Erro ao gerar PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pedido-${poNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado com sucesso.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
    }
  };

  const sendToSupplier = async () => {
    try {
      const res = await fetch(`/api/purchasing/orders/${orderId}/email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        simulated?: boolean;
        message?: string;
        warning?: string | null;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao enviar e-mail");
      if (json.simulated) {
        toast.info(json.message ?? "E-mail enviado (simulado).");
      } else if (json.warning) {
        toast.warning(json.warning);
      } else {
        toast.success(json.message ?? "E-mail enviado ao fornecedor.");
      }
      await invalidateOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar e-mail");
    }
  };

  const setStatus = async (next: string, label: string) => {
    try {
      await putOrderStatus(orderId, next);
      toast.success(`Estado actualizado para ${label}.`);
      await invalidateOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao actualizar estado");
    }
  };

  const st = status.toLowerCase();
  const canMarkSent = canPurchasing && st === "draft";
  const canMarkConfirmed =
    canPurchasing && (st === "draft" || st === "sent");

  const items: RowActionItem[] = [
    {
      id: "view",
      label: "Abrir pedido",
      icon: <Eye className="h-4 w-4" />,
      onClick: () => router.push(`/purchasing/orders/${orderId}`),
    },
    {
      id: "mark-sent",
      label: "Marcar como enviado",
      icon: <Send className="h-4 w-4" />,
      onClick: () => void setStatus("sent", "Enviado"),
      hidden: !canMarkSent,
    },
    {
      id: "mark-confirmed",
      label: "Marcar como confirmado",
      icon: <CheckCircle2 className="h-4 w-4" />,
      onClick: () => void setStatus("confirmed", "Confirmado"),
      hidden: !canMarkConfirmed,
    },
    {
      id: "pdf",
      label: "Gerar PDF",
      icon: <FileDown className="h-4 w-4" />,
      onClick: () => void downloadPdf(),
    },
    {
      id: "email",
      label: "Enviar para fornecedor",
      icon: <Mail className="h-4 w-4" />,
      onClick: () => void sendToSupplier(),
      hidden: !canPurchasing || st === "cancelled" || st === "received",
    },
  ];

  return <RowActionsMenu items={items} menuWidth={240} />;
}
