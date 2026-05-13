"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-me";
import type { MaterialRequirement } from "@/lib/mrp-service";

async function postPlan(
  salesOrderId: string,
  confirm: boolean
): Promise<{
  requirements?: MaterialRequirement[];
  purchase_orders?: Array<{ id: string; po_number: string }>;
  production_order_id?: string;
  production_error?: string;
}> {
  const res = await fetch("/api/mrp/plan-sales-order", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sales_order_id: salesOrderId, confirm }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    requirements?: MaterialRequirement[];
    purchase_orders?: Array<{ id: string; po_number: string }>;
    production_order_id?: string;
    production_error?: string;
  };
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "Erro MRP");
  }
  return json;
}

function MrpPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: me, isLoading: meLoading } = useMe();
  const [orderId, setOrderId] = useState("");
  const [reqs, setReqs] = useState<MaterialRequirement[]>([]);
  const [lastPos, setLastPos] = useState<Array<{ id: string; po_number: string }>>(
    []
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = searchParams.get("sales_order_id")?.trim();
    if (q) setOrderId(q);
  }, [searchParams]);

  useEffect(() => {
    if (meLoading) return;
    if (me && me.role !== "admin") {
      toast.error("Apenas administradores podem executar o MRP.");
      router.replace("/dashboard");
    }
  }, [me, meLoading, router]);

  const run = async (confirm: boolean) => {
    const id = orderId.trim();
    if (!id) {
      toast.error("Indique o ID do pedido de venda.");
      return;
    }
    setBusy(true);
    try {
      const json = await postPlan(id, confirm);
      setReqs(json.requirements ?? []);
      setLastPos(json.purchase_orders ?? []);
      if (confirm) {
        if (json.production_order_id) {
          toast.success("Plano confirmado: compras e OP criados.");
        } else if (json.production_error) {
          toast.error(json.production_error);
        } else {
          toast.success("Plano confirmado.");
        }
      } else {
        toast.success("Plano calculado.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  if (!meLoading && me?.role !== "admin") {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/sales/orders">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Pedidos de venda
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Boxes className="h-5 w-5" />
            MRP — planeamento por pedido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Cole o UUID do pedido de venda (encontrado na URL do detalhe do
            pedido). Primeiro calcule o plano; depois confirme para gerar
            pedidos de compra em rascunho e a ordem de produção se o stock for
            suficiente.
          </p>
          <div className="space-y-1.5 max-w-xl">
            <Label htmlFor="mrp-so-id">ID do pedido de venda (UUID)</Label>
            <Input
              id="mrp-so-id"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void run(false)}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Calcular plano
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void run(true)}
            >
              Confirmar (PCs + OP)
            </Button>
          </div>

          {lastPos.length > 0 ? (
            <div className="text-xs text-slate-600">
              <span className="font-medium">Últimos PCs:</span>{" "}
              {lastPos.map((p) => (
                <Link
                  key={p.id}
                  href={`/purchasing/orders/${p.id}`}
                  className="ml-2 text-brand-700 underline dark:text-brand-400"
                >
                  {p.po_number}
                </Link>
              ))}
            </div>
          ) : null}

          {reqs.length > 0 ? (
            <div className="rounded-lg border border-slate-200 overflow-x-auto dark:border-slate-800">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                    <th className="px-3 py-2 text-left font-medium">Material</th>
                    <th className="px-3 py-2 text-right font-medium">Necessário</th>
                    <th className="px-3 py-2 text-right font-medium">Disponível</th>
                    <th className="px-3 py-2 text-right font-medium">Falta</th>
                  </tr>
                </thead>
                <tbody>
                  {reqs.map((r) => (
                    <tr
                      key={r.product_id}
                      className={
                        r.shortage > 0.0001 ?
                          "border-b border-slate-100 bg-red-50/50 dark:bg-red-950/20 dark:border-slate-800"
                        : "border-b border-slate-100 dark:border-slate-800"
                      }
                    >
                      <td className="px-3 py-2 max-w-[18rem]">
                        <span className="line-clamp-2">{r.description}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.needed}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.available}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {r.shortage}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MrpPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto flex items-center gap-2 py-16 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      }
    >
      <MrpPageContent />
    </Suspense>
  );
}
