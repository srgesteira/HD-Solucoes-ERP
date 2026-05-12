"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Factory,
  Loader2,
  Package,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";
import type { Database } from "@/lib/types/database";
import { workCentersQueryKey } from "@/components/settings/work-centers-admin";

type ProductEmbed = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "technical_code" | "name" | "unit" | "cost_price" | "type"
>;

type WorkCenterEmbed = Pick<
  Database["public"]["Tables"]["work_centers"]["Row"],
  "id" | "code" | "name" | "hourly_cost"
>;

type ProductComponentLine = Omit<
  Database["public"]["Tables"]["product_components"]["Row"],
  "component_product"
> & {
  component_product?: ProductEmbed | null;
  work_center?: WorkCenterEmbed | null;
};

type ProductWithBom = Database["public"]["Tables"]["products"]["Row"] & {
  components: ProductComponentLine[];
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700";

const productsPicklistKey = ["products", "bom-picklist"] as const;

async function fetchProductWithComponents(id: string): Promise<ProductWithBom> {
  const res = await fetch(`/api/products/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductWithBom;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar produto");
  if (!json.data) throw new Error("Resposta inválida");
  const c = json.data.components;
  json.data.components = Array.isArray(c) ? c : [];
  return json.data;
}

type PickRow = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "technical_code" | "name" | "cost_price" | "type" | "unit"
>;

async function fetchProductPicklist(): Promise<PickRow[]> {
  const res = await fetch("/api/products?limit=500&page=1", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: PickRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar produtos");
  return Array.isArray(json.data) ? json.data : [];
}

type WcRow = Database["public"]["Tables"]["work_centers"]["Row"];

async function fetchWorkCentersList(): Promise<WcRow[]> {
  const res = await fetch("/api/work-centers", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: WcRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar centros");
  return Array.isArray(json.data) ? json.data : [];
}

async function addComponent(
  productId: string,
  payload: Record<string, unknown>
) {
  const res = await fetch(`/api/products/${productId}/components`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao adicionar componente");
  return json;
}

async function removeComponent(productId: string, componentId: string) {
  const res = await fetch(
    `/api/products/${productId}/components?componentId=${encodeURIComponent(componentId)}`,
    { method: "DELETE", credentials: "include" }
  );
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao remover componente");
  return json;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

export default function ProductStructurePage() {
  const params = useParams();
  const rawId = params.id;
  const productId =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [componentType, setComponentType] = useState<"material" | "labor">(
    "material"
  );
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedWorkCenterId, setSelectedWorkCenterId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => fetchProductWithComponents(productId),
    enabled: !!productId,
  });

  const { data: allProducts } = useQuery({
    queryKey: productsPicklistKey,
    queryFn: fetchProductPicklist,
  });

  const { data: workCentersRaw } = useQuery({
    queryKey: workCentersQueryKey,
    queryFn: fetchWorkCentersList,
  });

  const workCenters = useMemo(
    () => (workCentersRaw ?? []).filter((w) => w.is_active),
    [workCentersRaw]
  );

  const usedComponentIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of product?.components ?? []) {
      if (!c.is_labor && c.component_product_id) {
        set.add(c.component_product_id);
      }
    }
    return set;
  }, [product?.components]);

  const materialOptions = useMemo(() => {
    return (allProducts ?? []).filter(
      (p) =>
        p.id !== productId &&
        !usedComponentIds.has(p.id)
    );
  }, [allProducts, productId, usedComponentIds]);

  const addMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      addComponent(productId, payload),
    onSuccess: async () => {
      toast.success("Linha da estrutura adicionada.");
      await queryClient.invalidateQueries({ queryKey: ["product", productId] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      resetDialog();
      setDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: ({ componentId }: { componentId: string }) =>
      removeComponent(productId, componentId),
    onSuccess: async () => {
      toast.success("Linha removida.");
      await queryClient.invalidateQueries({ queryKey: ["product", productId] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function resetDialog() {
    setComponentType("material");
    setSelectedProductId("");
    setSelectedWorkCenterId("");
    setQuantity(1);
  }

  async function handleAddComponent() {
    if (componentType === "material" && !selectedProductId) {
      toast.error("Seleccione um produto.");
      return;
    }
    if (componentType === "labor" && !selectedWorkCenterId) {
      toast.error("Seleccione um centro de trabalho.");
      return;
    }
    if (quantity <= 0 || !Number.isFinite(quantity)) {
      toast.error("Quantidade deve ser maior que zero.");
      return;
    }

    try {
      if (componentType === "material") {
        await addMutation.mutateAsync({
          component_product_id: selectedProductId,
          is_labor: false,
          quantity,
        });
      } else {
        await addMutation.mutateAsync({
          is_labor: true,
          work_center_id: selectedWorkCenterId,
          quantity,
        });
      }
    } catch {
      /* toast no onError */
    }
  }

  if (!productId) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <p className="text-sm text-red-600">Produto inválido.</p>
        <Link href="/products" className="text-sm text-brand-700 underline mt-2 inline-block">
          Voltar
        </Link>
      </div>
    );
  }

  if (productLoading) {
    return (
      <div className="max-w-6xl mx-auto flex justify-center items-center py-24 gap-2 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        <span className="text-sm">A carregar…</span>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto py-6">
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            <p className="text-red-600 text-sm font-medium">
              Produto não encontrado.
            </p>
            <Link href="/products">
              <Button type="button" variant="outline">
                Voltar à lista
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalCost = Number(product.cost_price ?? 0);
  const components = product.components ?? [];
  const sumLines = components.reduce(
    (s, c) => s + Number(c.quantity ?? 0) * Number(c.unit_cost ?? 0),
    0
  );

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/products">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Lista
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          Estrutura do produto
        </h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {product.name}{" "}
            <span className="font-mono text-sm text-slate-500 font-normal">
              ({product.technical_code})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-slate-500 block">Tipo</span>
              <p className="font-medium text-slate-900">
                {product.type === "finished"
                  ? "Acabado"
                  : product.type === "raw"
                    ? "Matéria-prima"
                    : product.type === "component"
                      ? "Componente intermédio"
                      : product.type}
              </p>
            </div>
            <div>
              <span className="text-slate-500 block">Unidade</span>
              <p className="font-medium text-slate-900">
                {product.unit?.trim() || "—"}
              </p>
            </div>
            <div>
              <span className="text-slate-500 block">Custo de lista</span>
              <p className="text-xl font-semibold tabular-nums text-emerald-800">
                {formatCurrency(totalCost)}
              </p>
            </div>
            <div>
              <span className="text-slate-500 block">Verificação (somatório)</span>
              <p
                className={cn(
                  "text-sm tabular-nums font-medium pt-1",
                  Math.abs(sumLines - totalCost) < 0.02
                    ? "text-emerald-700"
                    : "text-amber-700"
                )}
              >
                {formatCurrency(sumLines)}
              </p>
              {Math.abs(sumLines - totalCost) >= 0.02 ? (
                <p className="text-xs text-amber-600 mt-1">
                  Diferença sugerida após último recálculo — guarde/recarregue.
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => { resetDialog(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            Adicionar linha
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg p-3 bg-slate-50/80">
          Só administradores acrescentam ou removem linhas da BOM. Pode visualizar custos aqui com a
          conta actual.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-slate-900">
            Lista de materiais (BOM)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {components.length === 0 ? (
            <p className="text-center py-10 text-sm text-slate-500">
              Sem linhas nesta estrutura. Para produtos transformados e acabados, defina materiais e
              mão-de-obra para gerar o custo de lista.
            </p>
          ) : (
            <div className="min-w-[640px] space-y-0">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide pb-2 border-b border-slate-200">
                <div className="col-span-4">Descrição</div>
                <div className="col-span-2">Tipo</div>
                <div className="col-span-2">Quantidade</div>
                <div className="col-span-2 text-right">Custo unit.</div>
                <div className="col-span-1 text-right">Subtotal</div>
                <div className="col-span-1" />
              </div>
              {components.map((comp) => {
                const subtotal =
                  Number(comp.quantity ?? 0) * Number(comp.unit_cost ?? 0);
                return (
                  <div
                    key={comp.id}
                    className="grid grid-cols-12 gap-2 items-center py-2.5 border-b border-slate-100 text-sm"
                  >
                    <div className="col-span-4 min-w-0">
                      {comp.is_labor ? (
                        <div className="flex items-start gap-2">
                          <Factory
                            className="h-4 w-4 text-blue-600 shrink-0 mt-0.5"
                            aria-hidden
                          />
                          <span className="text-slate-900">
                            {comp.work_center?.name ?? "Mão-de-obra"}{" "}
                            <span className="text-xs text-slate-500 whitespace-nowrap">
                              ({comp.work_center?.code})
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <Package
                            className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5"
                            aria-hidden
                          />
                          <span className="text-slate-900">
                            <span className="font-mono text-xs">
                              {comp.component_product?.technical_code}
                            </span>{" "}
                            — {comp.component_product?.name}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span
                        className={cn(
                          "inline-flex text-xs px-2 py-0.5 rounded-md font-medium",
                          comp.is_labor
                            ? "bg-blue-50 text-blue-900 ring-1 ring-blue-200"
                            : "bg-slate-100 text-slate-800 ring-1 ring-slate-200"
                        )}
                      >
                        {comp.is_labor ? "Mão-de-obra" : "Material"}
                      </span>
                    </div>
                    <div className="col-span-2 tabular-nums text-slate-800">
                      {comp.quantity}{" "}
                      {comp.is_labor ? "h" : comp.component_product?.unit?.trim() || "—"}
                    </div>
                    <div className="col-span-2 text-right tabular-nums text-slate-800">
                      {formatCurrency(Number(comp.unit_cost ?? 0))}
                    </div>
                    <div className="col-span-1 text-right tabular-nums font-medium text-slate-900">
                      {formatCurrency(subtotal)}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {isAdmin ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 h-8 w-8 p-0 border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => {
                            if (
                              typeof window !== "undefined" &&
                              !window.confirm("Remover esta linha da estrutura?")
                            )
                              return;
                            removeMutation.mutate({ componentId: comp.id });
                          }}
                          disabled={removeMutation.isPending}
                          aria-label="Remover linha"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div className="grid grid-cols-12 gap-2 pt-4 font-semibold border-t border-slate-200 text-slate-900">
                <div className="col-span-10 text-right">Custo estimado (somatório):</div>
                <div className="col-span-2 text-right tabular-nums">
                  {formatCurrency(sumLines)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="presentation"
          onClick={() => {
            resetDialog();
            setDialogOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bom-dialog-title"
            className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-800 leading-none text-xl"
              aria-label="Fechar"
              onClick={() => {
                resetDialog();
                setDialogOpen(false);
              }}
            >
              ×
            </button>
            <h2
              id="bom-dialog-title"
              className="text-lg font-semibold text-slate-900 pr-8"
            >
              Nova linha na estrutura
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Material usa o custo de lista do produto escolhido; mão-de-obra usa custo por hora
              do centro de trabalho.
            </p>
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Tipo</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={componentType === "material" ? "primary" : "outline"}
                    className="flex-1 text-sm"
                    onClick={() => setComponentType("material")}
                  >
                    <Package className="h-4 w-4" aria-hidden /> Material
                  </Button>
                  <Button
                    type="button"
                    variant={componentType === "labor" ? "primary" : "outline"}
                    className="flex-1 text-sm"
                    onClick={() => setComponentType("labor")}
                  >
                    <Factory className="h-4 w-4" aria-hidden /> Mão-de-obra
                  </Button>
                </div>
              </div>

              {componentType === "material" ? (
                <div className="space-y-2">
                  <Label htmlFor="bom-prod">Produto componente</Label>
                  <select
                    id="bom-prod"
                    className={SELECT_CLASS}
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    {materialOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.technical_code} — {p.name} ({formatCurrency(p.cost_price)})
                      </option>
                    ))}
                  </select>
                  {materialOptions.length === 0 ? (
                    <p className="text-xs text-amber-700">
                      Não há outros produtos disponíveis para ligar ou já estão todas as linhas
                      usadas.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="bom-wc">Centro de trabalho</Label>
                  <select
                    id="bom-wc"
                    className={SELECT_CLASS}
                    value={selectedWorkCenterId}
                    onChange={(e) => setSelectedWorkCenterId(e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    {workCenters.map((wc) => (
                      <option key={wc.id} value={wc.id}>
                        {wc.code} — {wc.name} ({formatCurrency(wc.hourly_cost)}/h)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="bom-qty">Quantidade</Label>
                <Input
                  id="bom-qty"
                  type="number"
                  step="0.000001"
                  min={0}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(parseFloat(e.target.value) || 0)
                  }
                  placeholder={
                    componentType === "labor" ? "Horas" : "Quantidade por unidade pai"
                  }
                />
                <p className="text-xs text-slate-500">
                  {componentType === "labor"
                    ? "Horas necessárias no centro escolhido."
                    : "Quantidade consumida por unidade do produto pai."}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetDialog();
                  setDialogOpen(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={addMutation.isPending}
                onClick={() => void handleAddComponent()}
              >
                {addMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    A gravar…
                  </>
                ) : (
                  "Adicionar"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
