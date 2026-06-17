"use client";

import { AppPage } from "@/shared/ui/app-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

export default function NewProductionOrderPage() {
  return (
    <AppPage
      title="Novo pedido de produção"
      backHref="/production/orders"
      width="narrow"
      density="comfortable"
    >
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Em desenvolvimento</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            O formulário de criação de pedidos será implementado em seguida.
          </p>
        </CardContent>
      </Card>
    </AppPage>
  );
}
