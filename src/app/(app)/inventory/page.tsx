"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { AppPage } from "@/shared/ui/app-page";
import { InventoryBalancesTable } from "@/components/almoxarifado/inventory-balances-table";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";

export default function InventoryPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const { can, isLoading: permLoading } = usePermissions();

  const canView =
    me?.role === "admin" || (!permLoading && can("inventory"));
  const canAdjust = me?.role === "admin";

  useEffect(() => {
    if (meLoading || permLoading) return;
    if (!me) return;
    if (!canView) {
      toast.error("Sem permissão para consultar estoque.");
      router.replace("/dashboard");
      return;
    }
  }, [me, meLoading, permLoading, canView, router]);

  if (!meLoading && !permLoading && !canView) {
    return null;
  }

  return (
    <AppPage
      title="Estoque"
      description="Saldos por produto e movimentações de almoxarifado"
      backHref="/products"
      backLabel="Produtos"
      width="default"
      density="comfortable"
      actions={
        canAdjust ? (
          <Link href="/inventory/adjust">
            <Button type="button" size="sm">
              Ajustar estoque
            </Button>
          </Link>
        ) : null
      }
    >
      <InventoryBalancesTable canAdjust={false} />
    </AppPage>
  );
}
