"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Mail, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { PurchaseOrderPrintDocument } from "@/components/purchasing/purchase-order-print-document";
import {
  poComputedTotal,
  type PurchaseOrderPrintData,
} from "@/modules/compras/lib/purchasing/purchase-order-display";
import { generatePurchaseOrderPdfBlob } from "@/modules/compras/lib/purchasing/generate-purchase-order-pdf-client";
import {
  openPurchaseOrderEmailDraft,
  purchaseOrderEmailDraftHint,
} from "@/modules/compras/lib/purchasing/open-purchase-order-email-draft";
import type { Tables } from "@/modules/core/types/database";

async function fetchOrder(id: string): Promise<PurchaseOrderPrintData> {
  const res = await fetch(`/api/purchasing/orders/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: PurchaseOrderPrintData;
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

export default function PurchaseOrderPrintPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [emailPending, setEmailPending] = useState(false);
  const printWrapRef = useRef<HTMLDivElement>(null);

  const orderQuery = useQuery({
    queryKey: ["purchasing-order-print", id],
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

  return (
    <div className="po-print-page min-h-screen bg-slate-100 print:bg-white">
      <div className="po-print-toolbar print:hidden sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link href={id ? `/purchasing/orders/${id}` : "/purchasing/orders"}>
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao pedido
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!orderQuery.data || emailPending}
            onClick={async () => {
              const order = orderQuery.data;
              if (!order) return;
              setEmailPending(true);
              try {
                const printEl = printWrapRef.current?.querySelector(
                  ".po-print-document"
                ) as HTMLElement | null;
                if (!printEl) {
                  throw new Error("Documento de impressão não encontrado.");
                }
                const filename = `pedido-${order.po_number.replace(/[^\w.\-/]+/g, "_")}.pdf`;
                const pdfBlob = await generatePurchaseOrderPdfBlob({
                  element: printEl,
                  filename,
                });
                const result = await openPurchaseOrderEmailDraft(
                  {
                    orderId: order.id,
                    poNumber: order.po_number,
                    supplierEmail: order.supplier?.email,
                    supplierName: order.supplier?.name,
                    orderDate: order.order_date,
                    expectedDelivery: order.expected_delivery,
                    total: poComputedTotal(order),
                  },
                  { pdfBlob }
                );
                if (result.mode === "eml") {
                  toast.info("Abra o ficheiro .eml descarregado", {
                    description: purchaseOrderEmailDraftHint(result),
                    duration: 16_000,
                  });
                } else {
                  toast.success(purchaseOrderEmailDraftHint(result));
                }
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Erro ao preparar e-mail"
                );
              } finally {
                setEmailPending(false);
              }
            }}
          >
            {emailPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Abrir no e-mail
          </Button>
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
          <div ref={printWrapRef}>
            <PurchaseOrderPrintDocument
              order={orderQuery.data}
              company={companyQuery.data ?? null}
              className="mx-auto max-w-[210mm] shadow-lg print:shadow-none p-6 sm:p-8 print:p-0 bg-white"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
