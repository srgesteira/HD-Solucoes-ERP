"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { SalesOrderPrintDocument } from "@/components/sales/sales-order-print-document";
import type { SalesOrderPrintData } from "@/modules/vendas/lib/sales/sales-order-print-display";
import type { Tables } from "@/modules/core/types/database";

async function fetchOrder(id: string): Promise<SalesOrderPrintData> {
  const res = await fetch(`/api/sales/orders/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: SalesOrderPrintData;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar pedido");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function fetchCompanyBranding(): Promise<Tables<"company_settings"> | null> {
  const res = await fetch("/api/company/settings", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: Tables<"company_settings"> | null;
  };
  if (!res.ok) return null;
  return json.data ?? null;
}

export default function SalesOrderPrintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const fromFiscal = searchParams.get("from") === "fiscal";

  const orderQuery = useQuery({
    queryKey: ["sales-order-print", id],
    queryFn: () => fetchOrder(id),
    enabled: Boolean(id),
  });

  const companyQuery = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanyBranding,
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!orderQuery.data) return;
    const t = window.setTimeout(() => {
      if (
        typeof window !== "undefined" &&
        window.location.search.includes("auto=1")
      ) {
        window.print();
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [orderQuery.data]);

  const backHref = fromFiscal
    ? `/faturamento/fiscal/${id}`
    : id
      ? `/sales/orders/${id}`
      : "/sales/orders";
  const backLabel = fromFiscal ? "Voltar ao faturamento" : "Voltar ao pedido";

  return (
    <div className="so-print-page min-h-screen bg-slate-100 print:bg-white">
      <div className="so-print-toolbar print:hidden sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref}>
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Button>
        </Link>
        <Button
          type="button"
          size="sm"
          onClick={() => window.print()}
          disabled={!orderQuery.data}
        >
          <Printer className="h-4 w-4" />
          Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="p-4 lg:p-8 print:p-0">
        {orderQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            A preparar documento…
          </div>
        ) : orderQuery.error ? (
          <p className="text-center text-red-700 text-sm py-12">
            {orderQuery.error instanceof Error
              ? orderQuery.error.message
              : "Erro ao carregar"}
          </p>
        ) : orderQuery.data ? (
          <SalesOrderPrintDocument
            order={orderQuery.data}
            company={companyQuery.data ?? null}
            className="mx-auto max-w-[210mm] shadow-lg print:shadow-none p-6 sm:p-8 print:p-0 bg-white"
          />
        ) : null}
      </div>
    </div>
  );
}
