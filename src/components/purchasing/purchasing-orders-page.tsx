"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FileUp, Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import { OpenOrdersTab } from "@/components/purchasing/open-orders-tab";
import { FinishedOrdersTab } from "@/components/purchasing/finished-orders-tab";
import { RequisitionsTab } from "@/components/purchasing/requisitions-tab";
import {
  fetchRequisitionsCount,
  requisitionsCountQueryKey,
} from "@/components/purchasing/purchase-requisitions-panel";

type TabValue = "open" | "finished" | "requisitions";

function parseTab(raw: string | null): TabValue {
  if (raw === "finished" || raw === "requisitions") return raw;
  if (raw === "schedule" || raw === "orders") return "open";
  return "open";
}

export function PurchasingOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: me } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canPurchasing = isAdmin || can("purchasing");

  const [activeTab, setActiveTab] = useState<TabValue>(() =>
    parseTab(searchParams.get("tab"))
  );

  useEffect(() => {
    setActiveTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  const pendingReqQ = useQuery({
    queryKey: requisitionsCountQueryKey,
    queryFn: fetchRequisitionsCount,
    refetchInterval: 30_000,
    retry: 2,
  });
  const pendingRequisitions =
    typeof pendingReqQ.data === "number" ? pendingReqQ.data : 0;

  const onTabChange = (value: string) => {
    const tab = parseTab(value);
    setActiveTab(tab);
    router.replace(`/purchasing/orders?tab=${tab}`, { scroll: false });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Compras</h2>
          <p className="text-sm text-slate-500 mt-1">
            Cronograma operacional — prazos, pedidos em aberto e requisições MRP.
          </p>
        </div>
        {canPurchasing ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/purchasing/invoices/reconcile")}
            >
              <FileUp className="h-4 w-4" />
              Importar NF-e
            </Button>
            {isAdmin ? (
              <Button
                type="button"
                size="sm"
                onClick={() => router.push("/purchasing/orders/new")}
              >
                <Plus className="h-4 w-4" />
                Novo pedido de compra
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="open">Pedidos em aberto</TabsTrigger>
          <TabsTrigger value="finished">Pedidos faturados</TabsTrigger>
          <TabsTrigger
            value="requisitions"
            className={cn(
              pendingRequisitions > 0 &&
                "animate-pulse text-red-600 font-semibold data-[state=active]:text-red-700"
            )}
          >
            Requisições de compras
            {pendingRequisitions > 0 ? ` (${pendingRequisitions})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          <OpenOrdersTab canPurchasing={canPurchasing} />
        </TabsContent>

        <TabsContent value="finished" className="mt-4">
          <FinishedOrdersTab canPurchasing={canPurchasing} />
        </TabsContent>

        <TabsContent value="requisitions" className="mt-4">
          <RequisitionsTab />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-slate-500 text-center pb-6">
        <Link href="/boards" className="text-brand-700 underline">
          Voltar às tarefas
        </Link>
      </p>
    </div>
  );
}
