"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import { PurchaseOrderForm } from "@/components/purchasing/purchase-order-form";

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canCreate = !meLoading && (isAdmin || can("purchasing"));

  useEffect(() => {
    if (!canCreate && !meLoading) {
      toast.error("Sem permissão para criar pedidos de compra.");
      router.replace("/purchasing/orders");
    }
  }, [canCreate, meLoading, router]);

  if (meLoading || !canCreate) {
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
            Voltar
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          Novo pedido de compra
        </h1>
      </div>

      <PurchaseOrderForm
        mode="create"
        cancelHref="/purchasing/orders"
        onSaved={(id) => router.push(`/purchasing/orders/${id}`)}
      />
    </div>
  );
}
