"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Button } from "@/shared/ui/button";
import {
  ClassificationSelectWithAdd,
  type ClassificationOption,
} from "@/components/products/classification-select-with-add";
import {
  QuickAddClassificationItemDialog,
  type QuickAddClassificationConfig,
} from "@/components/products/quick-add-classification-item-dialog";
import {
  validateClassificationCatalogCode,
  validatePrefixCatalogCode,
} from "@/modules/engenharia/lib/products/classification-catalog-codes";
import { cn } from "@/shared/utils/cn";
import type { ProductType } from "@/modules/core/types/product.types";
import {
  isCompleteClassificationSuffix,
  isMoClassificationSuffix,
  isSimplifiedClassificationSuffix,
} from "@/modules/engenharia/lib/products/prefix-classification";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:opacity-60";

export const PRODUCT_UNIT_OPTIONS = [
  { value: "PC", label: "PC — Peça" },
  { value: "KG", label: "KG — Quilograma" },
  { value: "M", label: "M — Metro" },
  { value: "H", label: "H — Hora" },
  { value: "L", label: "L — Litro" },
  { value: "CX", label: "CX — Caixa" },
  { value: "UN", label: "UN — Unidade" },
] as const;

export type ProductFormShape = {
  name: string;
  description: string | null;
  technical_description: string | null;
  ncm: string | null;
  unit: string;
  type: ProductType;
  cost_price: number;
  selling_price: number;
  is_active: boolean;
  use_custom_bdi: boolean;
  custom_tax_rate: number | null;
  custom_profit_margin: number | null;
  prefix_id: string;
  family_id: string;
  subfamily_id: string;
  material_id: string;
  finish_id: string;
  technical_code: string | null;
  default_is_external_labor: boolean;
  default_work_center_id: string | null;
  default_labor_cost: number | null;
  default_production_line_id: string | null;
};

type ClassListRow = ClassificationOption;

type PrefixRow = Pick<ClassListRow, "id" | "code">;

type QuickAddKind =
  | "prefix"
  | "family"
  | "subfamily"
  | "material"
  | "finish"
  | null;

const FETCH_OPTS: RequestInit = {
  credentials: "include",
  cache: "no-store",
};

async function fetchClassificationList<T>(
  url: string,
  errorLabel: string
): Promise<T[]> {
  const res = await fetch(url, FETCH_OPTS);
  const json = (await res.json().catch(() => ({}))) as {
    data?: T[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? errorLabel);
  }
  return json.data ?? [];
}

type Props = {
  formData: ProductFormShape;
  onChange<K extends keyof ProductFormShape>(
    field: K,
    value: ProductFormShape[K]
  ): void;
  /** Em edição: oculta o bloco de custo (histórico na página de edição). */
  hideCostField?: boolean;
  /** Quando o código técnico já existe: bloqueia alteração da classificação. */
  classificationLocked?: boolean;
  ncmAction?: ReactNode;
  technicalDescriptionAction?: ReactNode;
};

function fmtBrl(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(n ?? 0));
}

