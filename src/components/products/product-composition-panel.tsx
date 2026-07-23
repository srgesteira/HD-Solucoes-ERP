"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Factory,
  Loader2,
  Package,
  Pencil,
  Plus,
  Trash2,
  Download,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import type { Database } from "@/modules/core/types/database";
import { ProductCatalogPickerModal } from "@/components/products/product-catalog-picker-modal";
import { ProductComboboxField } from "@/components/products/product-combobox-field";
import type { ProductSearchHit } from "@/components/products/product-search-modal";
import { workCentersQueryKey } from "@/components/settings/work-centers-admin";

type ProductEmbed = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "technical_code" | "name" | "unit" | "cost_price" | "type"
> & {
  prefix?: { code?: string } | null;
};

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

type WcRow = Database["public"]["Tables"]["work_centers"]["Row"] & {
  labor_hourly_rate_this_month?: number | null;
  labor_hourly_rate_latest?: number | null;
};

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

function componentLineToPostBody(
  line: ProductComponentLine
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    quantity: Number(line.quantity),
    is_labor: Boolean(line.is_labor),
    is_external_labor: Boolean(line.is_external_labor),
  };
  if (line.component_product_id) {
    body.component_product_id = line.component_product_id;
  }
  if (line.work_center_id) {
    body.work_center_id = line.work_center_id;
  }
  if (line.unit_cost != null && Number.isFinite(Number(line.unit_cost))) {
    body.unit_cost = Number(line.unit_cost);
  }
  return body;
}

