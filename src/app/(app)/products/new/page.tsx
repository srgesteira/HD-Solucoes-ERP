"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  ProductFormFields,
  type ProductFormShape,
  fetchProductPrefixesForForm,
  isProductFormMo,
  moProductFieldsValidationMessage,
  productClassificationValidationMessage,
} from "@/components/products/product-form-fields";
import { isSimplifiedClassificationSuffix } from "@/modules/engenharia/lib/products/prefix-classification";
import { BomSuggestionCard } from "@/components/products/bom-suggestion-card";
import { useMe } from "@/hooks/use-me";
import { meCanManageEngineeringProducts } from "@/modules/engenharia/lib/engineering-product-access";
import type { StructureSuggestion } from "@/modules/engenharia/lib/services/ai.service";
import type { Database } from "@/modules/core/types/database";
import type { ProductType } from "@/modules/core/types/product.types";

type ApiProductRow = Database["public"]["Tables"]["products"]["Row"];

type DuplicateSourceComponent = Pick<
  Database["public"]["Tables"]["product_components"]["Row"],
  | "component_product_id"
  | "quantity"
  | "unit_cost"
  | "is_labor"
  | "is_external_labor"
  | "work_center_id"
>;

type ApiProductLoaded = ApiProductRow & {
  components?: DuplicateSourceComponent[];
};

function isProductType(t: string): t is ProductType {
  return t === "finished" || t === "raw" || t === "component";
}

function duplicateSourceToForm(data: ApiProductRow): ProductFormShape {
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
    technical_code: null,
    default_is_external_labor: Boolean(data.default_is_external_labor),
    default_work_center_id: data.default_work_center_id ?? null,
    default_labor_cost:
      data.default_labor_cost != null && data.default_labor_cost !== undefined
        ? Number(data.default_labor_cost)
        : null,
    default_production_line_id: data.default_production_line_id ?? null,
  };
}

