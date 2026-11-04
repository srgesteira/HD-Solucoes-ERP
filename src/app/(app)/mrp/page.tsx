"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { AppPage } from "@/shared/ui/app-page";
import { LoadingState } from "@/shared/ui/page-helpers";
import { useMe } from "@/hooks/use-me";
import type {
  MaterialRequirement,
  MrpBatchSummary,
} from "@/modules/pcp/lib/mrp-service";
import {
  isHdManufacturedCode,
  isHdResaleCode,
} from "@/modules/pcp/lib/mrp-force-production";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MrpOrderLine = {
  id: string;
  line_number: number;
  description: string;
  quantity: number;
  unit: string;
  code: string;
  /** HD1/HD2 — forçado automaticamente no servidor. */
  autoForced: boolean;
  /** HD3 — revenda, nunca gera OP. */
  resale: boolean;
  hasOp: boolean;
};

type ForceSelection = {
  force_production_item_ids: string[];
  unforce_production_item_ids: string[];
};

async function fetchOrderLines(salesOrderId: string): Promise<MrpOrderLine[]> {
  const res = await fetch(`/api/sales/orders/${salesOrderId}`, {
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    data?: { items?: unknown[] };
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Pedido não encontrado"
    );
  }
  const items = Array.isArray(json.data?.items) ? json.data.items : [];
  return items
    .map((raw) => {
      const it = (raw ?? {}) as Record<string, unknown>;
      const prodRaw = it.product;
      const prod = (
        Array.isArray(prodRaw) ? prodRaw[0] : prodRaw
      ) as Record<string, unknown> | null | undefined;
      const technical =
        typeof prod?.technical_code === "string" ? prod.technical_code : null;
      const manual = typeof prod?.code === "string" ? prod.code : null;
      return {
        id: String(it.id ?? ""),
        line_number: Number(it.line_number ?? 0),
        description: String(it.description ?? prod?.name ?? ""),
        quantity: Number(it.quantity ?? 0),
        unit: String(it.unit ?? ""),
        code: (technical?.trim() || manual?.trim() || "—") as string,
        autoForced: isHdManufacturedCode(technical, manual),
        resale: isHdResaleCode(technical, manual),
        hasOp: typeof it.production_order_id === "string",
      } satisfies MrpOrderLine;
    })
    .filter((l) => l.id)
    .sort((a, b) => a.line_number - b.line_number);
}

async function postPlan(
  salesOrderId: string,
  mode: "requirements" | "purchase_orders" | "production" | "full",
  force?: ForceSelection
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
  if (force && (mode === "full" || mode === "production")) {
    body.force_production_item_ids = force.force_production_item_ids;
    body.unforce_production_item_ids = force.unforce_production_item_ids;
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
  const [lines, setLines] = useState<MrpOrderLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [linesError, setLinesError] = useState<string | null>(null);
  /** Estado do checkbox "Forçar OP" por linha (sales_order_items.id). */
  const [forced, setForced] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = orderId.trim();
    if (!UUID_RE.test(id)) {
      setLines([]);
      setForced({});
      setLinesError(null);
      return;
    }
    let cancelled = false;
    setLinesLoading(true);
    setLinesError(null);
    void fetchOrderLines(id)
      .then((ls) => {
        if (cancelled) return;
        setLines(ls);
        // HD1/HD2 pré-marcados; HD3 (revenda) nunca.
        setForced(
          Object.fromEntries(ls.map((l) => [l.id, l.autoForced && !l.resale]))
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setLines([]);
        setForced({});
        setLinesError(e instanceof Error ? e.message : "Erro ao carregar linhas");
      })
      .finally(() => {
        if (!cancelled) setLinesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const forceSelection = useMemo<ForceSelection>(() => {
    const force: string[] = [];
    const unforce: string[] = [];
    for (const l of lines) {
      if (l.resale) continue;
      const on = forced[l.id] === true;
      if (on) force.push(l.id);
      else if (l.autoForced) unforce.push(l.id);
    }
    return {
      force_production_item_ids: force,
      unforce_production_item_ids: unforce,
    };
  }, [lines, forced]);

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
      const json = await postPlan(id, mode, forceSelection);
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
    <AppPage
      title={
        <div className="flex items-center gap-2">
          <Boxes className="h-6 w-6 text-brand-700" aria-hidden />
          <span>MRP — planeamento por pedido</span>
        </div>
      }
      description="Calcule necessidades de materiais a partir de pedidos de venda"
      backHref="/sales/orders"
      backLabel="Pedidos de venda"
      width="wide"
      density="comfortable"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Parâmetros</CardTitle>
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
          {linesLoading ? (
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar linhas
              do pedido…
            </p>
          ) : linesError ? (
            <p className="text-xs text-red-700 dark:text-red-400">{linesError}</p>
          ) : lines.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                <strong>Forçar OP</strong>: gera ordem de produção mesmo sem BOM
                ou com kit em estoque (fabricação sob encomenda). Itens HD1/HD2
                (fabricados pela HD) vêm marcados; HD3 é revenda e segue para
                compra.
              </p>
              <div className="rounded-lg border border-slate-200 overflow-x-auto dark:border-slate-800">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                      <th className="px-3 py-2 text-center font-medium w-24">
                        Forçar OP
                      </th>
                      <th className="px-3 py-2 text-left font-medium w-12">#</th>
                      <th className="px-3 py-2 text-left font-medium">Código</th>
                      <th className="px-3 py-2 text-left font-medium">Descrição</th>
                      <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr
                        key={l.id}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-brand-700"
                            aria-label={`Forçar OP na linha ${l.line_number}`}
                            title={
                              l.resale
                                ? "HD3 é revenda — não gera OP (vai para compra)."
                                : l.hasOp
                                  ? "Linha já possui ordem de produção."
                                  : "Gerar OP mesmo sem BOM ou com estoque."
                            }
                            disabled={busy || l.resale}
                            checked={!l.resale && forced[l.id] === true}
                            onChange={(e) =>
                              setForced((prev) => ({
                                ...prev,
                                [l.id]: e.target.checked,
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 tabular-nums">{l.line_number}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {l.code}
                          {l.resale ? (
                            <span className="ml-1 text-slate-500">(revenda)</span>
                          ) : null}
                          {l.hasOp ? (
                            <span className="ml-1 text-slate-500">(com OP)</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 max-w-[20rem]">
                          <span className="line-clamp-2">{l.description}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {l.quantity} {l.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
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
                  href={
                    "requisition" in p && p.requisition
                      ? "/purchasing/orders?tab=requisitions"
                      : `/purchasing/orders/${p.id}`
                  }
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
    </AppPage>
  );
}

export default function MrpPage() {
  return (
    <Suspense fallback={<LoadingState label="A carregar…" />}>
      <MrpPageContent />
    </Suspense>
  );
}
