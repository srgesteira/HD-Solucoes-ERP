"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { AppPage } from "@/shared/ui/app-page";
import { InventoryBalancesTable } from "@/components/almoxarifado/inventory-balances-table";
import { StockOperationsTab } from "@/components/almoxarifado/stock-operations-tab";
import { SupplyTab } from "@/components/almoxarifado/supply-tab";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";

type TabValue = "operacoes" | "inventario" | "abastecimento";

function parseTab(raw: string | null): TabValue {
  if (raw === "inventario" || raw === "abastecimento") return raw;
  return "operacoes";
}

export function WarehousePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: me, isLoading: meLoading } = useMe();
  const { can, isLoading: permLoading } = usePermissions();

  const canView =
    me?.role === "admin" || (!permLoading && can("inventory"));
  const canAdjust = me?.role === "admin";

  const [activeTab, setActiveTab] = useState<TabValue>(() =>
    parseTab(searchParams.get("tab"))
  );

  useEffect(() => {
    setActiveTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    if (meLoading || permLoading) return;
    if (!me) return;
    if (!canView) {
      toast.error("Sem permissão para consultar o almoxarifado.");
      router.replace("/dashboard");
    }
  }, [me, meLoading, permLoading, canView, router]);

  const onTabChange = (value: string) => {
    const tab = parseTab(value);
    setActiveTab(tab);
    router.replace(`/logistics/warehouse?tab=${tab}`, { scroll: false });
  };

  if (!meLoading && !permLoading && !canView) {
    return null;
  }

  return (
    <AppPage
      title="Almoxarifado"
      description="Extrato de movimentações, saldos e abastecimento de produção."
      density="comfortable"
      width="wide"
    >
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="operacoes">Operações de estoque</TabsTrigger>
          <TabsTrigger value="inventario">Inventário</TabsTrigger>
          <TabsTrigger value="abastecimento">Abastecimento</TabsTrigger>
        </TabsList>

        <TabsContent value="operacoes" className="mt-4">
          <StockOperationsTab canManageMovements={canAdjust} />
        </TabsContent>

        <TabsContent value="inventario" className="mt-4">
          <InventoryBalancesTable canAdjust={canAdjust} />
        </TabsContent>

        <TabsContent value="abastecimento" className="mt-4">
          <SupplyTab />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-slate-500 text-center">
        <Link href="/logistics/pcp" className="text-brand-700 underline">
          Voltar ao PCP
        </Link>
      </p>
    </AppPage>
  );
}
