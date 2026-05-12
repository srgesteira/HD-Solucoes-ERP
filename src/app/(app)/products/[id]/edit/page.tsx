"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Calculator, Loader2, Package, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ProductFormFields,
  type ProductFormShape,
  sellingPriceDigitsToDisplay,
  parseSellingPriceDigits,
} from "@/components/products/product-form-fields";
import { BomSuggestionCard } from "@/components/products/bom-suggestion-card";
import { useMe } from "@/hooks/use-me";
import type { StructureSuggestion } from "@/lib/services/ai.service";
import type { TaxAnalysis } from "@/lib/services/tax-ai.service";
import type { Database } from "@/lib/types/database";
import type { ProductType } from "@/lib/types/product.types";

function isProductType(t: string): t is ProductType {
  return t === "finished" || t === "raw" || t === "component";
}

function buildPayload(f: ProductFormShape) {
  return {
    name: f.name.trim(),
    description: f.description?.trim() ? f.description : null,
    technical_description: f.technical_description?.trim()
      ? f.technical_description
      : null,
    ncm: f.ncm?.trim() ? f.ncm : null,
    unit: f.unit.trim(),
    type: f.type,
    selling_price: f.selling_price,
    is_active: f.is_active,
    use_custom_bdi: f.use_custom_bdi,
    custom_tax_rate: f.custom_tax_rate,
    custom_profit_margin: f.custom_profit_margin,
    prefix_id: f.prefix_id.trim(),
    family_id: f.family_id.trim(),
    subfamily_id: f.subfamily_id.trim(),
    material_id: f.material_id.trim(),
    finish_id: f.finish_id.trim(),
  };
}

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

type ProductLoaded = ProductRow & { components?: unknown[] };

type PriceCalculationData = {
  quantity: number;
  unit_cost_price: number;
  line_cost_price: number;
  unit_selling_price: number;
  line_selling_price: number;
  use_custom_bdi: boolean;
  bdi_compound: boolean;
  effective_tax_pct: number;
  effective_profit_pct: number;
  breakdown_scaled: Array<{
    label: string;
    amount: number;
    pct_of_price: number;
    color?: string;
  }>;
};

