"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  PackageCheck,
  Send,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";
import {
  DataList,
  ErrorState,
  LoadingState,
  StatusBadge,
  type StatusTone,
} from "@/shared/ui/page-helpers";
import { AuditHistoryPanel } from "@/components/audit/audit-history-panel";

type Detail = {
  shipment: {
    id: string;
    shipment_number: string;
    source_kind: string;
    direction: string;
    status: string;
    sales_order_id: string | null;
    sales_return_id: string | null;
    purchase_return_id: string | null;
    destination_name: string | null;
    destination_document: string | null;
    destination_address: string | null;
    carrier_name: string | null;
    carrier_document: string | null;
    tracking_code: string | null;
    freight_value: number;
    freight_payer: string | null;
    scheduled_for: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    notes: string | null;
  };
};

async function fetchShipment(id: string): Promise<Detail> {
  const res = await fetch(`/api/shipments/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Detail & {
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar");
  return json;
}

async function postAction(id: string, action: "dispatch" | "deliver") {
  const res = await fetch(`/api/shipments/${id}/${action}`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro");
}

const STATUS_LABEL: Record<string, string> = {
  prepared: "Preparado",
  in_transit: "Em trânsito",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_TONE: Record<string, StatusTone> = {
  prepared: "neutral",
  in_transit: "warning",
  delivered: "success",
  cancelled: "danger",
};

const SOURCE_LABEL: Record<string, string> = {
  sales_order: "Pedido de venda",
  sales_return: "Devolução de venda",
  purchase_return: "Devolução de compra",
  manual: "Manual",
};

const FREIGHT_PAYER_LABEL: Record<string, string> = {
  shipper: "Remetente (CIF)",
  consignee: "Destinatário (FOB)",
  third_party: "Terceiro",
};

function formatBRL(n: number) {
  return Number(n).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

function formatDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

export default function ShipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["shipment", id],
    queryFn: () => fetchShipment(id),
    enabled: Boolean(id),
  });

  const dispatchMut = useMutation({
    mutationFn: () => postAction(id, "dispatch"),
    onSuccess: () => {
      toast.success("Despacho enviado.");
      void queryClient.invalidateQueries({ queryKey: ["shipment", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deliverMut = useMutation({
    mutationFn: () => postAction(id, "deliver"),
    onSuccess: () => {
      toast.success("Entrega registrada.");
      void queryClient.invalidateQueries({ queryKey: ["shipment", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) {
    return (
      <AppPage title="Despacho" backHref="/logistics/shipping">
        <LoadingState />
      </AppPage>
    );
  }
  if (query.error) {
    return (
      <AppPage title="Despacho" backHref="/logistics/shipping">
        <ErrorState message={(query.error as Error).message} />
      </AppPage>
    );
  }
  if (!query.data) return null;
  const s = query.data.shipment;
  const busy = dispatchMut.isPending || deliverMut.isPending;

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <Send className="h-5 w-5" /> Despacho {s.shipment_number}
        </span>
      }
      description={
        <>
          {SOURCE_LABEL[s.source_kind] ?? s.source_kind} ·{" "}
          {s.direction === "outbound" ? "Saída" : "Coleta"}
        </>
      }
      backHref="/logistics/shipping"
      density="comfortable"
      actions={
        <>
          <StatusBadge tone={STATUS_TONE[s.status] ?? "neutral"}>
            {STATUS_LABEL[s.status] ?? s.status}
          </StatusBadge>
          {s.status === "prepared" ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => dispatchMut.mutate()}
            >
              {dispatchMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Truck className="h-4 w-4" />
              )}
              Despachar
            </Button>
          ) : null}
          {(s.status === "prepared" || s.status === "in_transit") ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (confirm("Confirmar entrega?")) deliverMut.mutate();
              }}
            >
              {deliverMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackageCheck className="h-4 w-4" />
              )}
              Marcar entregue
            </Button>
          ) : null}
        </>
      }
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Documento origem</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {s.sales_order_id ? (
            <p>
              Pedido de venda:{" "}
              <Link
                className="text-brand-700 hover:underline"
                href={`/sales/orders/${s.sales_order_id}`}
              >
                ver pedido
              </Link>
            </p>
          ) : null}
          {s.sales_return_id ? (
            <p>
              Devolução de venda:{" "}
              <Link
                className="text-brand-700 hover:underline"
                href={`/sales/returns/${s.sales_return_id}`}
              >
                ver devolução
              </Link>
            </p>
          ) : null}
          {s.purchase_return_id ? (
            <p>
              Devolução de compra:{" "}
              <Link
                className="text-brand-700 hover:underline"
                href={`/purchasing/returns/${s.purchase_return_id}`}
              >
                ver devolução
              </Link>
            </p>
          ) : null}
          {s.source_kind === "manual" ? (
            <p className="text-slate-500">Despacho manual (sem vínculo)</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Destinatário</CardTitle>
        </CardHeader>
        <CardContent>
          <DataList
            items={[
              { label: "Nome", value: s.destination_name ?? "—" },
              { label: "Documento", value: s.destination_document ?? "—" },
              {
                label: "Endereço",
                value: s.destination_address ?? "—",
                span: 2,
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transporte</CardTitle>
        </CardHeader>
        <CardContent>
          <DataList
            items={[
              { label: "Transportadora", value: s.carrier_name ?? "—" },
              { label: "CNPJ", value: s.carrier_document ?? "—" },
              {
                label: "Tracking",
                value: <span className="font-mono">{s.tracking_code ?? "—"}</span>,
              },
              {
                label: "Frete",
                value: (
                  <span className="tabular-nums">
                    {formatBRL(s.freight_value)}
                    {s.freight_payer
                      ? ` (${FREIGHT_PAYER_LABEL[s.freight_payer] ?? s.freight_payer})`
                      : ""}
                  </span>
                ),
              },
              { label: "Agendado", value: formatDate(s.scheduled_for) },
              { label: "Despacho", value: formatDateTime(s.shipped_at) },
              { label: "Entrega", value: formatDateTime(s.delivered_at) },
              ...(s.notes
                ? [
                    {
                      label: "Notas",
                      value: (
                        <span className="whitespace-pre-wrap">{s.notes}</span>
                      ),
                      span: 2 as const,
                    },
                  ]
                : []),
            ]}
          />
          <p className="flex items-center gap-2 text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Movimento de estoque é gravado pelo documento origem; aqui só
            registramos transporte.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <AuditHistoryPanel table="shipments" recordId={id} />
        </CardContent>
      </Card>
    </AppPage>
  );
}
