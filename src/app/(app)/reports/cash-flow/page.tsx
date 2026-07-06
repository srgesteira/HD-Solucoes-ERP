"use client";

import { Wallet } from "lucide-react";
import { AppPage } from "@/shared/ui/app-page";
import { CashFlowPanel } from "@/components/finance/cash-flow-panel";

export default function CashFlowReportPage() {
  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-brand-700" />
          Fluxo de caixa projectado
        </span>
      }
      description="Entradas por contas a receber (pendente/parcial) e saídas por pedidos de compra confirmados. Saldo acumulado no horizonte seleccionado."
      density="comfortable"
    >
      <CashFlowPanel />
    </AppPage>
  );
}
