"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-me";
import { SalesOrderForm } from "@/components/sales/sales-order-form";

export default function SalesOrderNewPage() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();
  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (isLoading) return;
    if (!isAdmin) {
      toast.error("Apenas administradores podem criar pedidos de venda.");
      router.replace("/sales/orders");
    }
  }, [isLoading, isAdmin, router]);

  if (isLoading || !isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-16 flex items-center justify-center gap-2 text-slate-600">
        <span className="text-sm">A verificar permissões…</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/sales/orders">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Lista de pedidos
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <ShoppingBag className="h-6 w-6" />
          Novo pedido de venda
        </h1>
      </div>

      <p className="text-sm text-slate-600">
        Também pode criar pedidos convertendo um{" "}
        <Link href="/sales/quotes" className="text-brand-700 underline">
          orçamento aprovado
        </Link>
        .
      </p>

      <SalesOrderForm
        mode="create"
        cancelHref="/sales/orders"
        requireAdminForCreate
        isAdmin={isAdmin}
        onSaved={(id) => router.push(`/sales/orders/${id}`)}
      />
    </div>
  );
}
