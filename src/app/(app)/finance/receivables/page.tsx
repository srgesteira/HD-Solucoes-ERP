"use client";

import { AppPage } from "@/shared/ui/app-page";
import { ReceivablesPanel } from "@/components/finance/receivables-panel";

export default function FinanceReceivablesPage() {
  return (
    <AppPage
      title="Contas a receber"
      description="Cronograma financeiro — títulos por vencimento e estado."
      density="comfortable"
      width="wide"
    >
      <ReceivablesPanel />
    </AppPage>
  );
}
