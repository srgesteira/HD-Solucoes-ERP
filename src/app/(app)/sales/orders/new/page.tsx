"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/hooks/use-me";
import { SalesOrderForm } from "@/components/sales/sales-order-form";
import { AppPage } from "@/shared/ui/app-page";
import { LoadingState } from "@/shared/ui/page-helpers";

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
    return <LoadingState label="A verificar permissões…" />;
  }

  return (
    <AppPage
      backHref="/sales/orders"
      backLabel="Lista de pedidos"
      width="wide"
      density="comfortable"
      title={
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-6 w-6 text-brand-700" aria-hidden />
          <span>Novo pedido de venda</span>
        </div>
      }
      description={
        <>
          Também pode criar pedidos convertendo um{" "}
          <Link href="/sales/quotes" className="text-brand-700 underline">
            orçamento aprovado
          </Link>
          .
        </>
      }
    >
      <SalesOrderForm
        mode="create"
        cancelHref="/sales/orders"
        requireAdminForCreate
        isAdmin={isAdmin}
        onSaved={(id) => router.push(`/sales/orders/${id}`)}
      />
    </AppPage>
  );
}
