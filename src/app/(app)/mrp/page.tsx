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
import type {
  MaterialRequirement,
  MrpBatchSummary,
} from "@/lib/mrp-service";

async function postPlan(
  salesOrderId: string,
  mode: "requirements" | "purchase_orders" | "production" | "full"
): Promise<{
  requirements?: MaterialRequirement[];
  purchase_orders?: Array<{ id: string; po_number: string }>;
  production_order_id?: string;
  production_order_ids?: string[];
  production_error?: string;
}> {
  const body: Record<string, unknown> = { sales_order_id: salesOrderId };
  if (mode === "full") {
    body.confirm = true;
  } else {
    body.action = mode;
  }
  const res = await fetch("/api/mrp/plan-sales-order", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    requirements?: MaterialRequirement[];
    purchase_orders?: Array<{ id: string; po_number: string }>;
    production_order_id?: string;
    production_order_ids?: string[];
    production_error?: string;
  };
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "Erro MRP");
  }
  return json;
}

async function postMrpBatch(confirm: boolean): Promise<MrpBatchSummary> {
  const res = await fetch("/api/mrp/run", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm }),
  });
  const json = (await res.json().catch(() => ({}))) as MrpBatchSummary & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro MRP em lote"
    );
  }
  return {
    orders: Array.isArray(json.orders) ? json.orders : [],
    errors: Array.isArray(json.errors) ? json.errors : [],
  };
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
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResult, setBatchResult] = useState<MrpBatchSummary | null>(null);

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

  const runMode = async (
    mode: "requirements" | "purchase_orders" | "production" | "full"
  ) => {
    const id = orderId.trim();
    if (!id) {
      toast.error("Indique o ID do pedido de venda.");
      return;
    }
    setBusy(true);
    try {
      const json = await postPlan(id, mode);
      setReqs(json.requirements ?? []);
      if (mode === "purchase_orders" || mode === "full") {
        setLastPos(json.purchase_orders ?? []);
      }
      if (mode === "requirements") {
        toast.success("Necessidades calculadas (quantidade bruta pela BOM).");
        return;
      }
      if (mode === "purchase_orders") {
        const n = json.purchase_orders?.length ?? 0;
        toast.success(
          n > 0
            ? `${n} pedido(s) de compra em rascunho gerado(s).`
            : "Nenhum PC gerado (sem matérias ou sem falta calculada)."
        );
        return;
      }
      if (mode === "production") {
        const nOp =
          json.production_order_ids?.length ??
          (json.production_order_id ? 1 : 0);
        if (json.production_error) {
          toast.error(json.production_error);
        } else if (nOp > 0) {
          toast.success(
            `${nOp} ordem(ns) de produção criada(s) ou vinculada(s).`
          );
        } else {
          toast.success("Nenhuma OP nova (linhas já planeadas ou inelegíveis).");
        }
        return;
      }
      const nOp =
        json.production_order_ids?.length ??
        (json.production_order_id ? 1 : 0);
      const nPc = json.purchase_orders?.length ?? 0;
      if (json.production_error) {
        toast.error(json.production_error);
      } else if (nOp > 0 || nPc > 0) {
        toast.success(
          nOp > 0 && nPc > 0
            ? `MRP completo: ${nPc} PC(s) e ${nOp} OP(s).`
            : nOp > 0
              ? `MRP completo: ${nOp} OP(s).`
              : `MRP completo: ${nPc} PC(s).`
        );
      } else {
        toast.success("MRP completo — sem acções novas.");
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
            Cole o UUID do pedido de venda. Fluxo sugerido:{" "}
            <strong>Calcular necessidades</strong> (BOM × quantidade do pedido,
            com abatimento só do stock físico), depois{" "}
            <strong>Gerar pedidos de compra</strong> (PCs em rascunho com a
            quantidade total por matéria-prima) e por fim{" "}
            <strong>Criar ordem de produção</strong> (uma OP por linha de
            produto acabado, sem duplicar PCs de rastreio).
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
              onClick={() => void runMode("requirements")}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Calcular necessidades
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void runMode("purchase_orders")}
            >
              Gerar pedidos de compra
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void runMode("production")}
            >
              Criar ordem de produção
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            <button
              type="button"
              className="underline text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              disabled={busy}
              onClick={() => void runMode("full")}
            >
              Atalho: MRP completo num passo
            </button>{" "}
            (PCs com rastreio por linha + OP, como no modal do pedido).
          </p>

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
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                    <th className="px-3 py-2 text-left font-medium">Produto</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Quantidade necessária (bruta)
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Unidade</th>
                  </tr>
                </thead>
                <tbody>
                  {reqs.map((r) => (
                    <tr
                      key={r.product_id}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-3 py-2 max-w-[20rem]">
                        <span className="line-clamp-2">{r.description}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {r.needed}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {r.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">MRP em lote</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Percorre todos os pedidos de venda confirmados e processa linhas
            ainda sem ordem de produção. Use primeiro a pré-visualização; depois
            confirme para criar OPs e PCs.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={batchBusy}
              onClick={() => {
                setBatchBusy(true);
                void postMrpBatch(false)
                  .then((r) => {
                    setBatchResult(r);
                    toast.success(
                      r.orders.length > 0
                        ? `${r.orders.length} pedido(s) com linhas a planear.`
                        : "Nenhum pedido com linhas pendentes de MRP."
                    );
                  })
                  .catch((e) =>
                    toast.error(e instanceof Error ? e.message : "Erro")
                  )
                  .finally(() => setBatchBusy(false));
              }}
            >
              {batchBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Pré-visualizar lote
            </Button>
            <Button
              type="button"
              disabled={batchBusy}
              onClick={() => {
                setBatchBusy(true);
                void postMrpBatch(true)
                  .then((r) => {
                    setBatchResult(r);
                    const errN = r.errors.length;
                    toast.success(
                      errN > 0
                        ? `Lote concluído com ${errN} erro(s). Ver lista abaixo.`
                        : "MRP em lote concluído."
                    );
                  })
                  .catch((e) =>
                    toast.error(e instanceof Error ? e.message : "Erro")
                  )
                  .finally(() => setBatchBusy(false));
              }}
            >
              Executar MRP em lote
            </Button>
          </div>

          {batchResult && batchResult.errors.length > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50/80 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
              <p className="font-medium">Erros</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {batchResult.errors.map((e) => (
                  <li key={e.sales_order_id}>
                    <span className="font-mono">{e.sales_order_id}</span>:{" "}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {batchResult && batchResult.orders.length > 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                    <th className="px-2 py-1.5 text-left font-medium">Pedido</th>
                    <th className="px-2 py-1.5 text-left font-medium">Linha</th>
                    <th className="px-2 py-1.5 text-left font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {batchResult.orders.flatMap((ord) =>
                    ord.lines.map((ln) => (
                      <tr
                        key={`${ord.sales_order_id}-${ln.sales_order_item_id}`}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-2 py-1 font-mono">
                          <Link
                            href={`/sales/orders/${ord.sales_order_id}`}
                            className="text-brand-700 underline dark:text-brand-400"
                          >
                            {ord.order_number || ord.sales_order_id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-2 py-1 tabular-nums">{ln.line_number}</td>
                        <td className="px-2 py-1">
                          {ln.skipped_reason ?
                            <span className="text-slate-600">{ln.skipped_reason}</span>
                          : ln.production_order_id ?
                            <Link
                              href={`/production/orders/${ln.production_order_id}`}
                              className="text-brand-700 underline dark:text-brand-400"
                            >
                              OP vinculada
                            </Link>
                          : (
                            <span className="text-slate-500">—</span>
                          )}
                          {ln.purchase_orders.length > 0 ?
                            <span className="block text-slate-500 mt-0.5">
                              {ln.purchase_orders.length} PC(s)
                            </span>
                          : null}
                        </td>
                      </tr>
                    ))
                  )}
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
