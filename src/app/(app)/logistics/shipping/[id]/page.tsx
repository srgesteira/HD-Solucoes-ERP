"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  FileText,
  Loader2,
  PackageCheck,
  Save,
  Send,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { AppPage } from "@/shared/ui/app-page";
import {
  DataList,
  ErrorState,
  LoadingState,
  StatusBadge,
  type StatusTone,
} from "@/shared/ui/page-helpers";
import { AuditHistoryPanel } from "@/components/audit/audit-history-panel";
import { canEditField } from "@/shared/auth/field-permissions";
import { formatBrazilianDateTime, formatShortDate } from "@/shared/utils/date";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";

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
    volumes_count: number | null;
    packaging_description: string | null;
    tracking_code: string | null;
    freight_value: number;
    freight_payer: string | null;
    scheduled_for: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    notes: string | null;
  };
  invoice_gate?: {
    can_emit: boolean;
    reasons: string[];
    order_number: string | null;
  } | null;
};

type LogisticsForm = {
  carrier_name: string;
  carrier_document: string;
  volumes_count: string;
  packaging_description: string;
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

async function patchLogistics(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/shipments/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    shipment?: Detail["shipment"];
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao guardar");
  return json;
}

async function postEmitNfse(salesOrderId: string): Promise<{ nfe_id: string }> {
  const res = await fetch("/api/nfe/emitir", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sales_order_id: salesOrderId }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    nfe_id?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao emitir NFS-e");
  if (!json.nfe_id) throw new Error("Resposta inválida da API");
  return { nfe_id: json.nfe_id };
}

async function consultNfe(nfeId: string): Promise<void> {
  const res = await fetch(
    `/api/nfe/consultar?nfe_id=${encodeURIComponent(nfeId)}`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao consultar NFS-e");
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
  if (!iso) return "—";
  const formatted = formatShortDate(iso);
  return formatted === "--" ? "—" : formatted;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return formatBrazilianDateTime(iso);
}

function toLogisticsForm(s: Detail["shipment"]): LogisticsForm {
  return {
    carrier_name: s.carrier_name ?? "",
    carrier_document: s.carrier_document ?? "",
    volumes_count:
      s.volumes_count === null || s.volumes_count === undefined
        ? ""
        : String(s.volumes_count),
    packaging_description: s.packaging_description ?? "",
  };
}

const canEditCarrierName = canEditField(
  "shipments",
  "expedicao",
  "carrier_name"
);
const canEditCarrierDocument = canEditField(
  "shipments",
  "expedicao",
  "carrier_document"
);
const canEditVolumes = canEditField("shipments", "expedicao", "volumes_count");
const canEditPackaging = canEditField(
  "shipments",
  "expedicao",
  "packaging_description"
);

export default function ShipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { canMenu } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canEmitNota = isAdmin || canMenu("faturamento") || canMenu("expedicao");
  const canClickEmit = canEmitNota;
  const [form, setForm] = useState<LogisticsForm | null>(null);

  const query = useQuery({
    queryKey: ["shipment", id],
    queryFn: () => fetchShipment(id),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (query.data?.shipment) {
      setForm(toLogisticsForm(query.data.shipment));
    }
  }, [query.data]);

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
  const emitMut = useMutation({
    mutationFn: async (salesOrderId: string) => {
      const { nfe_id } = await postEmitNfse(salesOrderId);
      for (let i = 0; i < 12; i++) {
        await consultNfe(nfe_id);
        await new Promise((r) => setTimeout(r, 1200));
      }
    },
    onSuccess: () => {
      toast.success("NFS-e enviada — verifique o estado no Faturamento.");
      void queryClient.invalidateQueries({ queryKey: ["shipment", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveMut = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Formulário não pronto");
      const body: Record<string, unknown> = {};
      if (canEditCarrierName) {
        body.carrier_name = form.carrier_name.trim() || null;
      }
      if (canEditCarrierDocument) {
        body.carrier_document = form.carrier_document.trim() || null;
      }
      if (canEditVolumes) {
        body.volumes_count =
          form.volumes_count.trim() === ""
            ? null
            : Number(form.volumes_count);
      }
      if (canEditPackaging) {
        body.packaging_description =
          form.packaging_description.trim() || null;
      }
      return patchLogistics(id, body);
    },
    onSuccess: () => {
      toast.success("Dados de expedição guardados.");
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
  if (!query.data || !form) return null;
  const s = query.data.shipment;
  const gate = query.data.invoice_gate ?? null;
  const busy =
    dispatchMut.isPending ||
    deliverMut.isPending ||
    saveMut.isPending ||
    emitMut.isPending;
  const locked = s.status === "cancelled" || s.status === "delivered";

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
          {canEmitNota && s.sales_order_id ? (
            <Button
              type="button"
              variant={gate?.can_emit && canClickEmit ? "primary" : "outline"}
              disabled={busy || !gate?.can_emit || !canClickEmit}
              title={
                gate?.can_emit
                  ? "Emitir NFS-e (PCP liberou + fiscal conferido)"
                  : gate?.reasons?.length
                    ? gate.reasons.join(" ")
                    : "Aguardando conferência fiscal + liberação PCP"
              }
              onClick={() => {
                if (!s.sales_order_id || !gate?.can_emit || !canClickEmit) return;
                emitMut.mutate(s.sales_order_id);
              }}
            >
              {emitMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Emitir nota
            </Button>
          ) : null}
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
          {s.status === "prepared" || s.status === "in_transit" ? (
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
            <div className="space-y-1">
              <p>
                Pedido de venda:{" "}
                <Link
                  className="text-brand-700 hover:underline"
                  href={`/sales/orders/${s.sales_order_id}`}
                >
                  {gate?.order_number
                    ? gate.order_number
                    : "ver pedido"}
                </Link>
                {" · "}
                <Link
                  className="text-brand-700 hover:underline"
                  href={`/faturamento/fiscal/${s.sales_order_id}`}
                >
                  conferência fiscal
                </Link>
              </p>
              {gate && !gate.can_emit ? (
                <p className="text-xs text-amber-800">
                  «Emitir nota» bloqueado: {gate.reasons.join(" ")}
                </p>
              ) : gate?.can_emit ? (
                <p className="text-xs text-emerald-800">
                  Pedido pronto — «Emitir nota» habilitado neste despacho.
                </p>
              ) : null}
            </div>
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
          <p className="text-xs text-slate-500 mt-3">
            Destinatário e demais dados do documento são só leitura nesta
            alçada.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Expedição (alçada)</CardTitle>
          {!locked ? (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="carrier_name">Transportadora</Label>
              <Input
                id="carrier_name"
                value={form.carrier_name}
                readOnly={!canEditCarrierName || locked}
                disabled={!canEditCarrierName || locked}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, carrier_name: e.target.value } : f
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="carrier_document">CNPJ transportadora</Label>
              <Input
                id="carrier_document"
                value={form.carrier_document}
                readOnly={!canEditCarrierDocument || locked}
                disabled={!canEditCarrierDocument || locked}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, carrier_document: e.target.value } : f
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="volumes_count">Quantidade de volumes</Label>
              <Input
                id="volumes_count"
                type="number"
                min={0}
                step={1}
                value={form.volumes_count}
                readOnly={!canEditVolumes || locked}
                disabled={!canEditVolumes || locked}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, volumes_count: e.target.value } : f
                  )
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="packaging_description">
                Descrição da embalagem
              </Label>
              <Textarea
                id="packaging_description"
                rows={2}
                value={form.packaging_description}
                readOnly={!canEditPackaging || locked}
                disabled={!canEditPackaging || locked}
                onChange={(e) =>
                  setForm((f) =>
                    f
                      ? { ...f, packaging_description: e.target.value }
                      : f
                  )
                }
              />
            </div>
          </div>

          <DataList
            items={[
              {
                label: "Tracking",
                value: (
                  <span className="font-mono">{s.tracking_code ?? "—"}</span>
                ),
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
          <p className="flex items-center gap-2 text-xs text-slate-500 mt-2 pt-3 border-t border-slate-100">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Só transportadora e volume/embalagem são editáveis nesta alçada;
            tracking, frete e datas ficam readonly. A API rejeita (403) qualquer
            outro campo.
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
