"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { BrDateInput } from "@/shared/ui/br-date-input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { AppPage } from "@/shared/ui/app-page";

export default function NewShipmentPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    source_kind: "manual" as
      | "manual"
      | "sales_order"
      | "sales_return"
      | "purchase_return",
    direction: "outbound" as "outbound" | "inbound",
    sales_order_id: "",
    sales_return_id: "",
    purchase_return_id: "",
    destination_name: "",
    destination_document: "",
    destination_address: "",
    carrier_name: "",
    carrier_document: "",
    tracking_code: "",
    freight_value: "0",
    freight_payer: "" as "" | "shipper" | "consignee" | "third_party",
    scheduled_for: "",
    notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shipments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_kind: form.source_kind,
          direction: form.direction,
          sales_order_id: form.sales_order_id || null,
          sales_return_id: form.sales_return_id || null,
          purchase_return_id: form.purchase_return_id || null,
          destination_name: form.destination_name || null,
          destination_document: form.destination_document || null,
          destination_address: form.destination_address || null,
          carrier_name: form.carrier_name || null,
          carrier_document: form.carrier_document || null,
          tracking_code: form.tracking_code || null,
          freight_value: Number(form.freight_value) || 0,
          freight_payer: form.freight_payer || null,
          scheduled_for: form.scheduled_for || null,
          notes: form.notes || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        shipment?: { id: string };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao criar despacho");
      return json.shipment!;
    },
    onSuccess: (s) => {
      toast.success("Despacho criado.");
      router.push(`/logistics/shipping/${s.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <Send className="h-5 w-5" /> Novo despacho
        </span>
      }
      description="§9: registar nova carga. Vincule a um documento origem (pedido, devolução) ou crie como manual."
      backHref="/logistics/shipping"
      width="narrow"
      density="comfortable"
    >

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados do despacho</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Origem</Label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={form.source_kind}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  source_kind: e.target
                    .value as typeof form.source_kind,
                }))
              }
            >
              <option value="manual">Manual</option>
              <option value="sales_order">Pedido de venda</option>
              <option value="sales_return">Devolução de venda</option>
              <option value="purchase_return">Devolução de compra</option>
            </select>
          </div>
          <div>
            <Label>Direção</Label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={form.direction}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  direction: e.target.value as typeof form.direction,
                }))
              }
            >
              <option value="outbound">Saída (entrega)</option>
              <option value="inbound">Entrada (coleta)</option>
            </select>
          </div>
          {form.source_kind === "sales_order" ? (
            <div className="sm:col-span-2">
              <Label>ID do pedido de venda</Label>
              <Input
                value={form.sales_order_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sales_order_id: e.target.value }))
                }
              />
            </div>
          ) : null}
          {form.source_kind === "sales_return" ? (
            <div className="sm:col-span-2">
              <Label>ID da devolução de venda</Label>
              <Input
                value={form.sales_return_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sales_return_id: e.target.value }))
                }
              />
            </div>
          ) : null}
          {form.source_kind === "purchase_return" ? (
            <div className="sm:col-span-2">
              <Label>ID da devolução de compra</Label>
              <Input
                value={form.purchase_return_id}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    purchase_return_id: e.target.value,
                  }))
                }
              />
            </div>
          ) : null}

          <div>
            <Label>Destinatário</Label>
            <Input
              value={form.destination_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, destination_name: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Documento</Label>
            <Input
              value={form.destination_document}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  destination_document: e.target.value,
                }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Endereço</Label>
            <Input
              value={form.destination_address}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  destination_address: e.target.value,
                }))
              }
            />
          </div>

          <div>
            <Label>Transportadora</Label>
            <Input
              value={form.carrier_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, carrier_name: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>CNPJ transportadora</Label>
            <Input
              value={form.carrier_document}
              onChange={(e) =>
                setForm((f) => ({ ...f, carrier_document: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Tracking</Label>
            <Input
              value={form.tracking_code}
              onChange={(e) =>
                setForm((f) => ({ ...f, tracking_code: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Quem paga o frete</Label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={form.freight_payer}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  freight_payer: e.target.value as typeof form.freight_payer,
                }))
              }
            >
              <option value="">—</option>
              <option value="shipper">Remetente (CIF)</option>
              <option value="consignee">Destinatário (FOB)</option>
              <option value="third_party">Terceiro</option>
            </select>
          </div>
          <div>
            <Label>Valor do frete</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.freight_value}
              onChange={(e) =>
                setForm((f) => ({ ...f, freight_value: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Agendado para</Label>
            <BrDateInput
              value={form.scheduled_for || null}
              onChange={(iso) =>
                setForm((f) => ({ ...f, scheduled_for: iso ?? "" }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/logistics/shipping")}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Criar despacho
        </Button>
      </div>
    </AppPage>
  );
}