export function ProductFormFields({
  formData,
  hideCostField = false,
  classificationLocked = false,
  onChange,
  ncmAction,
  technicalDescriptionAction,
}: Props) {
  const [prefixes, setPrefixes] = useState<ClassListRow[]>([]);
  const [families, setFamilies] = useState<ClassListRow[]>([]);
  const [materials, setMaterials] = useState<ClassListRow[]>([]);
  const [subfamilies, setSubfamilies] = useState<ClassListRow[]>([]);
  const [finishes, setFinishes] = useState<ClassListRow[]>([]);
  const [workCenters, setWorkCenters] = useState<
    {
      id: string;
      code: string;
      name: string;
      is_active: boolean | null;
      hourly_cost: number | null;
    }[]
  >([]);
  const [baseLoading, setBaseLoading] = useState(true);
  const [subLoading, setSubLoading] = useState(false);
  const [finLoading, setFinLoading] = useState(false);
  const [wcLoading, setWcLoading] = useState(false);
  const [productionLines, setProductionLines] = useState<
    { id: string; code: string; name: string; is_active: boolean }[]
  >([]);
  const [plLoading, setPlLoading] = useState(false);
  const [quickAdd, setQuickAdd] = useState<QuickAddKind>(null);
  const [familiesLoading, setFamiliesLoading] = useState(false);
  const [prefixesLoading, setPrefixesLoading] = useState(true);
  const [materialsLoading, setMaterialsLoading] = useState(true);

  const reloadPrefixes = useCallback(async () => {
    setPrefixesLoading(true);
    try {
      const list = await fetchClassificationList<ClassListRow>(
        "/api/products/prefixes",
        "Erro ao carregar sufixos"
      );
      setPrefixes(list);
      return list;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar sufixos");
      return [];
    } finally {
      setPrefixesLoading(false);
    }
  }, []);

  const reloadMaterials = useCallback(async () => {
    setMaterialsLoading(true);
    try {
      const list = await fetchClassificationList<ClassListRow>(
        "/api/products/materials",
        "Erro ao carregar materiais"
      );
      setMaterials(list);
      return list;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar materiais");
      return [];
    } finally {
      setMaterialsLoading(false);
    }
  }, []);

  const reloadFamilies = useCallback(async (prefixId: string) => {
    if (!prefixId) {
      setFamilies([]);
      return [];
    }
    setFamiliesLoading(true);
    try {
      const list = await fetchClassificationList<ClassListRow>(
        `/api/products/families?prefix_id=${encodeURIComponent(prefixId)}`,
        "Erro ao carregar famílias deste sufixo"
      );
      setFamilies(list);
      return list;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erro ao carregar famílias deste sufixo"
      );
      setFamilies([]);
      return [];
    } finally {
      setFamiliesLoading(false);
    }
  }, []);

  const reloadSubfamilies = useCallback(async (familyId: string) => {
    if (!familyId) {
      setSubfamilies([]);
      return [];
    }
    setSubLoading(true);
    try {
      const list = await fetchClassificationList<ClassListRow>(
        `/api/products/subfamilies?family_id=${encodeURIComponent(familyId)}`,
        "Erro ao carregar sub-famílias"
      );
      setSubfamilies(list);
      return list;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erro ao carregar sub-famílias"
      );
      setSubfamilies([]);
      return [];
    } finally {
      setSubLoading(false);
    }
  }, []);

  const reloadFinishes = useCallback(async (materialId: string) => {
    if (!materialId) {
      setFinishes([]);
      return [];
    }
    setFinLoading(true);
    try {
      const list = await fetchClassificationList<ClassListRow>(
        `/api/products/finishes?material_id=${encodeURIComponent(materialId)}`,
        "Erro ao carregar acabamentos"
      );
      setFinishes(list);
      return list;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar acabamentos");
      setFinishes([]);
      return [];
    } finally {
      setFinLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBaseLoading(true);
      await Promise.all([reloadPrefixes(), reloadMaterials()]);
      if (!cancelled) setBaseLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadPrefixes, reloadMaterials]);

  useEffect(() => {
    const prefixId = formData.prefix_id?.trim();
    if (!prefixId) {
      setFamilies([]);
      setFamiliesLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await reloadFamilies(prefixId);
      if (cancelled) return;
      if (
        formData.family_id &&
        list.length > 0 &&
        !list.some((f) => f.id === formData.family_id)
      ) {
        onChange("family_id", "");
        onChange("subfamily_id", "");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset só ao mudar sufixo
  }, [formData.prefix_id, reloadFamilies]);

  useEffect(() => {
    const fid = formData.family_id?.trim();
    if (!fid) {
      setSubfamilies([]);
      setSubLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      await reloadSubfamilies(fid);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [formData.family_id, reloadSubfamilies]);

  useEffect(() => {
    const mid = formData.material_id?.trim();
    if (!mid) {
      setFinishes([]);
      setFinLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await reloadFinishes(mid);
      if (cancelled) return;
      if (
        formData.finish_id &&
        list.length > 0 &&
        !list.some((f) => f.id === formData.finish_id)
      ) {
        onChange("finish_id", "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formData.material_id, reloadFinishes]);

  const classBusy =
    baseLoading || prefixesLoading || materialsLoading;
  const classFieldsDisabled = classBusy || classificationLocked;
  const selectedPrefix = prefixes.find((p) => p.id === formData.prefix_id);
  const prefixCode = selectedPrefix?.code ?? "";
  const selectedFamily = families.find((f) => f.id === formData.family_id);
  const selectedMaterial = materials.find((m) => m.id === formData.material_id);

  function handlePrefixChange(prefixId: string) {
    onChange("prefix_id", prefixId);
    onChange("family_id", "");
    onChange("subfamily_id", "");
    const nextP = prefixes.find((x) => x.id === prefixId);
    const nextCode = nextP?.code ?? "";
    if (isSimplifiedClassificationSuffix(nextCode)) {
      onChange("subfamily_id", "");
      if (isMoClassificationSuffix(nextCode)) {
        onChange("material_id", "");
        onChange("finish_id", "");
      }
    } else {
      onChange("default_is_external_labor", false);
      onChange("default_work_center_id", null);
      onChange("default_labor_cost", null);
    }
  }

  const quickAddFamilyConfig: QuickAddClassificationConfig | null =
    formData.prefix_id.trim()
      ? {
          title: "Nova família",
          contextHint: selectedPrefix
            ? `Será criada só para o sufixo ${selectedPrefix.code} — ${selectedPrefix.name}.`
            : undefined,
          validateCode: validateClassificationCatalogCode,
          postUrl: "/api/products/families",
          buildBody: ({ code, name, description }) => ({
            prefix_id: formData.prefix_id.trim(),
            code,
            name,
            description,
          }),
        }
      : null;

  const quickAddPrefixConfig: QuickAddClassificationConfig = {
    title: "Novo sufixo / prefixo",
    contextHint:
      "Sufixo global da empresa (ex.: PN — Pneumática). Código técnico no formato simplificado (material + acabamento).",
    codeLabel: "Código do sufixo *",
    codePlaceholder: "Ex.: PN",
    validateCode: validatePrefixCatalogCode,
    postUrl: "/api/products/prefixes",
    buildBody: ({ code, name, description }) => ({
      code,
      name,
      description,
    }),
  };

  const quickAddMaterialConfig: QuickAddClassificationConfig = {
    title: "Novo material",
    contextHint: "Material global — disponível em todos os sufixos.",
    validateCode: validateClassificationCatalogCode,
    postUrl: "/api/products/materials",
    buildBody: ({ code, name, description }) => ({
      code,
      name,
      description,
    }),
  };

  const quickAddSubfamilyConfig: QuickAddClassificationConfig | null =
    formData.family_id.trim()
      ? {
          title: "Nova sub-família",
          contextHint: selectedFamily
            ? `Será criada só para a família ${selectedFamily.code} — ${selectedFamily.name}.`
            : undefined,
          validateCode: validateClassificationCatalogCode,
          postUrl: "/api/products/subfamilies",
          buildBody: ({ code, name, description }) => ({
            family_id: formData.family_id.trim(),
            code,
            name,
            description,
          }),
        }
      : null;

  const quickAddFinishConfig: QuickAddClassificationConfig | null =
    formData.material_id.trim()
      ? {
          title: "Novo acabamento",
          contextHint: selectedMaterial
            ? `Amarrado ao material ${selectedMaterial.code} — ${selectedMaterial.name}.`
            : undefined,
          validateCode: validateClassificationCatalogCode,
          postUrl: "/api/products/finishes",
          buildBody: ({ code, name, description }) => ({
            material_id: formData.material_id.trim(),
            code,
            name,
            description,
          }),
        }
      : null;
  const isMO = isMoClassificationSuffix(prefixCode);
  const needsCompleteClassification =
    isCompleteClassificationSuffix(prefixCode);
  const needsSimplifiedClassification =
    isSimplifiedClassificationSuffix(prefixCode);
  const showClassificationFields =
    needsCompleteClassification || needsSimplifiedClassification;
  const showDefaultProductionLine =
    needsCompleteClassification || formData.type === "finished";

  useEffect(() => {
    if (!showDefaultProductionLine) {
      setProductionLines([]);
      setPlLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setPlLoading(true);
      try {
        const res = await fetch("/api/production/lines", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          data?: { id: string; code: string; name: string; is_active: boolean }[];
        };
        if (!cancelled && res.ok) {
          setProductionLines((json.data ?? []).filter((l) => l.is_active !== false));
        }
      } finally {
        if (!cancelled) setPlLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showDefaultProductionLine]);

  useEffect(() => {
    if (!isMO) {
      setWorkCenters([]);
      setWcLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setWcLoading(true);
      try {
        const res = await fetch("/api/work-centers", {
          credentials: "include",
          cache: "no-store",
        });
        let json: {
          data?: {
            id: string;
            code: string;
            name: string;
            is_active: boolean | null;
            hourly_cost: number | null;
          }[];
        } = {};
        try {
          json = (await res.json()) as typeof json;
        } catch {
          /* ignore */
        }
        if (!cancelled && res.ok) {
          setWorkCenters(json.data ?? []);
        }
      } finally {
        if (!cancelled) setWcLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMO]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-800">
            Classificação técnica
          </p>
          {classBusy ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />
          ) : null}
        </div>
        <div
          role="note"
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 leading-relaxed"
        >
          <p className="font-medium text-slate-800">
            Sufixo de entrada e sequência do código
          </p>
          <p className="mt-1">
            <strong>HD1, HD2, AC</strong> — fabricados (composição opcional).{" "}
            <strong>HD3</strong> — revenda (sem composição; custo manual/compra).
            Classificação completa (família,
            subfamília, material, acabamento); código ex.:{" "}
            <span className="font-mono text-slate-900">HD1-A10A10-001</span>.{" "}
            <strong>MP, SE, EB, MC, RV, MO</strong> — só material e acabamento;
            código ex.: <span className="font-mono text-slate-900">MP-A10-001</span>{" "}
            ou <span className="font-mono text-slate-900">MO-A10-001</span>. A
            parte <span className="font-mono">-001</span> é a{" "}
            <strong>sequência</strong>, gerada ao guardar. A natureza MRP é
            derivada automaticamente do prefixo seleccionado. As famílias são{" "}
            <strong>por sufixo</strong> (HD1–HD3/AC partilham um catálogo; MP e
            outros sufixos simplificados têm o seu). Use{" "}
            Use <strong>+ Adicionar</strong> em cada campo. Ou cadastre em{" "}
            <Link
              href="/settings/product-families"
              className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              Definições → Famílias e classificação de produto
            </Link>
            .
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ClassificationSelectWithAdd
            id="prefix_id"
            label="Sufixo / prefixo"
            required
            value={formData.prefix_id}
            options={prefixes}
            loading={prefixesLoading}
            disabled={classFieldsDisabled}
            placeholder="Selecionar…"
            emptyLabel="Nenhum sufixo cadastrado"
            addLabel="+ Adicionar sufixo"
            onChange={handlePrefixChange}
            onAddClick={() => setQuickAdd("prefix")}
          />
          <p className="text-xs text-slate-500 md:col-span-2 -mt-2">
            Completo: HD1–HD3, AC. Simplificado: MP, SE, EB, MC, RV, MO e sufixos
            personalizados.
          </p>

          {formData.prefix_id ? (
            <>
              <ClassificationSelectWithAdd
                id="family_id"
                label={`Família${needsCompleteClassification ? " *" : ""}`}
                required={needsCompleteClassification}
                value={formData.family_id}
                options={families}
                loading={familiesLoading}
                disabled={classFieldsDisabled || !formData.prefix_id}
                placeholder="Selecionar…"
                emptyLabel="Nenhuma família neste sufixo"
                addLabel="+ Adicionar família"
                showExternalAdd
                onChange={(id) => {
                  onChange("family_id", id);
                  onChange("subfamily_id", "");
                }}
                onAddClick={() => setQuickAdd("family")}
              />
              {!needsCompleteClassification ? (
                <p className="text-xs text-slate-500 md:col-span-2 -mt-2">
                  Catálogo só deste sufixo (ex.: MP). Opcional no código técnico
                  (material + acabamento).
                </p>
              ) : (
                <p className="text-xs text-slate-500 md:col-span-2 -mt-2">
                  Catálogo HD1 / HD2 / HD3 / AC (partilhado).
                </p>
              )}
            </>
          ) : null}

          {needsCompleteClassification ? (
            <ClassificationSelectWithAdd
              id="subfamily_id"
              label="Sub-família"
              required
              value={formData.subfamily_id}
              options={subfamilies}
              loading={subLoading}
              disabled={classFieldsDisabled || !formData.family_id}
              placeholder={
                formData.family_id ? "Selecionar…" : "Escolha primeiro a família"
              }
              emptyLabel="Nenhuma sub-família nesta família"
              addLabel="+ Adicionar sub-família"
              showExternalAdd
              addDisabled={!formData.family_id}
              addDisabledHint="Seleccione primeiro a família."
              onChange={(id) => onChange("subfamily_id", id)}
              onAddClick={() => setQuickAdd("subfamily")}
            />
          ) : null}

          {showClassificationFields ? (
            <>
              <ClassificationSelectWithAdd
                id="classification_material_id"
                label="Material"
                required
                value={formData.material_id}
                options={materials}
                loading={materialsLoading}
                disabled={classFieldsDisabled}
                placeholder="Selecionar…"
                emptyLabel="Nenhum material cadastrado"
                addLabel="+ Adicionar material"
                showExternalAdd
                onChange={(id) => {
                  onChange("material_id", id);
                  onChange("finish_id", "");
                }}
                onAddClick={() => setQuickAdd("material")}
              />
              <ClassificationSelectWithAdd
                id="finish_id"
                label="Acabamento"
                required
                value={formData.finish_id}
                options={finishes}
                loading={finLoading}
                disabled={
                  classFieldsDisabled || !formData.material_id.trim()
                }
                placeholder={
                  formData.material_id ? "Selecionar…" : "Escolha primeiro o material"
                }
                emptyLabel="Nenhum acabamento para este material"
                addLabel="+ Adicionar acabamento"
                addDisabled={!formData.material_id.trim()}
                addDisabledHint="Escolha primeiro o material para adicionar acabamento."
                showExternalAdd
                onChange={(id) => onChange("finish_id", id)}
                onAddClick={() => setQuickAdd("finish")}
              />
            </>
          ) : null}

          {isMO ? (
            <div className="md:col-span-2 rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-4 space-y-4">
              <p className="text-sm font-medium text-slate-800">
                Mão-de-obra (prefixo MO)
              </p>
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Tipo de MO *</p>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="mo-labor-type"
                      className="mt-1"
                      checked={!formData.default_is_external_labor}
                      disabled={classBusy}
                      onChange={() => {
                        onChange("default_is_external_labor", false);
                        onChange("default_labor_cost", null);
                      }}
                    />
                    <span>
                      <strong>Interna</strong> — centro de trabalho da empresa;
                      o custo/hora vem do centro (preenchido no custo unitário).
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="mo-labor-type"
                      className="mt-1"
                      checked={formData.default_is_external_labor}
                      disabled={classBusy}
                      onChange={() => {
                        onChange("default_is_external_labor", true);
                        onChange("default_work_center_id", null);
                      }}
                    />
                    <span>
                      <strong>Externa</strong> — terceiros; indique o custo
                      unitário (R$) no campo de custo abaixo.
                    </span>
                  </label>
                </div>
              </div>

              {!formData.default_is_external_labor ? (
                <div className="space-y-2">
                  <Label htmlFor="default_work_center_id">
                    Centro de trabalho padrão *
                  </Label>
                  <select
                    id="default_work_center_id"
                    className={SELECT_CLASS}
                    required={isMO}
                    disabled={classBusy || wcLoading}
                    value={formData.default_work_center_id ?? ""}
                    onChange={(e) => {
                      const wcId = e.target.value.trim()
                        ? e.target.value
                        : null;
                      onChange("default_work_center_id", wcId);
                      if (wcId) {
                        const wc = workCenters.find((w) => w.id === wcId);
                        const rate = Number(wc?.hourly_cost ?? 0);
                        if (
                          rate > 0 &&
                          (!formData.cost_price || formData.cost_price === 0)
                        ) {
                          onChange("cost_price", rate);
                        }
                      }
                    }}
                  >
                    <option value="">
                      {wcLoading ? "A carregar…" : "Selecionar…"}
                    </option>
                    {workCenters
                      .filter((w) => w.is_active !== false)
                      .map((wc) => (
                        <option key={wc.id} value={wc.id}>
                          {wc.code} — {wc.name} ({fmtBrl(Number(wc.hourly_cost ?? 0))}
                          /h)
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}

          {classificationLocked ? (
            <div
              role="status"
              className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
            >
              Código técnico já gerado. Para alterar a classificação, crie um novo
              produto.
            </div>
          ) : null}

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="technical_code_ro">Código técnico</Label>
            <Input
              id="technical_code_ro"
              readOnly
              className="bg-slate-50 text-slate-800 font-mono"
              value={formData.technical_code ?? ""}
              placeholder="Será gerado automaticamente ao salvar"
              title={
                formData.technical_code
                  ? undefined
                  : "Guardar o produto para gerar o código (ex.: HD1-A10A10-001 ou MP-A10-001)"
              }
            />
            <p className="text-xs text-slate-500">
              Identificador único do produto. Gerado na base de dados a partir da
              classificação. Não é editável.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2 max-w-xl">
        <Label htmlFor="name">Nome *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Ex.: Parafuso Allen M6"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          value={formData.description ?? ""}
          onChange={(e) =>
            onChange("description", e.target.value.trim() ? e.target.value : null)
          }
          placeholder="Descrição comercial do produto"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label htmlFor="technical_description">
            Descrição técnica (para IA)
          </Label>
          {technicalDescriptionAction ? (
            <div className="shrink-0">{technicalDescriptionAction}</div>
          ) : null}
        </div>
        <Textarea
          id="technical_description"
          value={formData.technical_description ?? ""}
          onChange={(e) =>
            onChange(
              "technical_description",
              e.target.value.trim() ? e.target.value : null
            )
          }
          placeholder="Detalhes para sugestão de composição e NCM"
          rows={4}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ncm">NCM</Label>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
            <Input
              id="ncm"
              value={formData.ncm ?? ""}
              onChange={(e) =>
                onChange("ncm", e.target.value.trim() ? e.target.value : null)
              }
              placeholder="99.999.99/999-99"
              className="sm:flex-1"
            />
            {ncmAction ? (
              <div className="flex shrink-0 items-stretch">{ncmAction}</div>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="unit">Unidade *</Label>
          <select
            id="unit"
            className={SELECT_CLASS}
            value={formData.unit}
            onChange={(e) => onChange("unit", e.target.value)}
          >
            {PRODUCT_UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showDefaultProductionLine ? (
        <div className="space-y-2 max-w-md">
          <Label htmlFor="default_production_line_id">
            Linha de produção padrão
          </Label>
          <select
            id="default_production_line_id"
            className={SELECT_CLASS}
            disabled={plLoading}
            value={formData.default_production_line_id ?? ""}
            onChange={(e) =>
              onChange(
                "default_production_line_id",
                e.target.value.trim() ? e.target.value : null
              )
            }
          >
            <option value="">— Nenhuma —</option>
            {productionLines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </select>
          {plLoading ? (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> A carregar linhas…
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Usada pelo MRP ao gerar ordens de produção para este acabado.
            </p>
          )}
        </div>
      ) : null}

      {!hideCostField && needsSimplifiedClassification ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 space-y-2 max-w-md">
          <Label htmlFor="cost_price">Custo unitário (R$)</Label>
          <Input
            id="cost_price"
            type="number"
            step="0.01"
            min={0}
            className="max-w-xs bg-white"
            value={
              Number.isFinite(formData.cost_price) ? formData.cost_price : ""
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                onChange("cost_price", 0);
                return;
              }
              const n = parseFloat(v.replace(",", "."));
              onChange("cost_price", Number.isFinite(n) ? Math.max(0, n) : 0);
            }}
            placeholder="0,00"
          />
          <p className="text-xs text-slate-500">
            {isMO
              ? "MO: use o custo unitário (interna sem valor usa o custo/hora do centro). Registado no histórico de custos."
              : "Registado no histórico de custos. Referência para MRP e orçamentos."}
          </p>
        </div>
      ) : null}

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          id="is_active"
          checked={formData.is_active}
          onChange={(e) => onChange("is_active", e.target.checked)}
          className={cn(
            "mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700",
            "focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2"
          )}
        />
        <Label htmlFor="is_active" className="font-normal text-sm text-slate-700">
          Produto ativo (disponível para uso)
        </Label>
      </div>

      <QuickAddClassificationItemDialog
        open={quickAdd === "prefix"}
        config={quickAddPrefixConfig}
        onClose={() => setQuickAdd(null)}
        onCreated={async (row) => {
          await reloadPrefixes();
          handlePrefixChange(row.id);
        }}
      />
      {quickAddFamilyConfig ? (
        <QuickAddClassificationItemDialog
          open={quickAdd === "family"}
          config={quickAddFamilyConfig}
          onClose={() => setQuickAdd(null)}
          onCreated={async (row) => {
            const pid = formData.prefix_id.trim();
            if (!pid) return;
            await reloadFamilies(pid);
            onChange("family_id", row.id);
            onChange("subfamily_id", "");
          }}
        />
      ) : null}
      {quickAddSubfamilyConfig ? (
        <QuickAddClassificationItemDialog
          open={quickAdd === "subfamily"}
          config={quickAddSubfamilyConfig}
          onClose={() => setQuickAdd(null)}
          onCreated={async (row) => {
            const fid = formData.family_id.trim();
            if (!fid) return;
            await reloadSubfamilies(fid);
            onChange("subfamily_id", row.id);
          }}
        />
      ) : null}
      <QuickAddClassificationItemDialog
        open={quickAdd === "material"}
        config={quickAddMaterialConfig}
        onClose={() => setQuickAdd(null)}
        onCreated={async (row) => {
          await reloadMaterials();
          onChange("material_id", row.id);
          onChange("finish_id", "");
        }}
      />
      {quickAddFinishConfig ? (
        <QuickAddClassificationItemDialog
          open={quickAdd === "finish"}
          config={quickAddFinishConfig}
          onClose={() => setQuickAdd(null)}
          onCreated={async (row) => {
            const mid = formData.material_id.trim();
            if (!mid) return;
            await reloadFinishes(mid);
            onChange("finish_id", row.id);
          }}
        />
      ) : null}
    </div>
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True quando o prefixo seleccionado é MO. */
export function isProductFormMo(
  formData: Pick<ProductFormShape, "prefix_id">,
  prefixes: PrefixRow[]
): boolean {
  const p = prefixes.find((x) => x.id === formData.prefix_id.trim());
  return p?.code === "MO";
}

/** Lista de prefixos (mesmo endpoint do formulário), para validação no submit. */
export async function fetchProductPrefixesForForm(): Promise<PrefixRow[]> {
  const res = await fetch("/api/products/prefixes", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ClassListRow[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar prefixos");
  }
  return (json.data ?? []).map((row) => ({ id: row.id, code: row.code }));
}

function resolvePrefixCode(
  formData: Pick<ProductFormShape, "prefix_id">,
  prefixes: PrefixRow[]
): string {
  return prefixes.find((x) => x.id === formData.prefix_id.trim())?.code ?? "";
}

function simplifiedClassificationValidationMessage(
  formData: Pick<
    ProductFormShape,
    "prefix_id" | "material_id" | "finish_id"
  >,
  prefixes: PrefixRow[]
): string | null {
  const code = resolvePrefixCode(formData, prefixes);
  if (!isSimplifiedClassificationSuffix(code)) return null;
  if (!formData.material_id.trim() || !UUID_RE.test(formData.material_id.trim())) {
    return "Material é obrigatório para este prefixo.";
  }
  if (!formData.finish_id.trim() || !UUID_RE.test(formData.finish_id.trim())) {
    return "Acabamento é obrigatório para este prefixo.";
  }
  return null;
}

function completeClassificationValidationMessage(
  formData: Pick<
    ProductFormShape,
    "prefix_id" | "family_id" | "subfamily_id" | "material_id" | "finish_id"
  >,
  prefixes: PrefixRow[]
): string | null {
  const code = resolvePrefixCode(formData, prefixes);
  if (!isCompleteClassificationSuffix(code)) return null;
  const fields: [string, string][] = [
    ["prefix_id", formData.prefix_id.trim()],
    ["family_id", formData.family_id.trim()],
    ["subfamily_id", formData.subfamily_id.trim()],
    ["material_id", formData.material_id.trim()],
    ["finish_id", formData.finish_id.trim()],
  ];
  if (fields.some(([, v]) => !v || !UUID_RE.test(v))) {
    return "Prefixo, família, sub-família, material e acabamento são obrigatórios.";
  }
  return null;
}

/** Valida classificação conforme o sufixo seleccionado. */
export function productClassificationValidationMessage(
  formData: Pick<
    ProductFormShape,
    "prefix_id" | "family_id" | "subfamily_id" | "material_id" | "finish_id"
  >,
  prefixes: PrefixRow[]
): string | null {
  const code = resolvePrefixCode(formData, prefixes);
  if (!formData.prefix_id.trim() || !UUID_RE.test(formData.prefix_id.trim())) {
    return "Seleccione o sufixo / prefixo.";
  }
  if (isCompleteClassificationSuffix(code)) {
    return completeClassificationValidationMessage(formData, prefixes);
  }
  if (isSimplifiedClassificationSuffix(code)) {
    return simplifiedClassificationValidationMessage(formData, prefixes);
  }
  return `Prefixo «${code}» não suportado.`;
}

/** Valida campos de MO (tipo interna/externa, centro ou custo). */
export function moProductFieldsValidationMessage(
  formData: Pick<
    ProductFormShape,
    | "prefix_id"
    | "cost_price"
    | "default_is_external_labor"
    | "default_work_center_id"
  >,
  prefixes: PrefixRow[]
): string | null {
  const p = prefixes.find((x) => x.id === formData.prefix_id.trim());
  if (p?.code !== "MO") return null;
  if (formData.default_is_external_labor) {
    const c = Number(formData.cost_price ?? 0);
    if (!Number.isFinite(c) || c < 0) {
      return "Com prefixo MO (externa), indique o custo unitário (R$).";
    }
    return null;
  }
  if (!formData.default_work_center_id?.trim()) {
    return "Com prefixo MO (interna), seleccione o centro de trabalho padrão.";
  }
  return null;
}