async function fetchProduct(id: string): Promise<ProductLoaded> {
  const res = await fetch(`/api/products/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductLoaded | null;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar produto");
  }
  if (!json.data) throw new Error("Resposta sem dados.");
  return json.data;
}

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(n ?? 0));
}

function rowToForm(data: ProductLoaded): ProductFormShape {
  return {
    name: data.name,
    description: data.description,
    technical_description: data.technical_description,
    ncm: data.ncm,
    unit:
      typeof data.unit === "string" && data.unit.trim() ? data.unit : "PC",
    type: (
      isProductType(String(data.type)) ? data.type : "component"
    ) as ProductType,
    cost_price: Number(data.cost_price ?? 0),
    selling_price: Number(data.selling_price ?? 0),
    is_active: data.is_active,
    use_custom_bdi: Boolean(data.use_custom_bdi),
    custom_tax_rate:
      data.custom_tax_rate != null && data.custom_tax_rate !== undefined
        ? Number(data.custom_tax_rate)
        : null,
    custom_profit_margin:
      data.custom_profit_margin != null &&
      data.custom_profit_margin !== undefined
        ? Number(data.custom_profit_margin)
        : null,
    prefix_id: data.prefix_id ?? "",
    family_id: data.family_id ?? "",
    subfamily_id: data.subfamily_id ?? "",
    material_id: data.material_id ?? "",
    finish_id: data.finish_id ?? "",
    technical_code:
      data.technical_code != null && String(data.technical_code).trim()
        ? String(data.technical_code)
        : null,
  };
}

async function updateProduct(
  id: string,
  payload: ReturnType<typeof buildPayload>
) {
  const res = await fetch(`/api/products/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao atualizar produto");
  }
  return json;
}

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params.id;
  const productId =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : null;

  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();

  const [formData, setFormData] = useState<ProductFormShape | null>(null);

  const [structureSuggestion, setStructureSuggestion] =
    useState<StructureSuggestion | null>(null);
  const [aiNcmPending, setAiNcmPending] = useState(false);
  const [aiBomPending, setAiBomPending] = useState(false);
  const [taxAnalysis, setTaxAnalysis] = useState<TaxAnalysis | null>(null);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [taxAnalysisPending, setTaxAnalysisPending] = useState(false);

  const [pricingQty, setPricingQty] = useState(1);
  const [pricingDetail, setPricingDetail] = useState<PriceCalculationData | null>(
    null
  );
  const [pricingLoading, setPricingLoading] = useState(false);

  const { data: productRaw, isLoading, error } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => fetchProduct(productId!),
    enabled: !!productId,
  });

  useEffect(() => {
    if (meLoading) return;
    if (me && me.role !== "admin") {
      toast.error("Apenas administradores podem editar produtos.");
      router.replace("/products");
    }
  }, [me, meLoading, router]);

  useEffect(() => {
    if (productRaw) {
      setFormData(rowToForm(productRaw));
    }
  }, [productRaw]);

  const mutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildPayload>) => {
      if (!productId) throw new Error("ID inválido");
      return updateProduct(productId, payload);
    },
    onSuccess: async () => {
      toast.success("Produto atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      if (productId) {
        await queryClient.invalidateQueries({ queryKey: ["product", productId] });
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData || !productId || me?.role !== "admin") return;

    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const reqs: [string, string][] = [
      ["prefix_id", formData.prefix_id.trim()],
      ["family_id", formData.family_id.trim()],
      ["subfamily_id", formData.subfamily_id.trim()],
      ["material_id", formData.material_id.trim()],
      ["finish_id", formData.finish_id.trim()],
    ];
    if (reqs.some(([, v]) => !v || !uuidRe.test(v))) {
      toast.error(
        "Prefixo, família, sub-família, material e acabamento são obrigatórios."
      );
      return;
    }

    try {
      await mutation.mutateAsync(buildPayload(formData));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao atualizar produto."
      );
    }
  };

  function handleChange<K extends keyof ProductFormShape>(
    field: K,
    value: ProductFormShape[K]
  ) {
    setFormData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      if (field === "family_id") {
        next.subfamily_id = "";
      }
      if (field === "material_id") {
        next.finish_id = "";
      }
      return next;
    });
  }

  function onSellingPriceInput(value: string) {
    handleChange(
      "selling_price",
      parseSellingPriceDigits(value) as ProductFormShape["selling_price"]
    );
  }

  async function handleCalculatePricing() {
    if (!productId) return;
    const qty = Math.max(1, Math.floor(pricingQty) || 1);
    setPricingLoading(true);
    try {
      const res = await fetch("/api/products/calculate-price", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          quantity: qty,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: PriceCalculationData;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao calcular preço");
      }
      if (!json.data) throw new Error("Resposta sem dados.");
      setPricingDetail(json.data);
      toast.success("Precificação simulada com as regras BDI.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao calcular.");
      setPricingDetail(null);
    } finally {
      setPricingLoading(false);
    }
  }

  async function handleSuggestNcm() {
    if (!formData?.name.trim()) {
      toast.error("Preencha o nome do produto primeiro.");
      return;
    }
    setAiNcmPending(true);
    try {
      const res = await fetch("/api/ai/suggest-ncm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: formData.name,
          productDescription:
            formData.technical_description?.trim() ||
            formData.description?.trim() ||
            formData.name,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        suggestion?: { ncm: string; description?: string };
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao sugerir NCM");
      }
      if (json.suggestion?.ncm) {
        handleChange("ncm", json.suggestion.ncm.trim());
        toast.success(`NCM sugerido: ${json.suggestion.ncm}`, {
          description: json.suggestion.description,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao sugerir NCM.");
    } finally {
      setAiNcmPending(false);
    }
  }

  async function handleTaxAnalysis() {
    if (!productId) return;
    setTaxAnalysisPending(true);
    toast.info("A analisar tributos…");
    try {
      const res = await fetch("/api/ai/tax-analysis", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        analysis?: TaxAnalysis;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Erro ao analisar tributos");
      }
      if (data.analysis) {
        setTaxAnalysis(data.analysis);
        setShowTaxModal(true);
        toast.success("Análise fiscal concluída.");
      } else {
        toast.message("Sem resultado da análise.", {
          description: "Tente novamente.",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao analisar tributos.");
    } finally {
      setTaxAnalysisPending(false);
    }
  }

  async function handleSuggestStructure() {
    if (!formData?.name.trim()) {
      toast.error("Preencha o nome do produto primeiro.");
      return;
    }
    if (!formData.technical_description?.trim()) {
      toast.error("Preencha a descrição técnica para a IA sugerir a BOM.");
      return;
    }
    setAiBomPending(true);
    try {
      const res = await fetch("/api/ai/suggest-structure", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: formData.name,
          technicalDescription: formData.technical_description,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        suggestion?: StructureSuggestion;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao sugerir estrutura");
      }
      if (json.suggestion?.components?.length) {
        setStructureSuggestion(json.suggestion);
        toast.success("Estrutura sugerida.");
      } else {
        toast.message("A IA não devolveu componentes.", {
          description: "Tente detalhar mais a descrição técnica.",
        });
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erro ao sugerir estrutura."
      );
    } finally {
      setAiBomPending(false);
    }
  }

  if (!productId) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center">
        <p className="text-sm text-red-600">Identificador de produto inválido.</p>
        <Link
          href="/products"
          className="inline-block mt-4 text-sm text-brand-700 underline"
        >
          Voltar à listagem
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

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-24 text-slate-500 gap-2">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        <span className="text-sm pt-2">A carregar produto…</span>
      </div>
    );
  }

  if (error || !formData) {
    return (
      <div className="max-w-4xl mx-auto py-8 space-y-4">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <p className="text-sm text-red-600 font-medium">
              {error instanceof Error
                ? error.message
                : "Não foi possível carregar o produto."}
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

  const sellingDisplay = sellingPriceDigitsToDisplay(formData.selling_price);

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/products">
            <Button type="button" variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Editar produto
            </h1>
            {formData.technical_code ? (
              <p className="mt-1 text-sm font-mono text-slate-600">
                {formData.technical_code}
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-700">
                Código técnico pendente — complete a classificação e guarde.
              </p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={taxAnalysisPending}
          onClick={() => void handleTaxAnalysis()}
        >
          {taxAnalysisPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Calculator className="mr-2 h-4 w-4" aria-hidden />
          )}
          Analisar tributos (IA)
        </Button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">
              Informações básicas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ProductFormFields
              formData={formData}
              sellingPriceDisplay={sellingDisplay}
              onChange={handleChange}
              onSellingPriceInput={onSellingPriceInput}
              pricingActionSlot={
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="bdi-qty">Quantidade (simulação)</Label>
                      <Input
                        id="bdi-qty"
                        type="number"
                        min={1}
                        step={1}
                        className="w-28 h-9"
                        value={pricingQty}
                        onChange={(e) =>
                          setPricingQty(
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      disabled={pricingLoading}
                      onClick={() => void handleCalculatePricing()}
                    >
                      {pricingLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Calculator className="h-4 w-4" />
                      )}
                      Calcular preço
                    </Button>
                  </div>
                  {pricingDetail ? (
                    <div className="rounded-lg border border-slate-200 bg-white dark:bg-slate-950 dark:border-slate-700 p-4 text-sm space-y-4">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-slate-500 uppercase tracking-wide">
                            Forma de BDI
                          </p>
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {pricingDetail.bdi_compound
                              ? "Composto"
                              : "Simples"}
                            {pricingDetail.use_custom_bdi
                              ? " — parâmetros personalizados neste produto"
                              : " — política da empresa"}
                          </p>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                          <p>
                            Imposto efectivo:{" "}
                            <strong className="text-slate-800 dark:text-slate-200 tabular-nums">
                              {pricingDetail.effective_tax_pct.toFixed(2)}%
                            </strong>
                          </p>
                          <p>
                            Margem:{" "}
                            <strong className="text-slate-800 dark:text-slate-200 tabular-nums">
                              {pricingDetail.effective_profit_pct.toFixed(2)}%
                            </strong>
                          </p>
                        </div>
                      </div>
                      <dl className="grid sm:grid-cols-2 gap-3 text-slate-800 dark:text-slate-200">
                        <div className="space-y-0.5">
                          <dt className="text-xs text-slate-500">
                            Custos × {pricingDetail.quantity}
                          </dt>
                          <dd className="tabular-nums font-semibold">
                            {fmtBRL(pricingDetail.line_cost_price)}{" "}
                            <span className="text-xs font-normal text-slate-500">
                              ({fmtBRL(pricingDetail.unit_cost_price)} / un.)
                            </span>
                          </dd>
                        </div>
                        <div className="space-y-0.5">
                          <dt className="text-xs text-slate-500">
                            Preço de venda sugerido × {pricingDetail.quantity}
                          </dt>
                          <dd className="tabular-nums font-semibold text-emerald-800 dark:text-emerald-400">
                            {fmtBRL(pricingDetail.line_selling_price)}{" "}
                            <span className="text-xs font-normal text-slate-500">
                              ({fmtBRL(pricingDetail.unit_selling_price)} / un.)
                            </span>
                          </dd>
                        </div>
                      </dl>
                      <div>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                          Composição estimada (preço total)
                        </p>
                        <div className="flex h-4 w-full overflow-hidden rounded-md ring-1 ring-slate-200 dark:ring-slate-600">
                          {pricingDetail.breakdown_scaled.map((seg) => (
                            <div
                              key={seg.label}
                              title={`${seg.label}: ${fmtBRL(seg.amount)} (${seg.pct_of_price}%)`}
                              className={seg.color ?? "bg-slate-400"}
                              style={{
                                flex: `${Math.max(seg.pct_of_price, 0)} 1 0%`,
                              }}
                            />
                          ))}
                        </div>
                        <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                          {pricingDetail.breakdown_scaled.map((seg) => (
                            <li key={seg.label} className="flex justify-between gap-2">
                              <span className="flex items-center gap-1.5">
                                <span
                                  className={`inline-block h-2 w-2 rounded-sm ${seg.color ?? "bg-slate-400"}`}
                                />
                                {seg.label}
                              </span>
                              <span className="tabular-nums">
                                {fmtBRL(seg.amount)} ({seg.pct_of_price}%)
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </div>
              }
              ncmAction={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  disabled={aiNcmPending}
                  onClick={() => void handleSuggestNcm()}
                >
                  {aiNcmPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden />
                  )}
                  Sugerir NCM
                </Button>
              }
              technicalDescriptionAction={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={aiBomPending}
                  onClick={() => void handleSuggestStructure()}
                >
                  {aiBomPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden />
                  )}
                  Sugerir BOM
                </Button>
              }
            />

            {structureSuggestion ? (
              <BomSuggestionCard
                suggestion={structureSuggestion}
                onDismiss={() => setStructureSuggestion(null)}
                structureHref={
                  formData.type === "finished"
                    ? `/products/${productId}/structure`
                    : undefined
                }
              />
            ) : null}

            {formData.type === "finished" ? (
              <div className="mt-6 pt-6 border-t border-slate-200 space-y-3">
                <h2 className="text-base font-semibold text-slate-900">
                  Estrutura (BOM)
                </h2>
                <p className="text-sm text-slate-600">
                  Defina materiais e mão de obra para o cálculo do custo de lista.
                </p>
                <Link href={`/products/${productId}/structure`}>
                  <Button variant="outline" type="button" className="gap-2">
                    <Package className="h-4 w-4 shrink-0" aria-hidden />
                    Gerir estrutura
                  </Button>
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-6">
          <Link href="/products">
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
                Guardar alterações
              </>
            )}
          </Button>
        </div>
      </form>

      {showTaxModal && taxAnalysis ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tax-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Fechar"
            onClick={() => setShowTaxModal(false)}
          />
          <Card className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle id="tax-modal-title" className="text-lg">
                Análise fiscal (IA)
              </CardTitle>
              <p className="text-sm text-slate-600 font-normal">
                {taxAnalysis.productName}
              </p>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="grid gap-2 text-slate-700">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">NCM</dt>
                  <dd className="font-mono">{taxAnalysis.ncm}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Prefixo / tipo</dt>
                  <dd className="font-mono">{taxAnalysis.productType}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Regime</dt>
                  <dd>{taxAnalysis.taxRegime}</dd>
                </div>
              </dl>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Alíquotas estimadas
                </p>
                <ul className="space-y-1 tabular-nums">
                  <li className="flex justify-between gap-2">
                    <span>ICMS</span>
                    <span>
                      {taxAnalysis.icms.rate}%
                      {taxAnalysis.icms.notes ?
                        ` — ${taxAnalysis.icms.notes}`
                      : ""}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>PIS</span>
                    <span>
                      {taxAnalysis.pis.rate}%
                      {taxAnalysis.pis.notes ?
                        ` — ${taxAnalysis.pis.notes}`
                      : ""}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>COFINS</span>
                    <span>
                      {taxAnalysis.cofins.rate}%
                      {taxAnalysis.cofins.notes ?
                        ` — ${taxAnalysis.cofins.notes}`
                      : ""}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>IPI</span>
                    <span>
                      {taxAnalysis.ipi.rate}%
                      {taxAnalysis.ipi.notes ?
                        ` — ${taxAnalysis.ipi.notes}`
                      : ""}
                    </span>
                  </li>
                </ul>
                <p className="pt-1 border-t border-slate-200 font-medium text-slate-900">
                  Total aproximado: {taxAnalysis.totalTaxRate.toFixed(2)}%
                </p>
              </div>
              {taxAnalysis.estimatedSavings > 0 ? (
                <p className="text-emerald-800">
                  Economia estimada: ~{taxAnalysis.estimatedSavings}%
                </p>
              ) : null}
              {taxAnalysis.warning ? (
                <p className="text-amber-800 text-xs">{taxAnalysis.warning}</p>
              ) : null}
              {taxAnalysis.recommendations.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">
                    Recomendações
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-700">
                    {taxAnalysis.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  onClick={() => setShowTaxModal(false)}
                >
                  Fechar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
