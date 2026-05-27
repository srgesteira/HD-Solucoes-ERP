"use client";

import { useRouter } from "next/navigation";
import { Edit, FileDown, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/ui/row-actions-menu";

type Props = {
  orderId: string;
  poNumber: string;
  canPurchasing?: boolean;
};

export function PurchaseOrderBoardActionsMenu({
  orderId,
  poNumber,
  canPurchasing = false,
}: Props) {
  const router = useRouter();

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar e-mail");
    }
  };

  const items: RowActionItem[] = [
    {
      id: "edit",
      label: "Editar pedido",
      icon: <Edit className="h-4 w-4" />,
      onClick: () => router.push(`/purchasing/orders/${orderId}/edit`),
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
      hidden: !canPurchasing,
    },
  ];

  return <RowActionsMenu items={items} menuWidth={220} />;
}
