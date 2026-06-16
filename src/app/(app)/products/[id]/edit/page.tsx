"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Calculator, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  ProductFormFields,
  type ProductFormShape,
  fetchProductPrefixesForForm,
  isProductFormMo,
  moProductFieldsValidationMessage,
  productClassificationValidationMessage,
} from "@/components/products/product-form-fields";
import { ProductCostHistoryTable } from "@/components/products/product-cost-history-table";
import { ProductCompositionPanel } from "@/components/products/product-composition-panel";
import { ProductDocumentsPanel } from "@/components/products/product-documents-panel";
import { ProductLifecycleBadge } from "@/components/products/product-lifecycle-badge";
import { ProductReleaseForSalePanel } from "@/components/products/product-release-for-sale-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { isSimplifiedClassificationSuffix } from "@/modules/engenharia/lib/products/prefix-classification";
import {
  bomEligibilityMessage,
  canProductHaveBom,
  seUsesBomCalculatedCost,
} from "@/modules/engenharia/lib/products/product-bom-eligibility";
import { BomSuggestionCard } from "@/components/products/bom-suggestion-card";
import { useMe } from "@/hooks/use-me";
import { meCanManageEngineeringProducts } from "@/modules/engenharia/lib/engineering-product-access";
import type { StructureSuggestion } from "@/modules/engenharia/lib/services/ai.service";
import type { TaxAnalysis } from "@/modules/engenharia/lib/services/tax-ai.service";
import type { Database } from "@/modules/core/types/database";
import type { ProductType } from "@/modules/core/types/product.types";
function isProductType(t: string): t is ProductType {
  return t === "finished" || t === "raw" || t === "component";
}