async function updateComponent(
  productId: string,
  payload: { component_id: string; quantity?: number; unit_cost?: number }
) {
  const res = await fetch(`/api/products/${productId}/components`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar componente");
  return json;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

function productKindLabel(product: ProductEmbed): string {
  const prefix = product.prefix?.code?.trim();
  if (prefix === "SE") return "Semi-elaborado";
  if (product.type === "finished") return "Acabado";
  if (product.type === "raw") return "Matéria-prima";
  if (product.type === "component") return "Componente";
  return product.type ?? "—";
}

type ProductCompositionPanelProps = {
  productId: string;
  /** Quando true, omite cabeçalho de página e ajusta espaçamento (uso em abas). */
  embedded?: boolean;
};

export function ProductCompositionPanel({
  productId: productIdProp,
  embedded = false,
}: ProductCompositionPanelProps) {
  const productId = productIdProp.trim();

  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<ProductComponentLine | null>(
    null
  );
  const [editQuantity, setEditQuantity] = useState(1);
  const [editUnitCost, setEditUnitCost] = useState(0);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [componentType, setComponentType] = useState<"material" | "labor">(
    "material"
  );
  const [laborSource, setLaborSource] = useState<"internal" | "external">(
    "internal"
  );
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedProductLabel, setSelectedProductLabel] = useState("");
  const [moFromCatalog, setMoFromCatalog] = useState(false);
  const [selectedWorkCenterId, setSelectedWorkCenterId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [laborHourlyRate, setLaborHourlyRate] = useState(0);
  const [externalUnitCost, setExternalUnitCost] = useState(0);

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => fetchProductWithComponents(productId),
    enabled: !!productId,
  });

  const { data: workCentersRaw } = useQuery({
    queryKey: workCentersQueryKey,
    queryFn: fetchWorkCentersList,
  });

  const workCenters = useMemo(
    () => (workCentersRaw ?? []).filter((w) => w.is_active),
    [workCentersRaw]
  );

  useEffect(() => {
    if (componentType !== "labor" || laborSource !== "internal") return;
    const wc = workCenters.find((w) => w.id === selectedWorkCenterId);
    const sug = wc
      ? Number(
          wc.labor_hourly_rate_this_month != null
            ? wc.labor_hourly_rate_this_month
            : wc.labor_hourly_rate_latest != null
              ? wc.labor_hourly_rate_latest
              : wc.hourly_cost ?? 0
        )
      : 0;
    setLaborHourlyRate(sug);
  }, [componentType, laborSource, selectedWorkCenterId, workCenters]);

  const usedComponentIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of product?.components ?? []) {
      if (c.component_product_id) {
        set.add(c.component_product_id);
      }
    }
    return set;
  }, [product?.components]);

  const excludeProductIdsForSearch = useMemo(() => {
    const ids = [productId, ...Array.from(usedComponentIds)];
    return ids.filter(Boolean);
  }, [productId, usedComponentIds]);

  function handleImportCompositionSelect(hit: ProductSearchHit) {
    setImportModalOpen(false);
    importCompositionMutation.mutate(hit.id);
  }

  function handleProductPickFromSearch(hit: ProductSearchHit) {
    const isMo = hit.prefix?.code === "MO";
    if (isMo) {
      setMoFromCatalog(true);
      setComponentType("labor");
      setSelectedProductId(hit.id);
      const code = hit.technical_code?.trim() || "—";
      setSelectedProductLabel(`${code} — ${hit.name}`);
      const ext = Boolean(hit.default_is_external_labor);
      setLaborSource(ext ? "external" : "internal");
      if (ext) {
        const catalogCost = Number(
          hit.default_labor_cost ?? hit.cost_price ?? 0
        );
        setExternalUnitCost(
          Number.isFinite(catalogCost) && catalogCost >= 0 ? catalogCost : 0
        );
        setSelectedWorkCenterId("");
        setLaborHourlyRate(0);
      } else {
        setSelectedWorkCenterId(hit.default_work_center_id ?? "");
      }
      return;
    }
    if (componentType === "labor" && !moFromCatalog) {
      toast.error(
        "Na mão-de-obra directa só pode associar produtos com prefixo MO. Use o separador Material para outros produtos."
      );
      return;
    }
    setMoFromCatalog(false);
    setComponentType("material");
    setSelectedProductId(hit.id);
    const code = hit.technical_code?.trim() || "—";
    setSelectedProductLabel(`${code} — ${hit.name}`);
  }

  function clearMaterialProduct() {
    setSelectedProductId("");
    setSelectedProductLabel("");
  }

  function clearMoCatalog() {
    setMoFromCatalog(false);
    setSelectedProductId("");
    setSelectedProductLabel("");
  }

  const invalidateProductQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["product", productId] });
    await queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const addMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      addComponent(productId, payload),
    onSuccess: async () => {
      toast.success("Linha da estrutura adicionada.");
      await invalidateProductQueries();
      resetDialog();
      setDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const importCompositionMutation = useMutation({
    mutationFn: async (sourceProductId: string) => {
      const source = await fetchProductWithComponents(sourceProductId);
      const lines = source.components ?? [];
      if (lines.length === 0) {
        const err = new Error("NO_COMPOSITION") as Error & { code?: string };
        err.code = "NO_COMPOSITION";
        throw err;
      }
      let copied = 0;
      for (let i = 0; i < lines.length; i++) {
        try {
          await addComponent(productId, componentLineToPostBody(lines[i]!));
          copied++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Erro ao importar linha";
          const err = new Error(msg) as Error & {
            copied?: number;
            total?: number;
          };
          err.copied = copied;
          err.total = lines.length;
          throw err;
        }
      }
      return copied;
    },
    onSuccess: async (copied) => {
      toast.success(`Composição importada: ${copied} item(ns).`);
      await invalidateProductQueries();
    },
    onError: async (err: Error & { code?: string; copied?: number; total?: number }) => {
      if (err.code === "NO_COMPOSITION" || err.message === "NO_COMPOSITION") {
        toast.error("Esse produto não tem composição para importar.");
        return;
      }
      if ((err.copied ?? 0) > 0) {
        await invalidateProductQueries();
        toast.error(
          `Importação interrompida: ${err.copied} de ${err.total ?? "?"} linha(s) copiada(s). ${err.message}`,
          { duration: 12_000 }
        );
        return;
      }
      toast.error(err.message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: ({ componentId }: { componentId: string }) =>
      removeComponent(productId, componentId),
    onSuccess: async () => {
      toast.success("Linha removida.");
      await invalidateProductQueries();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      component_id: string;
      quantity?: number;
      unit_cost?: number;
    }) => updateComponent(productId, payload),
    onSuccess: async () => {
      toast.success("Linha actualizada.");
      await invalidateProductQueries();
      closeEditDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function resetDialog() {
    setComponentType("material");
    setLaborSource("internal");
    setMoFromCatalog(false);
    clearMaterialProduct();
    setSelectedWorkCenterId("");
    setQuantity(1);
    setLaborHourlyRate(0);
    setExternalUnitCost(0);
  }

  const selectedProductHit: ProductSearchHit | null = selectedProductId
    ? {
        id: selectedProductId,
        name: selectedProductLabel || selectedProductId,
        technical_code: null,
        code: null,
        unit: null,
        cost_price: 0,
      }
    : null;

  function openEditDialog(line: ProductComponentLine) {
    setEditingLine(line);
    setEditQuantity(Number(line.quantity ?? 1));
    setEditUnitCost(Number(line.unit_cost ?? 0));
    setEditDialogOpen(true);
  }

  function closeEditDialog() {
    setEditDialogOpen(false);
    setEditingLine(null);
    setEditQuantity(1);
    setEditUnitCost(0);
  }

  function lineDescription(comp: ProductComponentLine): string {
    const moCatalogLine =
      comp.is_labor === true && !!comp.component_product_id;
    if (moCatalogLine) {
      const code = comp.component_product?.technical_code ?? "—";
      return `${code} — ${comp.component_product?.name ?? ""}`;
    }
    if (comp.is_labor) {
      if (comp.is_external_labor) return "Mão-de-obra externa (terceiros)";
      return `${comp.work_center?.name ?? "Mão-de-obra"} (${comp.work_center?.code ?? "—"})`;
    }
    const code = comp.component_product?.technical_code ?? "—";
    return `${code} — ${comp.component_product?.name ?? ""}`;
  }

  async function handleSaveEdit() {
    if (!editingLine) return;
    if (editQuantity <= 0 || !Number.isFinite(editQuantity)) {
      toast.error("Quantidade deve ser maior que zero.");
      return;
    }
    const payload: {
      component_id: string;
      quantity?: number;
      unit_cost?: number;
    } = {
      component_id: editingLine.id,
      quantity: editQuantity,
    };
    if (editingLine.is_labor) {
      if (!Number.isFinite(editUnitCost) || editUnitCost < 0) {
        toast.error("Custo unitário inválido.");
        return;
      }
      payload.unit_cost = editUnitCost;
    }
    try {
      await updateMutation.mutateAsync(payload);
    } catch {
      /* toast no onError */
    }
  }

  async function handleAddComponent() {
    if (moFromCatalog) {
      if (!selectedProductId) {
        toast.error("Seleccione um produto MO na pesquisa.");
        return;
      }
      if (laborSource === "internal") {
        if (!selectedWorkCenterId) {
          toast.error("Seleccione um centro de trabalho.");
          return;
        }
      } else {
        if (!Number.isFinite(externalUnitCost) || externalUnitCost < 0) {
          toast.error("Informe o custo unitário (R$).");
          return;
        }
      }
    } else if (componentType === "material" && !selectedProductId) {
      toast.error("Seleccione um produto.");
      return;
    } else if (componentType === "labor" && laborSource === "internal" && !selectedWorkCenterId) {
      toast.error("Seleccione um centro de trabalho.");
      return;
    }
    if (
      !moFromCatalog &&
      componentType === "labor" &&
      laborSource === "external" &&
      (!Number.isFinite(externalUnitCost) || externalUnitCost < 0)
    ) {
      toast.error("Informe o custo unitário (R$) da mão de obra externa.");
      return;
    }
    if (quantity <= 0 || !Number.isFinite(quantity)) {
      toast.error("Quantidade deve ser maior que zero.");
      return;
    }

    try {
      if (moFromCatalog) {
        await addMutation.mutateAsync({
          is_labor: true,
          component_product_id: selectedProductId,
          is_external_labor: laborSource === "external",
          work_center_id: laborSource === "internal" ? selectedWorkCenterId : null,
          unit_cost: laborSource === "internal" ? laborHourlyRate : externalUnitCost,
          quantity,
        });
      } else if (componentType === "material") {
        await addMutation.mutateAsync({
          component_product_id: selectedProductId,
          is_labor: false,
          quantity,
        });
      } else if (laborSource === "internal") {
        await addMutation.mutateAsync({
          is_labor: true,
          is_external_labor: false,
          work_center_id: selectedWorkCenterId,
          quantity,
          unit_cost: laborHourlyRate,
        });
      } else {
        await addMutation.mutateAsync({
          is_labor: true,
          is_external_labor: true,
          quantity,
          unit_cost: externalUnitCost,
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
    <div
      className={cn("space-y-6", embedded ? "" : "max-w-6xl mx-auto py-6")}
    >
      {!embedded ? (
        <div className="flex items-center gap-4">
          <Link href={`/products/${productId}/edit`}>
            <Button type="button" variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Editar produto
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">
            Composição do produto
          </h1>
        </div>
      ) : null}

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
                {productKindLabel(product)}
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
        <div className="flex justify-end gap-2 flex-wrap">
          {components.length === 0 && !productLoading ? (
            <Button
              type="button"
              variant="outline"
              disabled={importCompositionMutation.isPending}
              onClick={() => setImportModalOpen(true)}
            >
              {importCompositionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Importar composição
            </Button>
          ) : null}
          <Button type="button" onClick={() => { resetDialog(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            Adicionar linha
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg p-3 bg-slate-50/80">
          Só administradores alteram linhas da BOM. Pode visualizar custos aqui com a
          conta actual.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {embedded ? "Itens da composição" : "Lista de materiais (BOM)"}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {components.length === 0 ? (
            <p className="text-center py-10 text-sm text-slate-500">
              Sem linhas nesta estrutura. Defina materiais e mão-de-obra para
              calcular o custo de lista (acabados e semi-elaborados).
            </p>
          ) : (
            <table className="w-full table-fixed text-sm min-w-[720px]">
              <colgroup>
                <col className="w-[38%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[5.5rem]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">
                    Descrição
                  </th>
                  <th scope="col" className="py-2 pr-3 text-left font-medium">
                    Tipo
                  </th>
                  <th scope="col" className="py-2 pr-3 text-left font-medium">
                    Quantidade
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Custo unit.
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Subtotal
                  </th>
                  <th scope="col" className="py-2 w-[5.5rem]">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
              {components.map((comp) => {
                const subtotal =
                  Number(comp.quantity ?? 0) * Number(comp.unit_cost ?? 0);
                const extLabor =
                  comp.is_labor === true && comp.is_external_labor === true;
                const moCatalogLine =
                  comp.is_labor === true && !!comp.component_product_id;
                return (
                  <tr key={comp.id} className="align-middle">
                    <td className="py-2.5 pr-3 min-w-0">
                      {moCatalogLine ? (
                        <div className="flex items-start gap-2 flex-wrap">
                          <Factory
                            className="h-4 w-4 text-violet-600 shrink-0 mt-0.5"
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-slate-900">
                                <span className="font-mono text-xs">
                                  {comp.component_product?.technical_code}
                                </span>{" "}
                                — {comp.component_product?.name}
                              </span>
                              <span
                                className={cn(
                                  "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold",
                                  extLabor
                                    ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
                                    : "bg-violet-50 text-violet-900 ring-1 ring-violet-200"
                                )}
                              >
                                MO {extLabor ? "Externa" : "Interna"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : comp.is_labor ? (
                        <div className="flex items-start gap-2 flex-wrap">
                          <Factory
                            className="h-4 w-4 text-blue-600 shrink-0 mt-0.5"
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-slate-900">
                                {extLabor ? (
                                  <>Mão-de-obra externa (terceiros)</>
                                ) : (
                                  <>
                                    {comp.work_center?.name ?? "Mão-de-obra"}{" "}
                                    <span className="text-xs text-slate-500 whitespace-nowrap">
                                      ({comp.work_center?.code})
                                    </span>
                                  </>
                                )}
                              </span>
                              <span
                                className={cn(
                                  "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold",
                                  extLabor
                                    ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
                                    : "bg-sky-50 text-sky-900 ring-1 ring-sky-200"
                                )}
                              >
                                {extLabor ? "Externa" : "Interna"}
                              </span>
                            </div>
                          </div>
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
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={cn(
                          "inline-flex text-xs px-2 py-0.5 rounded-md font-medium",
                          comp.is_labor
                            ? moCatalogLine
                              ? "bg-violet-50 text-violet-900 ring-1 ring-violet-200"
                              : "bg-blue-50 text-blue-900 ring-1 ring-blue-200"
                            : "bg-slate-100 text-slate-800 ring-1 ring-slate-200"
                        )}
                      >
                        {moCatalogLine
                          ? "Mão-de-obra (MO)"
                          : comp.is_labor
                            ? "Mão-de-obra"
                            : "Material"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-800 whitespace-nowrap">
                      {comp.quantity}
                      {comp.is_labor && !extLabor ? " h" : null}
                      {!comp.is_labor
                        ? ` ${comp.component_product?.unit?.trim() || "—"}`
                        : null}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-800 whitespace-nowrap">
                      {formatCurrency(Number(comp.unit_cost ?? 0))}
                      {comp.is_labor && !extLabor ? (
                        <span className="block text-[10px] text-slate-500 font-normal">/h</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {formatCurrency(subtotal)}
                    </td>
                    <td className="py-2.5 w-[5.5rem]">
                      {isAdmin ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 h-8 w-8 p-0"
                            onClick={() => openEditDialog(comp)}
                            disabled={
                              updateMutation.isPending || removeMutation.isPending
                            }
                            aria-label="Editar linha"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
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
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold text-slate-900">
                  <td colSpan={4} className="py-3 pr-3 text-right">
                    Custo estimado (somatório):
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums whitespace-nowrap">
                    {formatCurrency(sumLines)}
                  </td>
                  <td className="py-3 w-[5.5rem]" />
                </tr>
              </tfoot>
            </table>
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
            className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
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
              Pesquise materiais ou produtos MO (mão-de-obra como produto). MO é sempre gravado como
              linha de mão-de-obra com o produto associado. Mão-de-obra directa (sem produto) usa o
              separador Mão-de-obra.
            </p>
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Tipo</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={componentType === "material" ? "primary" : "outline"}
                    className="flex-1 text-sm"
                    disabled={moFromCatalog}
                    onClick={() => {
                      setMoFromCatalog(false);
                      setComponentType("material");
                      setLaborSource("internal");
                      clearMaterialProduct();
                      setSelectedWorkCenterId("");
                    }}
                  >
                    <Package className="h-4 w-4" aria-hidden /> Material
                  </Button>
                  <Button
                    type="button"
                    variant={componentType === "labor" ? "primary" : "outline"}
                    className="flex-1 text-sm"
                    onClick={() => {
                      if (moFromCatalog) {
                        clearMoCatalog();
                      }
                      setComponentType("labor");
                      setLaborSource("internal");
                    }}
                  >
                    <Factory className="h-4 w-4" aria-hidden /> Mão-de-obra
                  </Button>
                </div>
                {moFromCatalog ? (
                  <p className="text-xs text-violet-800">
                    Tipo fixo em mão-de-obra por ser produto com prefixo MO. Use &quot;Limpar&quot; ou
                    Mão-de-obra para alterar.
                  </p>
                ) : null}
              </div>

              {componentType === "material" ? (
                <div className="space-y-3">
                  <Label>Produto componente</Label>
                  <ProductComboboxField
                    value={selectedProductHit}
                    onChange={(hit) => {
                      if (hit) handleProductPickFromSearch(hit);
                      else clearMaterialProduct();
                    }}
                    excludeIds={excludeProductIdsForSearch}
                    parentProductId={productId}
                    productType="all"
                    catalogTitle="Pesquisar produto componente"
                    placeholder="Digite código ou descrição…"
                    compact
                  />
                  <p className="text-xs text-slate-500">
                    Materiais sem prefixo MO. Para MO, a pesquisa muda automaticamente para
                    mão-de-obra.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {moFromCatalog ? (
                    <div className="rounded-md border border-violet-200 bg-violet-50/70 px-3 py-2 space-y-2">
                      <p className="text-sm font-medium text-slate-900">
                        Produto MO (catálogo)
                      </p>
                      <p className="text-sm text-slate-800">
                        {selectedProductLabel}
                      </p>
                      <p className="text-xs text-violet-900">
                        {laborSource === "external"
                          ? "Cadastro: MO externa — usa o custo do produto, sem centro de trabalho."
                          : "Cadastro: MO interna — indique o centro de trabalho (ou o padrão do produto)."}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => clearMoCatalog()}
                      >
                        Limpar produto
                      </Button>
                    </div>
                  ) : null}

                  {!moFromCatalog ? (
                    <div className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">
                        Origem da mão-de-obra
                      </span>
                      <div className="flex flex-col gap-2">
                        <label className="flex items-start gap-2 cursor-pointer text-sm">
                          <input
                            type="radio"
                            name="labor-source"
                            className="mt-1"
                            checked={laborSource === "internal"}
                            onChange={() => setLaborSource("internal")}
                          />
                          <span>
                            <strong>Interna</strong> — centro de trabalho da
                            empresa; custo/hora sugerido pelo centro (editável).
                          </span>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer text-sm">
                          <input
                            type="radio"
                            name="labor-source"
                            className="mt-1"
                            checked={laborSource === "external"}
                            onChange={() => setLaborSource("external")}
                          />
                          <span>
                            <strong>Externa</strong> — terceiros; custo unitário
                            fixo (R$), sem centro de trabalho.
                          </span>
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {!moFromCatalog ? (
                    <div className="pt-1 space-y-2">
                      <Label className="text-xs">Produto MO (opcional)</Label>
                      <ProductComboboxField
                        value={null}
                        onChange={(hit) => {
                          if (hit) handleProductPickFromSearch(hit);
                        }}
                        excludeIds={excludeProductIdsForSearch}
                        parentProductId={productId}
                        productType="all"
                        catalogTitle="Pesquisar produto MO"
                        placeholder="Digite código MO…"
                        showNewProductButton={false}
                        compact
                      />
                      <p className="text-xs text-slate-500">
                        Para mão-de-obra directa sem produto, preencha interna/externa acima.
                      </p>
                    </div>
                  ) : null}

                  {laborSource === "internal" ? (
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
                            {wc.code} — {wc.name} (
                            {formatCurrency(
                              wc.labor_hourly_rate_this_month != null
                                ? wc.labor_hourly_rate_this_month
                                : wc.labor_hourly_rate_latest != null
                                  ? wc.labor_hourly_rate_latest
                                  : Number(wc.hourly_cost ?? 0)
                            )}
                            /h)
                          </option>
                        ))}
                      </select>
                      <div className="space-y-2 pt-2">
                        <Label htmlFor="bom-labor-rate">Custo por hora (R$)</Label>
                        <Input
                          id="bom-labor-rate"
                          type="number"
                          step="0.01"
                          min={0}
                          value={laborHourlyRate}
                          onChange={(e) =>
                            setLaborHourlyRate(parseFloat(e.target.value) || 0)
                          }
                        />
                        <p className="text-xs text-slate-500">
                          Preenchido com o último custo/hora calculado para a linha ou com o custo/h do
                          centro. Pode alterar antes de gravar.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="bom-ext-cost">Custo unitário (R$)</Label>
                      <Input
                        id="bom-ext-cost"
                        type="number"
                        step="0.01"
                        min={0}
                        value={externalUnitCost}
                        onChange={(e) =>
                          setExternalUnitCost(parseFloat(e.target.value) || 0)
                        }
                      />
                      <p className="text-xs text-slate-500">
                        Valor por unidade de medida usada na quantidade (ex.: R$/hora ou R$/serviço),
                        conforme interpretar a quantidade abaixo.
                      </p>
                    </div>
                  )}
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
                    moFromCatalog || (componentType === "labor" && laborSource === "internal")
                      ? "Horas"
                      : componentType === "labor"
                        ? "Quantidade"
                        : "Quantidade por unidade pai"
                  }
                />
                <p className="text-xs text-slate-500">
                  {moFromCatalog && laborSource === "internal"
                    ? "Horas no centro (produto MO interno)."
                    : moFromCatalog && laborSource === "external"
                      ? "Quantidade × custo unitário (R$) acima."
                      : componentType === "labor" && laborSource === "internal"
                        ? "Horas necessárias no centro escolhido."
                        : componentType === "labor" && laborSource === "external"
                          ? "Quantidade (ex.: horas, dias ou unidades de serviço) × custo unitário acima."
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

      {editDialogOpen && editingLine ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="presentation"
          onClick={closeEditDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bom-edit-dialog-title"
            className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-800 leading-none text-xl"
              aria-label="Fechar"
              onClick={closeEditDialog}
            >
              ×
            </button>
            <h2
              id="bom-edit-dialog-title"
              className="text-lg font-semibold text-slate-900 pr-8"
            >
              Editar linha da estrutura
            </h2>
            <p className="text-sm text-slate-600 mt-2 font-medium">
              {lineDescription(editingLine)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Alterar a quantidade recalcula o custo deste produto e propaga para
              quem o usa na BOM.
            </p>
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bom-edit-qty">Quantidade</Label>
                <Input
                  id="bom-edit-qty"
                  type="number"
                  step="0.000001"
                  min={0}
                  value={editQuantity}
                  onChange={(e) =>
                    setEditQuantity(parseFloat(e.target.value) || 0)
                  }
                />
                <p className="text-xs text-slate-500">
                  {editingLine.is_labor && !editingLine.is_external_labor
                    ? "Horas no centro de trabalho."
                    : editingLine.is_labor
                      ? "Quantidade × custo unitário."
                      : `Unidade: ${editingLine.component_product?.unit?.trim() || "—"} por unidade do produto pai.`}
                </p>
              </div>
              {editingLine.is_labor ? (
                <div className="space-y-2">
                  <Label htmlFor="bom-edit-unit-cost">
                    Custo unitário (R$)
                    {editingLine.is_labor && !editingLine.is_external_labor
                      ? " / hora"
                      : ""}
                  </Label>
                  <Input
                    id="bom-edit-unit-cost"
                    type="number"
                    step="0.01"
                    min={0}
                    value={editUnitCost}
                    onChange={(e) =>
                      setEditUnitCost(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="outline" onClick={closeEditDialog}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={updateMutation.isPending}
                onClick={() => void handleSaveEdit()}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    A gravar…
                  </>
                ) : (
                  "Guardar"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ProductCatalogPickerModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        excludeIds={[productId]}
        hasCompositionOnly
        showNewProductButton={false}
        onSelect={handleImportCompositionSelect}
        title="Importar composição de outro produto"
      />
    </div>
  );
}
