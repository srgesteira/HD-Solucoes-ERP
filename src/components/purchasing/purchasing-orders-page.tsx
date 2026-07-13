"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FileUp, Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { AppPage } from "@/shared/ui/app-page";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import { OpenOrdersTab } from "@/components/purchasing/open-orders-tab";
import { AllOrdersTab } from "@/components/purchasing/all-orders-tab";
import { FinishedOrdersTab } from "@/components/purchasing/finished-orders-tab";
import { RequisitionsTab } from "@/components/purchasing/requisitions-tab";
import { RequestQuoteTab } from "@/components/purchasing/request-quote-tab";
import {
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import {
  fetchRequisitionsCount,
  requisitionsCountQueryKey,
} from "@/components/purchasing/purchase-requisitions-panel";

type TabValue = "all" | "open" | "finished" | "requisitions" | "request-quote";

function parseTab(raw: string | null): TabValue {
  if (
    raw === "all" ||
    raw === "finished" ||
    raw === "requisitions" ||
    raw === "request-quote"
  ) {
    return raw;
  }
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
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();

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
    <AppPage
      title="Compras"
      description="Cronograma operacional — prazos, pedidos, requisições e cotações."
      density="comfortable"
      width="wide"
      actions={
        canPurchasing ? (
          <>
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
          </>
        ) : null
      }
    >
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="all">Todos</TabsTrigger>
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
          <TabsTrigger value="request-quote">Solicitar orçamento</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <CronogramaSearch
            value={searchInput}
            onChange={setSearchInput}
            placeholder={
              activeTab === "requisitions"
                ? "Buscar produto, fornecedor, PV, OP, data ou código…"
                : activeTab === "request-quote"
                  ? "Buscar item, fornecedor ou código no histórico…"
                  : "Buscar pedido, fornecedor, data, código ou produto…"
            }
          />
        </div>

        <TabsContent value="all" className="mt-4">
          <AllOrdersTab search={search} canPurchasing={canPurchasing} />
        </TabsContent>

        <TabsContent value="open" className="mt-4">
          <OpenOrdersTab search={search} canPurchasing={canPurchasing} />
        </TabsContent>

        <TabsContent value="finished" className="mt-4">
          <FinishedOrdersTab search={search} canPurchasing={canPurchasing} />
        </TabsContent>

        <TabsContent value="requisitions" className="mt-4">
          <RequisitionsTab search={search} />
        </TabsContent>

        <TabsContent value="request-quote" className="mt-4">
          <RequestQuoteTab search={search} />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-slate-500 text-center pb-6">
        <Link href="/boards" className="text-brand-700 underline">
          Voltar às tarefas
        </Link>
      </p>
    </AppPage>
  );
}
