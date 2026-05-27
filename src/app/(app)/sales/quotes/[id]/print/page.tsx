"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuotePrintDocument } from "@/components/sales/quote-print-document";
import type { QuotePrintData } from "@/lib/sales/quote-display";
import type { Tables } from "@/lib/types/database";

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

export default function QuotePrintPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

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

  return (
    <div className="quote-print-page min-h-screen bg-slate-100 print:bg-white">
      <div className="quote-print-toolbar print:hidden sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link href={id ? `/sales/quotes/${id}` : "/sales/quotes"}>
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao orçamento
          </Button>
        </Link>
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
