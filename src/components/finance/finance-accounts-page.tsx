"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { AppPage } from "@/shared/ui/app-page";
import { usePermissions } from "@/hooks/use-permissions";
import { FinanceMovementsTab } from "@/components/finance/finance-movements-tab";
import { PayablesPanel } from "@/components/finance/payables-panel";
import { ReceivablesPanel } from "@/components/finance/receivables-panel";
import { CashFlowPanel } from "@/components/finance/cash-flow-panel";

type TabValue = "movimentacao" | "pagar" | "receber" | "fluxo";

const TAB_OPTIONS: Array<{ value: TabValue; label: string }> = [
  { value: "movimentacao", label: "Movimentação" },
  { value: "pagar", label: "Contas a Pagar" },
  { value: "receber", label: "Contas a Receber" },
  { value: "fluxo", label: "Fluxo Futuro" },
];

function parseTab(raw: string | null): TabValue {
  if (raw === "pagar" || raw === "receber" || raw === "fluxo") return raw;
  return "movimentacao";
}

export function FinanceAccountsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, isLoading: permLoading } = usePermissions();

  const canView = !permLoading && can("finance");

  const [activeTab, setActiveTab] = useState<TabValue>(() =>
    parseTab(searchParams.get("tab"))
  );

  useEffect(() => {
    setActiveTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    if (permLoading) return;
    if (!canView) {
      toast.error("Sem acesso ao módulo Financeiro.");
      router.replace("/dashboard");
    }
  }, [permLoading, canView, router]);

  const onTabChange = (value: string) => {
    const tab = parseTab(value);
    setActiveTab(tab);
    router.replace(`/finance/contas?tab=${tab}`, { scroll: false });
  };

  if (!permLoading && !canView) {
    return null;
  }

  return (
    <AppPage
      title="Financeiro"
      description="Movimentação, contas a pagar e receber, e projeção de fluxo."
      density="comfortable"
      width="wide"
    >
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {TAB_OPTIONS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="movimentacao" className="mt-4">
          <FinanceMovementsTab />
        </TabsContent>

        <TabsContent value="pagar" className="mt-4">
          <PayablesPanel embedded />
        </TabsContent>

        <TabsContent value="receber" className="mt-4">
          <ReceivablesPanel embedded />
        </TabsContent>

        <TabsContent value="fluxo" className="mt-4">
          <CashFlowPanel embedded />
        </TabsContent>
      </Tabs>
    </AppPage>
  );
}
