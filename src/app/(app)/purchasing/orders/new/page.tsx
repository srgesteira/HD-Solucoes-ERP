"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

interface CreatePurchaseOrderPayload {
  po_number: string;
  supplier_id: string | null;
  order_date: string;
  expected_delivery: string | null;
  notes: string | null;
}

async function createPurchaseOrder(
  payload: CreatePurchaseOrderPayload
): Promise<void> {
  const res = await fetch("/api/purchasing/orders", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao criar pedido de compra");
  }
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();

  const [poNumber, setPoNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(todayISODate);
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (meLoading) return;
    if (me && me.role !== "admin") {
      toast.error("Apenas administradores podem criar pedidos de compra.");
      router.replace("/purchasing/orders");
    }
  }, [me, meLoading, router]);

  const suppliersQuery = useQuery({
    queryKey: ["purchasing-suppliers", "active-options"],
    queryFn: fetchActiveSuppliers,
    enabled: !meLoading && me?.role === "admin",
    staleTime: 60_000,
  });

  const sortedSuppliers = useMemo(() => {
    const list = suppliersQuery.data ?? [];
    return [...list].sort((a, b) =>
      `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "pt-BR")
    );
  }, [suppliersQuery.data]);

  const mutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: async () => {
      toast.success("Pedido de compra criado.");
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
      router.push("/purchasing/orders");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (me?.role !== "admin") return;

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
        order_date: od,
        expected_delivery: ed ? ed.slice(0, 10) : null,
        notes: nt ? nt : null,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao criar pedido de compra."
      );
    }
  };

  if (meLoading || (me && me.role !== "admin")) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">A validar permissões…</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/purchasing/orders">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          Novo pedido de compra
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
                <Label htmlFor="po-number">Número do pedido *</Label>
                <Input
                  id="po-number"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="Ex.: PC-2026-001"
                  required
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="supplier">Fornecedor</Label>
                <select
                  id="supplier"
                  className={cn(SELECT_CLASS)}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  disabled={suppliersQuery.isLoading || suppliersQuery.isError}
                  aria-busy={suppliersQuery.isLoading}
                >
                  <option value="">Sem fornecedor</option>
                  {sortedSuppliers.map((s) => (
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
                {suppliersQuery.isLoading ? (
                  <p className="text-xs text-slate-500">A carregar fornecedores…</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="order-date">Data do pedido *</Label>
                <Input
                  id="order-date"
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expected-delivery">Data prevista de entrega</Label>
                <Input
                  id="expected-delivery"
                  type="date"
                  value={expectedDelivery}
                  onChange={(e) => setExpectedDelivery(e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
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
              Nenhuma linha nesta versão inicial. Em breve poderá acrescentar
              produtos e quantidades na página de edição ou detalhes do pedido.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/purchasing/orders">
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
