"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
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

type ClassListRow = {
  id: string;
  code: string;
  name: string;
  sort_order?: number | null;
};

type PrefixRow = { id: string; code: string };

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBaseLoading(true);
      const fetchOpts: RequestInit = {
        credentials: "include",
        cache: "no-store",
      };
      try {
        const [pr, fa, ma] = await Promise.all([
          fetch("/api/products/prefixes", fetchOpts),
          fetch("/api/products/families", fetchOpts),
          fetch("/api/products/materials", fetchOpts),
        ]);
        let jpr: { data?: ClassListRow[] } = {};
        let jfa: { data?: ClassListRow[] } = {};
        let jma: { data?: ClassListRow[] } = {};
        try {
          jpr = (await pr.json()) as { data?: ClassListRow[] };
        } catch {
          /* ignore */
        }
        try {
          jfa = (await fa.json()) as { data?: ClassListRow[] };
        } catch {
          /* ignore */
        }
        try {
          jma = (await ma.json()) as { data?: ClassListRow[] };
        } catch {
          /* ignore */
        }
        if (cancelled) return;
        if (pr.ok) setPrefixes(jpr.data ?? []);
        if (fa.ok) setFamilies(jfa.data ?? []);
        if (ma.ok) setMaterials(jma.data ?? []);
      } finally {
        if (!cancelled) setBaseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fid = formData.family_id?.trim();
    if (!fid) {
      setSubfamilies([]);
      setSubLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setSubLoading(true);
      try {
        const res = await fetch(
          `/api/products/subfamilies?family_id=${encodeURIComponent(fid)}`,
          { credentials: "include", cache: "no-store" }
        );
        let json: { data?: ClassListRow[] } = {};
        try {
          json = (await res.json()) as { data?: ClassListRow[] };
        } catch {
          /* ignore */
        }
        if (!cancelled && res.ok) setSubfamilies(json.data ?? []);
      } finally {
        if (!cancelled) setSubLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formData.family_id]);

  useEffect(() => {
    const mid = formData.material_id?.trim();
    if (!mid) {
      setFinishes([]);
      setFinLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setFinLoading(true);
      try {
        const res = await fetch(
          `/api/products/finishes?material_id=${encodeURIComponent(mid)}`,
          { credentials: "include", cache: "no-store" }
        );
        let json: { data?: ClassListRow[] } = {};
        try {
          json = (await res.json()) as { data?: ClassListRow[] };
        } catch {
          /* ignore */
        }
        if (!cancelled && res.ok) setFinishes(json.data ?? []);
      } finally {
        if (!cancelled) setFinLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formData.material_id]);

  const classBusy = baseLoading;
  const classFieldsDisabled = classBusy || classificationLocked;
  const selectedPrefix = prefixes.find((p) => p.id === formData.prefix_id);
  const prefixCode = selectedPrefix?.code ?? "";
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
        <div className="flex items-center justify-between gap-2">
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
            <strong>HD1, HD2, HD3, AC</strong> — classificação completa (família,
            subfamília, material, acabamento); código ex.:{" "}
            <span className="font-mono text-slate-900">HD1-A10A10-001</span>.{" "}
            <strong>MP, SE, EB, MC, RV, MO</strong> — só material e acabamento;
            código ex.: <span className="font-mono text-slate-900">MP-A10-001</span>{" "}
            ou <span className="font-mono text-slate-900">MO-A10-001</span>. A
            parte <span className="font-mono">-001</span> é a{" "}
            <strong>sequência</strong>, gerada ao guardar. A natureza MRP é
            derivada automaticamente do prefixo seleccionado. Se as listas
            estiverem vazias, cadastre em{" "}
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
          <div className="space-y-2">
            <Label htmlFor="prefix_id">Sufixo / prefixo *</Label>
            <select
              id="prefix_id"
              className={SELECT_CLASS}
              required
              disabled={classFieldsDisabled}
              value={formData.prefix_id}
              onChange={(e) => {
                const v = e.target.value;
                onChange("prefix_id", v);
                const nextP = prefixes.find((x) => x.id === v);
                const nextCode = nextP?.code ?? "";
                if (isSimplifiedClassificationSuffix(nextCode)) {
                  onChange("family_id", "");
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
              }}
            >
              <option value="">Selecionar…</option>
              {prefixes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Completo: HD1–HD3, AC. Simplificado: MP, SE, EB, MC, RV, MO.
            </p>
          </div>

          {needsCompleteClassification ? (
            <div className="space-y-2">
              <Label htmlFor="family_id">Família *</Label>
              <select
                id="family_id"
                className={SELECT_CLASS}
                required
                disabled={classFieldsDisabled}
                value={formData.family_id}
                onChange={(e) => onChange("family_id", e.target.value)}
              >
                <option value="">Selecionar…</option>
                {families.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {needsCompleteClassification ? (
            <div className="space-y-2">
              <Label htmlFor="subfamily_id">Sub-família *</Label>
              <select
                id="subfamily_id"
                className={SELECT_CLASS}
                required
                disabled={
                  classFieldsDisabled || !formData.family_id || subLoading
                }
                value={formData.subfamily_id}
                onChange={(e) => onChange("subfamily_id", e.target.value)}
              >
                <option value="">
                  {formData.family_id
                    ? subLoading
                      ? "A carregar…"
                      : "Selecionar…"
                    : "Escolha primeiro a família"}
                </option>
                {subfamilies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {showClassificationFields ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="classification_material_id">Material *</Label>
                <select
                  id="classification_material_id"
                  className={SELECT_CLASS}
                  required
                  disabled={classFieldsDisabled}
                  value={formData.material_id}
                  onChange={(e) => onChange("material_id", e.target.value)}
                >
                  <option value="">Selecionar…</option>
                  {materials.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="finish_id">Acabamento *</Label>
                <select
                  id="finish_id"
                  className={SELECT_CLASS}
                  required
                  disabled={
                    classFieldsDisabled || !formData.material_id || finLoading
                  }
                  value={formData.finish_id}
                  onChange={(e) => onChange("finish_id", e.target.value)}
                >
                  <option value="">
                    {formData.material_id
                      ? finLoading
                        ? "A carregar…"
                        : "Selecionar…"
                      : "Escolha primeiro o material"}
                  </option>
                  {finishes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
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
