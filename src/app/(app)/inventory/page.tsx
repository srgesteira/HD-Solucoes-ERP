"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";

type InvRow = {
  id: string;
  product_id: string;
  quantity_on_hand: number;
  reserved_quantity: number;
  product?: { name?: string | null; technical_code?: string | null } | null;
};

async function fetchInventory(): Promise<InvRow[]> {
  const res = await fetch("/api/inventory", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: InvRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar estoque");
  return json.data ?? [];
}

export default function InventoryPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const { can, isLoading: permLoading } = usePermissions();
  const [rows, setRows] = useState<InvRow[]>([]);
  const [loading, setLoading] = useState(true);

  const canView =
    me?.role === "admin" || (!permLoading && can("inventory"));
  const canAdjust = me?.role === "admin";

  useEffect(() => {
    if (meLoading || permLoading) return;
    if (!me) return;
    if (!canView) {
      toast.error("Sem permissão para consultar estoque.");
      router.replace("/dashboard");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchInventory();
        if (!cancelled) setRows(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, meLoading, permLoading, canView, router]);

  if (!meLoading && !permLoading && !canView) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/products">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Produtos
          </Button>
        </Link>
        {canAdjust ? (
          <Link href="/inventory/adjust">
            <Button type="button" size="sm">
              Ajustar estoque
            </Button>
          </Link>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5" />
            Estoque
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-600 py-10">
              <Loader2 className="h-5 w-5 animate-spin" />
              A carregar…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500 py-6">
              Sem linhas de estoque. Os administradores podem registar saldos
              via API{" "}
              <code className="text-xs bg-slate-100 px-1 rounded">
                POST /api/inventory
              </code>
              .
            </p>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-x-auto dark:border-slate-800">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                    <th className="px-3 py-2 text-left font-medium">Produto</th>
                    <th className="px-3 py-2 text-right font-medium">Em mão</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Reservado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const p = Array.isArray(r.product) ? r.product[0] : r.product;
                    const label =
                      p?.technical_code && p?.name ?
                        `${p.technical_code} — ${p.name}`
                      : p?.name ?? r.product_id.slice(0, 8);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-3 py-2">{label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(r.quantity_on_hand)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(r.reserved_quantity)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
