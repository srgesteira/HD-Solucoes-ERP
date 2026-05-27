"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import { PurchaseOrderForm } from "@/components/purchasing/purchase-order-form";

export default function EditPurchaseOrderPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params.id;
  const orderId =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : null;

  const { data: me, isLoading: meLoading } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canEdit = !meLoading && (isAdmin || can("purchasing"));

  useEffect(() => {
    if (!canEdit && !meLoading) {
      toast.error("Sem permissão para editar pedidos de compra.");
      router.replace(
        orderId ? `/purchasing/orders/${orderId}` : "/purchasing/orders"
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
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/purchasing/orders">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar à listagem
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          Editar pedido de compra
        </h1>
      </div>

      <PurchaseOrderForm
        mode="edit"
        orderId={orderId}
        cancelHref="/purchasing/orders"
        onSaved={(id) => router.push(`/purchasing/orders/${id}`)}
      />
    </div>
  );
}
