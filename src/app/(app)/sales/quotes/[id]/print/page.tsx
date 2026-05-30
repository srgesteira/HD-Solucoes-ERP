"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { QuotePrintDocument } from "@/components/sales/quote-print-document";
import type { QuotePrintData } from "@/modules/vendas/lib/sales/quote-display";
import type { Tables } from "@/modules/core/types/database";

async function fetchQuoteDetail(id: string): Promise<QuotePrintData> {
  const res = await fetch(`/api/sales/quotes/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: QuotePrintData;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar orçamento");
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

async function updateShowProductDescriptions(
  id: string,
  show: boolean
): Promise<void> {
  const res = await fetch(`/api/sales/quotes/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ show_product_descriptions: show }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar preferência");
}

export default function QuotePrintPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const queryClient = useQueryClient();

  const quoteQuery = useQuery({
    queryKey: ["sales-quote-print", id],
    queryFn: () => fetchQuoteDetail(id),
    enabled: Boolean(id),
  });

  const companyQuery = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanyBranding,
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const toggleMutation = useMutation({
    mutationFn: (show: boolean) => updateShowProductDescriptions(id, show),
    onSuccess: (_, show) => {
      queryClient.setQueryData(
        ["sales-quote-print", id],
        (prev: QuotePrintData | undefined) =>
          prev ? { ...prev, show_product_descriptions: show } : prev
      );
      void queryClient.invalidateQueries({ queryKey: ["sales-quote", id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useEffect(() => {
    if (!quoteQuery.data) return;
    const t = window.setTimeout(() => {
      if (
        typeof window !== "undefined" &&
        window.location.search.includes("auto=1")
      ) {
        window.print();
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [quoteQuery.data]);

  const handlePrint = () => {
    window.print();
  };

  const showDesc = Boolean(quoteQuery.data?.show_product_descriptions);

  return (
    <div className="quote-print-page min-h-screen bg-slate-100 print:bg-white">
      <div className="quote-print-toolbar print:hidden sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link href={id ? `/sales/quotes/${id}` : "/sales/quotes"}>
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao orçamento
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-700"
              checked={showDesc}
              disabled={!quoteQuery.data || toggleMutation.isPending}
              onChange={(e) => toggleMutation.mutate(e.target.checked)}
            />
            Descrição dos produtos
          </label>
          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            disabled={!quoteQuery.data}
          >
            <Printer className="h-4 w-4" />
            Imprimir / Guardar PDF
          </Button>
        </div>
      </div>

      <div className="p-4 lg:p-8 print:p-0">
        {quoteQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            A preparar documento…
          </div>
        ) : quoteQuery.error ? (
          <p className="text-center text-red-700 text-sm py-12">
            {quoteQuery.error instanceof Error
              ? quoteQuery.error.message
              : "Erro ao carregar"}
          </p>
        ) : quoteQuery.data ? (
          <QuotePrintDocument
            quote={quoteQuery.data}
            company={companyQuery.data ?? null}
            className="mx-auto max-w-[210mm] shadow-lg print:shadow-none p-6 sm:p-8 print:p-0"
          />
        ) : null}
      </div>
    </div>
  );
}
