"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:opacity-60";

interface SupplierOption {
  id: string;
  code: string;
  name: string;
}

interface SuppliersApiResponse {
  data: SupplierOption[];
  pagination: { page: number; limit: number; total: number };
}

async function fetchActiveSuppliers(): Promise<SupplierOption[]> {
  const params = new URLSearchParams({
    is_active: "true",
    page: "1",
    limit: "500",
  });
  const res = await fetch(`/api/purchasing/suppliers?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as SuppliersApiResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao carregar fornecedores"
    );
  }
  if (!Array.isArray(json.data)) {
    throw new Error("Resposta inválida da API");
  }
  return json.data.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
  }));
}

interface OrderForEdit {
  id: string;
  po_number: string;
  order_date: string;
  expected_delivery: string | null;
  notes: string | null;
  supplier_id: string | null;
  supplier?: { id: string; name: string; code: string | null } | null;
}

async function fetchOrderForEdit(id: string): Promise<OrderForEdit> {
  const res = await fetch(`/api/purchasing/orders/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: OrderForEdit | null;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar pedido");
  }
  if (!json.data) throw new Error("Pedido não encontrado.");
  return json.data;
}

interface UpdatePurchaseOrderPayload {
  po_number: string;
  supplier_id: string | null;
  order_date: string;
  expected_delivery: string | null;
  notes: string | null;
}

async function updatePurchaseOrder(
  id: string,
  payload: UpdatePurchaseOrderPayload
): Promise<void> {
  const res = await fetch(`/api/purchasing/orders/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao atualizar pedido de compra");
  }
}

export default function EditPurchaseOrderPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params.id;
  const orderId =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : null;

  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();

  const [hydrated, setHydrated] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setHydrated(false);
  }, [orderId]);
  useEffect(() => {
    if (meLoading) return;
    if (me && me.role !== "admin") {
      toast.error("Apenas administradores podem editar pedidos de compra.");
      router.replace(
        orderId ? `/purchasing/orders/${orderId}` : "/purchasing/orders"
      );
    }
  }, [me, meLoading, router, orderId]);

  const canFetch =
    !!orderId &&
    !meLoading &&
    me?.role === "admin";

  const orderQuery = useQuery({
    queryKey: ["purchasing-order", orderId],
    queryFn: () => fetchOrderForEdit(orderId!),
    enabled: canFetch,
  });

  const suppliersQuery = useQuery({
    queryKey: ["purchasing-suppliers", "active-options"],
    queryFn: fetchActiveSuppliers,
    enabled: canFetch,
    staleTime: 60_000,
  });

  useEffect(() => {
    const o = orderQuery.data;
    if (!o || hydrated) return;
    setPoNumber(o.po_number);
    setSupplierId(o.supplier_id ?? "");
    setOrderDate(String(o.order_date).slice(0, 10));
    setExpectedDelivery(
      o.expected_delivery ? String(o.expected_delivery).slice(0, 10) : ""
    );
    setNotes(o.notes ?? "");
    setHydrated(true);
  }, [orderQuery.data, hydrated]);

  const sortedActiveSuppliers = useMemo(() => {
    const list = suppliersQuery.data ?? [];
    return [...list].sort((a, b) =>
      `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "pt-BR")
    );
  }, [suppliersQuery.data]);

  const mergedSupplierOptions = useMemo(() => {
    const map = new Map<string, SupplierOption>();
    for (const s of sortedActiveSuppliers) map.set(s.id, s);
    const o = orderQuery.data;
    if (o?.supplier_id) {
      if (!map.has(o.supplier_id)) {
        map.set(o.supplier_id, {
          id: o.supplier_id,
          code: o.supplier?.code?.trim() || "—",
          name:
            o.supplier?.name?.trim() ||
            "Fornecedor (lista apenas activos)",
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "pt-BR")
    );
  }, [sortedActiveSuppliers, orderQuery.data]);

  const mutation = useMutation({
    mutationFn: (payload: UpdatePurchaseOrderPayload) =>
      updatePurchaseOrder(orderId!, payload),
    onSuccess: async () => {
      toast.success("Pedido actualizado.");
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order", orderId],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
      if (orderId) router.push(`/purchasing/orders/${orderId}`);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (me?.role !== "admin" || !orderId) return;

    const pn = poNumber.trim();
    if (!pn) {
      toast.error("O número do pedido é obrigatório.");
      return;
    }

    const od = orderDate.trim();
    if (!od) {
      toast.error("Indique a data do pedido.");
      return;
    }

    const ed = expectedDelivery.trim();
    const nt = notes.trim();

    try {
      await mutation.mutateAsync({
        po_number: pn,
        supplier_id: supplierId.trim() ? supplierId.trim() : null,
        order_date: od.slice(0, 10),
        expected_delivery: ed ? ed.slice(0, 10) : null,
        notes: nt ? nt : null,
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Erro ao actualizar pedido de compra."
      );
    }
  };

  if (!orderId) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-sm text-slate-600">
        Pedido não encontrado.{" "}
        <Link href="/purchasing/orders" className="text-brand-700 underline">
          Listagem
        </Link>
      </div>
    );
  }

  if (meLoading || (me && me.role !== "admin")) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">A validar permissões…</span>
      </div>
    );
  }

  if (orderQuery.isLoading || !hydrated) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">A carregar pedido…</span>
      </div>
    );
  }

  if (orderQuery.isError) {
    return (
      <div className="max-w-4xl mx-auto py-12 space-y-4 text-center">
        <p className="text-sm text-red-700">
          {orderQuery.error instanceof Error
            ? orderQuery.error.message
            : "Erro ao carregar."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/purchasing/orders/${orderId}`}>
            <Button type="button" variant="outline" size="sm">
              Ver detalhes
            </Button>
          </Link>
          <Link href="/purchasing/orders">
            <Button type="button" variant="outline" size="sm">
              Listagem
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href={`/purchasing/orders/${orderId}`}>
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          Editar pedido —{" "}
          <span className="tabular-nums">{poNumber}</span>
        </h1>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-slate-600" aria-hidden />
              Dados do pedido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="edit-po-number">Número do pedido *</Label>
                <Input
                  id="edit-po-number"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="Ex.: PC-2026-001"
                  required
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="edit-supplier">Fornecedor</Label>
                <select
                  id="edit-supplier"
                  className={cn(SELECT_CLASS)}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  disabled={suppliersQuery.isLoading}
                  aria-busy={suppliersQuery.isLoading}
                >
                  <option value="">Sem fornecedor</option>
                  {mergedSupplierOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
                {suppliersQuery.isError ? (
                  <p className="text-xs text-red-600">
                    {suppliersQuery.error instanceof Error
                      ? suppliersQuery.error.message
                      : "Não foi possível carregar fornecedores."}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-order-date">Data do pedido *</Label>
                <Input
                  id="edit-order-date"
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-expected-delivery">
                  Data prevista de entrega
                </Label>
                <Input
                  id="edit-expected-delivery"
                  type="date"
                  value={expectedDelivery}
                  onChange={(e) => setExpectedDelivery(e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="edit-notes">Observações</Label>
                <Textarea
                  id="edit-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="resize-y min-h-[5rem]"
                  placeholder="Opcional…"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed border-slate-300 bg-slate-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-800">
              Itens do pedido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              Gestão de linhas do pedido será acrescentada numa próxima versão;
              por agora só pode alterar o cabeçalho atrás.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href={`/purchasing/orders/${orderId}`}>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </Link>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                A gravar…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden />
                Guardar
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
