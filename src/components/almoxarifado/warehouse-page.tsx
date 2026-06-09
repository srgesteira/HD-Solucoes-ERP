"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Package, Truck } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { ModulePlaceholder } from "@/components/placeholders/module-placeholder";
import { StockOperationsTab } from "@/components/almoxarifado/stock-operations-tab";
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
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Almoxarifado</h2>
        <p className="text-sm text-slate-500 mt-1">
          Extrato de movimentações, saldos e abastecimento de produção.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="operacoes">Operações de estoque</TabsTrigger>
          <TabsTrigger value="inventario">Inventário</TabsTrigger>
          <TabsTrigger value="abastecimento">Abastecimento</TabsTrigger>
        </TabsList>

        <TabsContent value="operacoes" className="mt-4">
          <StockOperationsTab />
        </TabsContent>

        <TabsContent value="inventario" className="mt-4">
          <div className="space-y-4">
            <ModulePlaceholder
              title="Inventário"
              icon={Package}
              description="Em breve — consulta e ajuste de saldos integrados ao almoxarifado."
            />
            <p className="text-center text-sm text-slate-600">
              Enquanto isso, use a tela de saldos em{" "}
              <Link
                href="/inventory"
                className="font-medium text-brand-700 underline hover:text-brand-900"
              >
                Estoque (inventário)
              </Link>
              .
            </p>
          </div>
        </TabsContent>

        <TabsContent value="abastecimento" className="mt-4">
          <ModulePlaceholder
            title="Abastecimento"
            icon={Truck}
            description="Em breve — saídas de material para produção e consumo de estoque."
          />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-slate-500 text-center pb-6">
        <Link href="/logistics/pcp" className="text-brand-700 underline">
          Voltar ao PCP
        </Link>
      </p>
    </div>
  );
}
