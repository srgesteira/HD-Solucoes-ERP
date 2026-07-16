"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { AppPage } from "@/shared/ui/app-page";
import { Button } from "@/shared/ui/button";
import { CronogramaSearch, useCronogramaSearch } from "@/shared/ui/cronograma-layout";
import { FiscalInboundKanban } from "@/components/faturamento/fiscal-inbound-kanban";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";

export default function FiscalInboundPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { canMenu } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canFaturamento = isAdmin || canMenu("faturamento");
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();

  if (!canFaturamento) {
    return (
      <AppPage
        title="Fiscal de entrada"
        description="Kanban de conferência fiscal de compras."
        width="wide"
      >
        <p className="text-slate-600 py-12 text-center">
          Sem permissão para aceder ao módulo Faturamento.
        </p>
      </AppPage>
    );
  }

  return (
    <AppPage
      title="Fiscal de entrada"
      description="Kanban compra → conferência → concretização (estoque + AP)."
      width="wide"
      density="comfortable"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push("/faturamento/fiscal")}
          >
            Kanban de saída
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push("/settings/fiscal-rules")}
          >
            <FileText className="h-4 w-4" />
            Regras fiscais
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <CronogramaSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Buscar nº do pedido de compra…"
        />
        <FiscalInboundKanban search={search} enabled={canFaturamento} />
        <p className="text-center text-sm text-slate-500">
          <Link
            href="/purchasing/orders"
            className="text-emerald-700 hover:underline"
          >
            Pedidos de compra
          </Link>
          {" · "}
          <Link
            href="/purchasing/invoices/reconcile"
            className="text-emerald-700 hover:underline"
          >
            Importar NF-e (PDF/XML)
          </Link>
        </p>
      </div>
    </AppPage>
  );
}
