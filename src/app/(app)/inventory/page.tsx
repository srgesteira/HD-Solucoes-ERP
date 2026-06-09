"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
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
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/products">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Produtos
          </Button>
        </Link>
        {canAdjust ? (
          <Link href="/inventory/adjust">
            <Button type="button" size="sm">
              Ajustar estoque
            </Button>
          </Link>
        ) : null}
      </div>

      <InventoryBalancesTable canAdjust={false} />
    </div>
  );
}