function buildPayload(
  f: ProductFormShape,
  options: {
    isMO: boolean;
    isSimplified: boolean;
    classificationLocked: boolean;
  }
) {
  const shared = {
    name: f.name.trim(),
    description: f.description?.trim() ? f.description : null,
    technical_description: f.technical_description?.trim()
      ? f.technical_description
      : null,
    ncm: f.ncm?.trim() ? f.ncm : null,
    unit: f.unit.trim(),
    cost_price: Number(f.cost_price ?? 0),
    is_active: f.is_active,
    default_production_line_id: f.default_production_line_id?.trim()
      ? f.default_production_line_id.trim()
      : null,
  };

  const moFields = {
    default_is_external_labor: f.default_is_external_labor,
    default_work_center_id: f.default_work_center_id?.trim()
      ? f.default_work_center_id.trim()
      : null,
  };

  if (options.classificationLocked) {
    return options.isMO ? { ...shared, ...moFields } : { ...shared };
  }

  return {
    ...shared,
    prefix_id: f.prefix_id.trim(),
    family_id: f.family_id.trim() || null,
    subfamily_id: options.isSimplified ? null : f.subfamily_id.trim() || null,
    material_id: f.material_id.trim() || null,
    finish_id: f.finish_id.trim() || null,
    ...moFields,
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
    default_is_external_labor: Boolean(data.default_is_external_labor),
    default_work_center_id: data.default_work_center_id ?? null,
    default_labor_cost:
      data.default_labor_cost != null && data.default_labor_cost !== undefined
        ? Number(data.default_labor_cost)
        : null,
    default_production_line_id:
      (data as { default_production_line_id?: string | null })
        .default_production_line_id ?? null,
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

type EditTab = "basics" | "composition" | "documents";

function tabFromSearchParam(value: string | null): EditTab {
  if (value === "composition") return "composition";
  if (value === "documents") return "documents";
  return "basics";
}

export default function EditProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [activeTab, setActiveTab] = useState<EditTab>(() =>
    tabFromSearchParam(searchParams.get("tab"))
  );

  const { data: productRaw, isLoading, error } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => fetchProduct(productId!),
    enabled: !!productId,
  });

  const { data: prefixes = [] } = useQuery({
    queryKey: ["product-prefixes-form"],
    queryFn: fetchProductPrefixesForForm,
  });

  const prefixCode =
    prefixes.find((p) => p.id === formData?.prefix_id.trim())?.code ?? "";
  const isSimplified = isSimplifiedClassificationSuffix(prefixCode);
  const canHaveBom = canProductHaveBom(prefixCode);
  const seCostFromBom = seUsesBomCalculatedCost(
    prefixCode,
    Boolean(productRaw?.has_composition)
  );

  useEffect(() => {
    if (meLoading) return;
    if (me && !meCanManageEngineeringProducts(me)) {
      toast.error("Sem permissão para editar produtos.");
      router.replace("/products");
    }
  }, [me, meLoading, router]);

  useEffect(() => {
    if (productRaw) {
      setFormData(rowToForm(productRaw));
    }
  }, [productRaw]);

  useEffect(() => {
    setActiveTab(tabFromSearchParam(searchParams.get("tab")));
  }, [searchParams]);

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
        await queryClient.invalidateQueries({
          queryKey: ["product-price-history", productId],
        });
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData || !productId || !meCanManageEngineeringProducts(me)) return;

    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }

    const prefixes = await fetchProductPrefixesForForm();
    const isMO = isProductFormMo(formData, prefixes);
    const prefixCode =
      prefixes.find((p) => p.id === formData.prefix_id.trim())?.code ?? "";
    const isSimplified = isSimplifiedClassificationSuffix(prefixCode);
    const classErr = productClassificationValidationMessage(formData, prefixes);
    if (classErr) {
      toast.error(classErr);
      return;
    }
    const moErr = moProductFieldsValidationMessage(formData, prefixes);
    if (moErr) {
      toast.error(moErr);
      return;
    }

    const classificationLocked = Boolean(formData.technical_code?.trim());

    try {
      await mutation.mutateAsync(
        buildPayload(formData, {
          isMO,
          isSimplified,
          classificationLocked,
        })
      );
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
        next.finish_id = "";
      }
      if (field === "material_id") {
        next.finish_id = "";
      }
      return next;
    });
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
        setActiveTab("composition");
        toast.success("Estrutura sugerida — veja a aba Composição.");
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

  if (meLoading || (me && !meCanManageEngineeringProducts(me))) {
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
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">
                Editar produto
              </h1>
              {productRaw ? (
                <ProductLifecycleBadge
                  prefix_code={prefixCode || null}
                  product_nature={productRaw.product_nature}
                  has_composition={productRaw.has_composition}
                  released_for_sale={productRaw.released_for_sale}
                  engineering_workflow_status={
                    productRaw.engineering_workflow_status
                  }
                />
              ) : null}
            </div>
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
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as EditTab)}
        >
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="basics">Informações básicas</TabsTrigger>
            <TabsTrigger value="composition">Composição</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Dados do produto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <ProductFormFields
              formData={formData}
              hideCostField
              classificationLocked={Boolean(formData.technical_code?.trim())}
              onChange={handleChange}
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
              </CardContent>
            </Card>

            <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">
              Custo de lista
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {seCostFromBom ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 space-y-2 max-w-lg">
                <p className="text-sm text-slate-700">
                  Custo calculado pela composição (receita do semi-elaborado).
                  Propaga automaticamente para produtos que usam este SE.
                </p>
                <p className="text-xl font-semibold tabular-nums text-emerald-800">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(Number(formData.cost_price ?? 0))}
                </p>
                <p className="text-xs text-slate-600">
                  Edite materiais e mão-de-obra na aba Composição.
                </p>
              </div>
            ) : isSimplified ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 space-y-2 max-w-md">
                {prefixCode === "SE" ? (
                  <>
                    <p className="text-xs text-slate-600">
                      Semi-elaborado sem receita: custo manual (ex.: compra
                      pronta). Ao montar a composição, o custo passa a ser
                      calculado automaticamente.
                    </p>
                    {Number(formData.cost_price ?? 0) > 0 ? (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        Se removeu a receita recentemente, o valor abaixo
                        mantém-se como referência — pode ajustá-lo manualmente.
                      </p>
                    ) : null}
                  </>
                ) : null}
                <Label htmlFor="edit_cost_price">Custo unitário (R$)</Label>
                <Input
                  id="edit_cost_price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={
                    Number.isFinite(formData.cost_price) ? formData.cost_price : ""
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      handleChange("cost_price", 0);
                      return;
                    }
                    const n = Number(raw);
                    handleChange(
                      "cost_price",
                      Number.isFinite(n) ? Math.max(0, n) : 0
                    );
                  }}
                />
                <p className="text-xs text-slate-600">
                  Ao guardar, o valor é registado no histórico de custos.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Para produtos acabados, o custo de lista é calculado pela
                composição (BOM). Recalcule na aba Composição para actualizar o
                histórico.
              </p>
            )}
            <ProductCostHistoryTable productId={productId} />
          </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="composition" className="mt-4">
            {structureSuggestion ? (
              <div className="mb-4">
                <BomSuggestionCard
                  suggestion={structureSuggestion}
                  onDismiss={() => setStructureSuggestion(null)}
                  structureHref={`/products/${productId}/edit?tab=composition`}
                />
              </div>
            ) : null}

            {productRaw ? (
              <div className="mb-4">
                <ProductReleaseForSalePanel
                  productId={productId}
                  productName={productRaw.name}
                  engineeringWorkflowStatus={
                    productRaw.engineering_workflow_status
                  }
                  releasedForSale={Boolean(productRaw.released_for_sale)}
                  onReleased={() => {
                    void queryClient.invalidateQueries({
                      queryKey: ["product", productId],
                    });
                  }}
                />
              </div>
            ) : null}

            {canHaveBom ? (
              <ProductCompositionPanel productId={productId} embedded />
            ) : (
              <Card>
                <CardContent className="py-8 text-center space-y-2">
                  <p className="text-sm text-slate-600">
                    {bomEligibilityMessage(prefixCode) ||
                      "Este produto não possui receita de fabricação (composição / BOM)."}
                  </p>
                  <p className="text-xs text-slate-500">
                    Acabados (HD1–HD3, AC) e semi-elaborados (SE) podem ter composição.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            {productId ? <ProductDocumentsPanel productId={productId} /> : null}
          </TabsContent>
        </Tabs>

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
