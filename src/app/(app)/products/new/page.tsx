"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ProductFormFields,
  type ProductFormShape,
  sellingPriceDigitsToDisplay,
  parseSellingPriceDigits,
} from "@/components/products/product-form-fields";
import { BomSuggestionCard } from "@/components/products/bom-suggestion-card";
import { useMe } from "@/hooks/use-me";
import { PRODUCT_NATURE_CODES } from "@/lib/products/mrp-product-nature";
import type { StructureSuggestion } from "@/lib/services/ai.service";

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
    product_nature: f.product_nature,
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

export default function NewProductPage() {
  const router = useRouter();
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
    product_nature: "",
    technical_code: null,
  });

  const [structureSuggestion, setStructureSuggestion] =
    useState<StructureSuggestion | null>(null);
  const [aiNcmPending, setAiNcmPending] = useState(false);
  const [aiBomPending, setAiBomPending] = useState(false);

  useEffect(() => {
    if (meLoading) return;
    if (me && me.role !== "admin") {
      toast.error("Apenas administradores podem criar produtos.");
      router.replace("/products");
    }
  }, [me, meLoading, router]);

  const mutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async (res) => {
      toast.success(
        res.data?.technical_code
          ? `Produto criado. Código técnico: ${res.data.technical_code}`
          : "Produto criado com sucesso."
      );
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      const id = res.data?.id;
      if (id) {
        router.push(`/products/${id}/edit`);
      } else {
        router.push("/products");
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (me?.role !== "admin") return;

    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const fields = [
      ["prefix_id", formData.prefix_id.trim()],
      ["family_id", formData.family_id.trim()],
      ["subfamily_id", formData.subfamily_id.trim()],
      ["material_id", formData.material_id.trim()],
      ["finish_id", formData.finish_id.trim()],
    ] as const;
    const missing = fields.filter(([, v]) => !v || !uuidRe.test(v));
    if (missing.length > 0) {
      toast.error(
        "Prefixo, família, sub-família, material e acabamento são obrigatórios."
      );
      return;
    }
    if (
      !formData.product_nature ||
      !(PRODUCT_NATURE_CODES as readonly string[]).includes(
        formData.product_nature
      )
    ) {
      toast.error("Selecione a natureza do produto (MP, SE, EB, …).");
      return;
    }

    try {
      await mutation.mutateAsync(buildPayload(formData));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar produto.");
    }
  };

  const sellingDisplay = sellingPriceDigitsToDisplay(formData.selling_price);

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

  function onSellingPriceInput(value: string) {
    handleChange(
      "selling_price",
      parseSellingPriceDigits(value) as ProductFormShape["selling_price"]
    );
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

  if (meLoading || (me && me.role !== "admin")) {
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
              sellingPriceDisplay={sellingDisplay}
              onChange={handleChange}
              onSellingPriceInput={onSellingPriceInput}
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
