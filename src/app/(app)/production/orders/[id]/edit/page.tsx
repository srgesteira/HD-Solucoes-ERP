"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";

type ProductionOrderEdit = {
  id: string;
  order_number: string;
  client_name: string | null;
  client_document: string | null;
  description: string | null;
  delivery_deadline: string | null;
  pcp_deadline: string | null;
  notes: string | null;
  status: string;
  items?: Array<{
    id: string;
    description: string;
    quantity: number;
    unit: string | null;
    status: string;
  }>;
};

async function fetchOrder(id: string): Promise<ProductionOrderEdit> {
  const res = await fetch(`/api/production/orders/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductionOrderEdit;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar pedido");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

export default function EditProductionOrderPage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canEdit =
    !meLoading && (isAdmin || can("production") || can("mrp"));

  const [hydrated, setHydrated] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [description, setDescription] = useState("");
  const [deliveryDeadline, setDeliveryDeadline] = useState("");
  const [pcpDeadline, setPcpDeadline] = useState("");
  const [notes, setNotes] = useState("");

  const orderQuery = useQuery({
    queryKey: ["production-order-edit", id],
    queryFn: () => fetchOrder(id),
    enabled: Boolean(id) && canEdit,
  });

  const order = orderQuery.data;

  useEffect(() => {
    if (!canEdit && !meLoading) {
      toast.error("Sem permissão para editar pedidos de produção.");
      router.replace(id ? `/production/orders/${id}` : "/production/orders");
    }
  }, [canEdit, meLoading, id, router]);

  useEffect(() => {
    if (!order || hydrated) return;
    setClientName(order.client_name ?? "");
    setClientDocument(order.client_document ?? "");
    setDescription(order.description ?? "");
    setDeliveryDeadline(
      order.delivery_deadline ? String(order.delivery_deadline).slice(0, 10) : ""
    );
    setPcpDeadline(
      order.pcp_deadline ? String(order.pcp_deadline).slice(0, 10) : ""
    );
    setNotes(order.notes ?? "");
    setHydrated(true);
  }, [order, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/production/orders/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientName.trim() || null,
          client_document: clientDocument.trim() || null,
          description: description.trim() || null,
          delivery_deadline: deliveryDeadline.trim()
            ? deliveryDeadline.slice(0, 10)
            : null,
          pcp_deadline: pcpDeadline.trim() ? pcpDeadline.slice(0, 10) : null,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao guardar");
    },
    onSuccess: async () => {
      toast.success("Pedido actualizado.");
      await queryClient.invalidateQueries({ queryKey: ["production-order", id] });
      await queryClient.invalidateQueries({
        queryKey: ["production-order-edit", id],
      });
      router.push(`/production/orders/${id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!id) {
    return (
      <p className="text-sm text-slate-600 py-12 text-center">Pedido inválido.</p>
    );
  }

  if (meLoading || !canEdit) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar permissões…</span>
      </div>
    );
  }

  if (orderQuery.isLoading || !hydrated) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A carregar…</span>
      </div>
    );
  }

  const items = order?.items ?? [];

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/production/orders/${id}`}>
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">
          Editar pedido {order?.order_number ?? ""}
        </h1>
      </div>

      <p className="text-sm text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        Itens de produção são geridos no planeamento (PCP) e no detalhe do
        pedido. Aqui altera apenas o cabeçalho e prazos.
      </p>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados do pedido</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="po-client">Cliente</Label>
              <Input
                id="po-client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-doc">Documento</Label>
              <Input
                id="po-doc"
                value={clientDocument}
                onChange={(e) => setClientDocument(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="po-desc">Descrição</Label>
              <Input
                id="po-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-delivery">Prazo de entrega</Label>
              <Input
                id="po-delivery"
                type="date"
                value={deliveryDeadline}
                onChange={(e) => setDeliveryDeadline(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-pcp">Prazo PCP</Label>
              <Input
                id="po-pcp"
                type="date"
                value={pcpDeadline}
                onChange={(e) => setPcpDeadline(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="po-notes">Observações</Label>
              <Textarea
                id="po-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Itens (somente leitura)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b text-left text-slate-600">
                  <th className="py-2 pr-3">Descrição</th>
                  <th className="py-2 pr-3 text-right">Qtd.</th>
                  <th className="py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">{it.description}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {it.quantity} {it.unit ?? ""}
                      </td>
                      <td className="py-2">{it.status}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-500">
                      Sem itens.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href={`/production/orders/${id}`}>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </Link>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                A gravar…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Guardar
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
