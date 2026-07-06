"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { AppPage } from "@/shared/ui/app-page";
import {
  PayablesPanel,
  PayablesPanelNewButton,
} from "@/components/finance/payables-panel";

export default function FinancePayablesPage() {
  const [showNew, setShowNew] = useState(false);

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-brand-700" />
          Contas a pagar
        </span>
      }
      description="Cronograma financeiro — fornecedores, vencimentos e baixas."
      density="comfortable"
      width="wide"
      actions={<PayablesPanelNewButton onClick={() => setShowNew(true)} />}
    >
      <PayablesPanel showNew={showNew} onShowNewChange={setShowNew} />
    </AppPage>
  );
}
