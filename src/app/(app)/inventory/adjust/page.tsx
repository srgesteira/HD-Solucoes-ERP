"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-me";

type ProductLite = {
  id: string;
  name: string;
  technical_code: string | null;
};

type InvRow = {
  id: string;
  product_id: string;
  quantity_on_hand: number;
  reserved_quantity: number;
  reorder_point: number;
  reorder_quantity: number;
};

async function searchProducts(q: string): Promise<ProductLite[]> {
  const params = new URLSearchParams({ search: q, limit: "30", page: "1" });
  const res = await fetch(`/api/products?${params}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductLite[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao pesquisar produtos");
  return json.data ?? [];
}

async function fetchInventoryRow(
  productId: string
): Promise<InvRow | null> {
  const res = await fetch(
    `/api/inventory?product_id=${encodeURIComponent(productId)}`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: InvRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao ler estoque");
  const row = (json.data ?? [])[0];
  return row ?? null;
}

async function postInventory(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/inventory", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "Erro ao gravar");
  }
}

export default function InventoryAdjustPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProductLite | null>(null);
  const [loadingRow, setLoadingRow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qty, setQty] = useState("");
  const [reserved, setReserved] = useState("");
  const [reorderPt, setReorderPt] = useState("");
  const [reorderQty, setReorderQty] = useState("");

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (meLoading) return;
    if (!isAdmin) {
      toast.error("Apenas administradores podem ajustar estoque.");
      router.replace("/inventory");
    }
  }, [meLoading, isAdmin, router]);

  const runSearch = useCallback(async () => {
    const q = search.trim();
    if (q.length < 2) {
      toast.error("Digite pelo menos 2 caracteres para pesquisar.");
      return;
    }
    setSearching(true);
    try {
      const rows = await searchProducts(q);
      setResults(rows);
      if (!rows.length) toast.info("Nenhum produto encontrado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSearching(false);
    }
  }, [search]);

  const pickProduct = useCallback(async (p: ProductLite) => {
    setSelected(p);
    setLoadingRow(true);
    try {
      const row = await fetchInventoryRow(p.id);
      setQty(String(row?.quantity_on_hand ?? 0));
      setReserved(String(row?.reserved_quantity ?? 0));
      setReorderPt(String(row?.reorder_point ?? 0));
      setReorderQty(String(row?.reorder_quantity ?? 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setQty("0");
      setReserved("0");
      setReorderPt("0");
      setReorderQty("0");
    } finally {
      setLoadingRow(false);
    }
  }, []);

  const canSave = useMemo(() => {
    if (!selected) return false;
    const a = parseFloat(qty.replace(",", "."));
    const b = parseFloat(reserved.replace(",", "."));
    const c = parseFloat(reorderPt.replace(",", "."));
    const d = parseFloat(reorderQty.replace(",", "."));
    return (
      Number.isFinite(a) &&
      a >= 0 &&
      Number.isFinite(b) &&
      b >= 0 &&
      Number.isFinite(c) &&
      c >= 0 &&
      Number.isFinite(d) &&
      d >= 0
    );
  }, [selected, qty, reserved, reorderPt, reorderQty]);

  async function handleSave() {
    if (!selected || !canSave) return;
    setSaving(true);
    try {
      await postInventory({
        product_id: selected.id,
        quantity_on_hand: parseFloat(qty.replace(",", ".")),
        reserved_quantity: parseFloat(reserved.replace(",", ".")),
        reorder_point: parseFloat(reorderPt.replace(",", ".")),
        reorder_quantity: parseFloat(reorderQty.replace(",", ".")),
      });
      toast.success("Estoque actualizado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  if (!meLoading && !isAdmin) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/inventory">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Lista de estoque
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ajuste de estoque</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Pesquise o produto por código ou nome, seleccione e defina as
            quantidades. Os valores substituem o registo actual (upsert).
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runSearch();
                }
              }}
              placeholder="Código ou nome…"
              className="max-w-md"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={searching}
              onClick={() => void runSearch()}
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Pesquisar
            </Button>
          </div>

          {results.length > 0 ? (
            <ul className="rounded-lg border border-slate-200 divide-y max-h-48 overflow-y-auto dark:border-slate-800">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900/80"
                    onClick={() => void pickProduct(p)}
                  >
                    <span className="font-mono text-xs text-slate-500">
                      {p.technical_code ?? "—"}
                    </span>{" "}
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {selected ? (
            <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {selected.technical_code ?
                  `${selected.technical_code} — `
                : ""}
                {selected.name}
              </p>
              {loadingRow ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A carregar saldos…
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="qty">Quantidade em mão</Label>
                    <Input
                      id="qty"
                      inputMode="decimal"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="res">Reservado</Label>
                    <Input
                      id="res"
                      inputMode="decimal"
                      value={reserved}
                      onChange={(e) => setReserved(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rp">Ponto de encomenda</Label>
                    <Input
                      id="rp"
                      inputMode="decimal"
                      value={reorderPt}
                      onChange={(e) => setReorderPt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rq">Quantidade de encomenda</Label>
                    <Input
                      id="rq"
                      inputMode="decimal"
                      value={reorderQty}
                      onChange={(e) => setReorderQty(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <Button
                type="button"
                disabled={!canSave || saving || loadingRow}
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span className="ml-2">Gravar</span>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
