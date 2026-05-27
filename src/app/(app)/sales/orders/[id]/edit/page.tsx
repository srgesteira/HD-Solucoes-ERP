"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import { SalesOrderForm } from "@/components/sales/sales-order-form";

export default function SalesOrderEditPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params.id;
  const orderId =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : null;

  const { data: me, isLoading: meLoading } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canEdit = !meLoading && (isAdmin || can("sales"));

  useEffect(() => {
    if (!canEdit && !meLoading) {
      toast.error("Sem permissão para editar pedidos de venda.");
      router.replace(
        orderId ? `/sales/orders/${orderId}` : "/sales/orders"
      );
    }
  }, [canEdit, meLoading, orderId, router]);

  if (!orderId) {
    return (
      <p className="text-sm text-red-700 text-center py-8">Pedido inválido.</p>
    );
  }

  if (meLoading || !canEdit) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 text-slate-500">
        <span className="text-sm">A validar permissões…</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <Link href={`/sales/orders/${orderId}`}>
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao pedido
          </Button>
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Editar pedido de venda
        </h1>
      </div>

      <SalesOrderForm
        mode="edit"
        orderId={orderId}
        cancelHref={`/sales/orders/${orderId}`}
        isAdmin={isAdmin}
        onSaved={(id) => router.push(`/sales/orders/${id}`)}
      />
    </div>
  );
}