/** Body aceito por POST /api/products/[id]/components (productComponentSchema). */
function duplicateComponentToPostBody(
  line: DuplicateSourceComponent
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

async function postProductComponent(
  parentId: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/products/${parentId}/components`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { ok: false, error: json.error ?? "Erro ao copiar linha da composição" };
  }
  return { ok: true };
}

async function copyDuplicateBomLines(
  newProductId: string,
  lines: DuplicateSourceComponent[]
): Promise<{ copied: number; failedAt: number | null; error?: string }> {
  let copied = 0;
  for (let i = 0; i < lines.length; i++) {
    const result = await postProductComponent(
      newProductId,
      duplicateComponentToPostBody(lines[i]!)
    );
    if (!result.ok) {
      return { copied, failedAt: i + 1, error: result.error };
    }
    copied += 1;
  }
  return { copied, failedAt: null };
}

function buildPayload(
  f: ProductFormShape,
  options: { isMO: boolean; isSimplified: boolean }
) {
  return {
    name: f.name.trim(),
    description: f.description?.trim() ? f.description : null,
    technical_description: f.technical_description?.trim()
      ? f.technical_description
      : null,
    ncm: f.ncm?.trim() ? f.ncm : null,
    unit: f.unit.trim(),
    cost_price: Number(f.cost_price ?? 0),
    is_active: f.is_active,
    prefix_id: f.prefix_id.trim(),
    family_id: f.family_id.trim() || null,
    subfamily_id: options.isSimplified ? null : f.subfamily_id.trim() || null,
    material_id: f.material_id.trim() || null,
    finish_id: f.finish_id.trim() || null,
    default_is_external_labor: f.default_is_external_labor,
    default_work_center_id: f.default_work_center_id?.trim()
      ? f.default_work_center_id.trim()
      : null,
    default_production_line_id: f.default_production_line_id?.trim()
      ? f.default_production_line_id.trim()
      : null,
  };
}

async function createProduct(payload: ReturnType<typeof buildPayload>): Promise<{
  data?: { id: string; technical_code?: string | null };
}> {
  const res = await fetch("/api/products", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    data?: { id: string; technical_code?: string | null };
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao criar produto");
  }

  return json;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function NewProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();

  const [formData, setFormData] = useState<ProductFormShape>({
    name: "",
    description: null,
    technical_description: null,
    ncm: null,
    unit: "PC",
    type: "component",
    cost_price: 0,
    selling_price: 0,
    is_active: true,
    use_custom_bdi: false,
    custom_tax_rate: null,
    custom_profit_margin: null,
    prefix_id: "",
    family_id: "",
    subfamily_id: "",
    material_id: "",
    finish_id: "",
    technical_code: null,
    default_is_external_labor: false,
    default_work_center_id: null,
    default_labor_cost: null,
    default_production_line_id: null,
  });

  const [structureSuggestion, setStructureSuggestion] =
    useState<StructureSuggestion | null>(null);
  const [aiNcmPending, setAiNcmPending] = useState(false);
  const [aiBomPending, setAiBomPending] = useState(false);
  const fromBomRef = useRef(false);
  const fromBomToastShown = useRef(false);
  const duplicateFromRef = useRef(false);
  const duplicateLoadedRef = useRef(false);
  const duplicateToastShown = useRef(false);
  const [duplicateSourceComponents, setDuplicateSourceComponents] = useState<
    DuplicateSourceComponent[]
  >([]);

  useEffect(() => {
    if (searchParams.get("duplicateFrom") !== "1") return;
    const sourceId = searchParams.get("sourceId")?.trim() ?? "";
    if (!sourceId || !UUID_RE.test(sourceId)) return;
    if (duplicateLoadedRef.current) return;
    duplicateLoadedRef.current = true;

    (async () => {
      try {
        const res = await fetch(
          `/api/products/${encodeURIComponent(sourceId)}`,
          { credentials: "include", cache: "no-store" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          data?: ApiProductLoaded;
          error?: string;
        };
        if (!res.ok || !json.data) {
          duplicateLoadedRef.current = false;
          if (!duplicateToastShown.current) {
            duplicateToastShown.current = true;
            toast.error(
              json.error ?? "Não foi possível carregar o produto a duplicar."
            );
          }
          return;
        }
        duplicateFromRef.current = true;
        setFormData(duplicateSourceToForm(json.data));
        setDuplicateSourceComponents(
          Array.isArray(json.data.components) ? json.data.components : []
        );
        if (!duplicateToastShown.current) {
          duplicateToastShown.current = true;
          toast.message(`Duplicando ${json.data.name} — ajuste e salve.`, {
            duration: 10_000,
          });
        }
      } catch {
        duplicateLoadedRef.current = false;
        if (duplicateToastShown.current) return;
        duplicateToastShown.current = true;
        toast.error("Erro ao carregar o produto a duplicar.");
      }
    })();
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    fromBomRef.current = sp.get("fromBom") === "1";
    const pp = sp.get("parentProductId");
    if (pp) {
      try {
        sessionStorage.setItem("bomParentProductId", pp);
      } catch {
        /* ignore */
      }
    }
    if (sp.get("duplicateFrom") === "1") return;
    if (fromBomRef.current && !fromBomToastShown.current) {
      fromBomToastShown.current = true;
      toast.message("Criação a partir da BOM", {
        description:
          "Após guardar, volte ao separador da estrutura e actualize a pesquisa para encontrar o novo produto.",
        duration: 10_000,
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("fromBom") !== "1") return;
    let cancelled = false;
    (async () => {
      try {
        const prefixes = await fetchProductPrefixesForForm();
        if (cancelled) return;
        const mo = prefixes.find((p) => p.code === "MO");
        if (!mo) return;
        setFormData((prev) => {
          if (prev.prefix_id.trim()) return prev;
          return { ...prev, prefix_id: mo.id };
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (meLoading) return;
    if (me && !meCanManageEngineeringProducts(me)) {
      toast.error("Sem permissão para criar produtos.");
      router.replace("/products");
    }
  }, [me, meLoading, router]);

  const mutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      const id = res.data?.id;
      const goToEdit = () => {
        if (id) router.push(`/products/${id}/edit`);
        else router.push("/products");
      };

      if (fromBomRef.current) {
        toast.success(
          "Produto criado! Volte para a aba da BOM e recarregue a lista para encontrar o novo produto."
        );
        return;
      }

      if (
        duplicateFromRef.current &&
        id &&
        duplicateSourceComponents.length > 0
      ) {
        const { copied, failedAt, error } = await copyDuplicateBomLines(
          id,
          duplicateSourceComponents
        );
        if (failedAt != null) {
          toast.error(
            error ??
              `Composição: ${copied} de ${duplicateSourceComponents.length} linha(s) copiada(s). Complete a BOM na edição do produto.`,
            { duration: 12_000 }
          );
        } else {
          toast.success(
            `Produto duplicado com ${copied} item(ns) de composição.`
          );
        }
        goToEdit();
        return;
      }

      if (duplicateFromRef.current) {
        toast.success(
          res.data?.technical_code
            ? `Produto duplicado. Código técnico: ${res.data.technical_code}`
            : "Produto duplicado com sucesso."
        );
        goToEdit();
        return;
      }

      toast.success(
        res.data?.technical_code
          ? `Produto criado. Código técnico: ${res.data.technical_code}`
          : "Produto criado com sucesso."
      );
      goToEdit();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meCanManageEngineeringProducts(me)) return;

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

    try {
      await mutation.mutateAsync(
        buildPayload(formData, { isMO, isSimplified })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar produto.");
    }
  };

  function handleChange<K extends keyof ProductFormShape>(
    field: K,
    value: ProductFormShape[K]
  ) {
    setFormData((prev) => {
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

  async function handleSuggestNcm() {
    if (!formData.name.trim()) {
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
        suggestion?: { ncm: string; description?: string; confidence?: number };
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

  async function handleSuggestStructure() {
    if (!formData.name.trim()) {
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

  if (meLoading || (me && !meCanManageEngineeringProducts(me))) {
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
        <Link href="/products">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Novo produto</h1>
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

            {structureSuggestion ? (
              <BomSuggestionCard
                suggestion={structureSuggestion}
                onDismiss={() => setStructureSuggestion(null)}
              />
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
                Guardar produto
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
