"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import type { ProductType } from "@/lib/types/product.types";
import type { ProductNatureCode } from "@/lib/products/mrp-product-nature";
import { PRODUCT_NATURE_LABELS } from "@/lib/products/mrp-product-nature";

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
  /** Soma efectiva dos impostos em % quando BDI personalizado */
  custom_tax_rate: number | null;
  custom_profit_margin: number | null;
  /** IDs da classificação técnica (UUID ou string vazia) */
  prefix_id: string;
  family_id: string;
  subfamily_id: string;
  material_id: string;
  finish_id: string;
  /** Código MRP (MP, SE, …) ou vazio até o utilizador escolher */
  product_nature: ProductNatureCode | "";
  /** Preenchido pelo servidor após INSERT (identificador principal) */
  technical_code: string | null;
};

type ClassListRow = {
  id: string;
  code: string;
  name: string;
  sort_order?: number | null;
};

type FieldHandlers = {
  onChange<K extends keyof ProductFormShape>(
    field: K,
    value: ProductFormShape[K]
  ): void;
  onSellingPriceInput(value: string): void;
};

type Props = {
  formData: ProductFormShape;
  sellingPriceDisplay: string;
  /** Botão / ações ao lado do campo NCM (ex.: sugestão IA). */
  ncmAction?: ReactNode;
  /** Botão junto ao rótulo da descrição técnica (ex.: sugestão BOM). */
  technicalDescriptionAction?: ReactNode;
  /** Secção opcional sob BDI (ex.: calcular preço na edição). */
  pricingActionSlot?: ReactNode;
} & FieldHandlers;

export function ProductFormFields({
  formData,
  sellingPriceDisplay,
  onChange,
  onSellingPriceInput,
  ncmAction,
  technicalDescriptionAction,
  pricingActionSlot,
}: Props) {
  const [prefixes, setPrefixes] = useState<ClassListRow[]>([]);
  const [families, setFamilies] = useState<ClassListRow[]>([]);
  const [materials, setMaterials] = useState<ClassListRow[]>([]);
  const [subfamilies, setSubfamilies] = useState<ClassListRow[]>([]);
  const [finishes, setFinishes] = useState<ClassListRow[]>([]);
  const [baseLoading, setBaseLoading] = useState(true);
  const [subLoading, setSubLoading] = useState(false);
  const [finLoading, setFinLoading] = useState(false);

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
            Onde está o «sufixo» do código técnico?
          </p>
          <p className="mt-1">
            No exemplo <span className="font-mono text-slate-900">HD1-A10A10-001</span>, a parte final{' '}
            <span className="font-mono text-slate-900">-001</span> é o{' '}
            <strong>sufixo numérico</strong> (sequência). Ele{" "}
            <strong>não aparece como campo</strong>: a base de dados atribui automaticamente o próximo
            número (001, 002…) quando grava o produto, depois de escolher prefixo, família, sub-família,
            material e acabamento. Comece por <strong>Prefixo</strong> e <strong>Família</strong>. Se as
            listas estiverem vazias, cadastre os dados em{" "}
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
            <Label htmlFor="prefix_id">Prefixo *</Label>
            <select
              id="prefix_id"
              className={SELECT_CLASS}
              required
              disabled={classBusy}
              value={formData.prefix_id}
              onChange={(e) => onChange("prefix_id", e.target.value)}
            >
              <option value="">Selecionar…</option>
              {prefixes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="family_id">Família *</Label>
            <select
              id="family_id"
              className={SELECT_CLASS}
              required
              disabled={classBusy}
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
          <div className="space-y-2">
            <Label htmlFor="subfamily_id">Sub-família *</Label>
            <select
              id="subfamily_id"
              className={SELECT_CLASS}
              required
              disabled={classBusy || !formData.family_id || subLoading}
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
          <div className="space-y-2">
            <Label htmlFor="classification_material_id">Material *</Label>
            <select
              id="classification_material_id"
              className={SELECT_CLASS}
              required
              disabled={classBusy}
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
              disabled={classBusy || !formData.material_id || finLoading}
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
                  : "Guardar o produto para gerar o código HD1-A10A10-001"
              }
            />
            <p className="text-xs text-slate-500">
              Identificador único do produto. Gerado na base de dados a partir da
              classificação (ex.: HD1-A10A10-001). Não é editável.
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="product_nature">Natureza *</Label>
            <select
              id="product_nature"
              className={SELECT_CLASS}
              required
              disabled={classBusy}
              value={formData.product_nature}
              onChange={(e) =>
                onChange(
                  "product_nature",
                  e.target.value as ProductFormShape["product_nature"]
                )
              }
            >
              <option value="">Selecionar…</option>
              {(Object.keys(PRODUCT_NATURE_LABELS) as ProductNatureCode[]).map(
                (code) => (
                  <option key={code} value={code}>
                    {PRODUCT_NATURE_LABELS[code]}
                  </option>
                )
              )}
            </select>
            <p className="text-xs text-slate-500">
              Define se o MRP trata o item como compra, produção ou semi-elaborado
              (com composição).
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="type">Tipo *</Label>
          <select
            id="type"
            className={SELECT_CLASS}
            value={formData.type}
            onChange={(e) =>
              onChange("type", e.target.value as ProductFormShape["type"])
            }
          >
            <option value="finished">Acabado (produto final)</option>
            <option value="raw">Matéria-prima</option>
            <option value="component">Componente (intermediário)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="selling_price">Preço de venda (R$)</Label>
          <Input
            id="selling_price"
            type="text"
            inputMode="numeric"
            value={sellingPriceDisplay}
            onChange={(e) => onSellingPriceInput(e.target.value)}
            placeholder="0,00"
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          BDI — precificação
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Custo base (R$)</Label>
            <Input
              disabled
              className="bg-white dark:bg-slate-950"
              value={
                Number.isFinite(formData.cost_price) && formData.cost_price !== 0
                  ? Number(formData.cost_price).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "0,00"
              }
              readOnly
            />
            <p className="text-xs text-slate-500">
              O custo típico vem da estrutura do produto (BOM); pode ser alterado ao
              recalcular a lista de materiais.
            </p>
          </div>
          <div className="flex items-start gap-2 md:col-span-2">
            <input
              type="checkbox"
              id="use_custom_bdi"
              checked={formData.use_custom_bdi}
              onChange={(e) => onChange("use_custom_bdi", e.target.checked)}
              className={cn(
                "mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700",
                "focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2"
              )}
            />
            <Label htmlFor="use_custom_bdi" className="font-normal text-sm">
              Usar BDI personalizado (sobrepor soma fiscal e margem respectivas ao
              tenant)
            </Label>
          </div>
          {formData.use_custom_bdi ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="custom_tax_rate">Alíquota fiscal efectiva (%)</Label>
                <Input
                  id="custom_tax_rate"
                  type="number"
                  step="0.01"
                  min={0}
                  value={
                    formData.custom_tax_rate != null
                      ? String(formData.custom_tax_rate)
                      : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (v === "") onChange("custom_tax_rate", null);
                    else {
                      const n = parseFloat(v.replace(",", "."));
                      onChange(
                        "custom_tax_rate",
                        Number.isFinite(n) ? n : null
                      );
                    }
                  }}
                  placeholder="Total impostos (%)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom_profit_margin">Margem de lucro (%)</Label>
                <Input
                  id="custom_profit_margin"
                  type="number"
                  step="0.01"
                  min={0}
                  value={
                    formData.custom_profit_margin != null
                      ? String(formData.custom_profit_margin)
                      : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (v === "") onChange("custom_profit_margin", null);
                    else {
                      const n = parseFloat(v.replace(",", "."));
                      onChange(
                        "custom_profit_margin",
                        Number.isFinite(n) ? n : null
                      );
                    }
                  }}
                  placeholder="Margem sobre custo na fórmula"
                />
              </div>
            </>
          ) : null}
          {pricingActionSlot ? (
            <div className="md:col-span-2 space-y-2">{pricingActionSlot}</div>
          ) : null}
        </div>
      </div>

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

/** Converte dígitos escritos pelo utilizador para valor em reais (máscara centavos). */
export function parseSellingPriceDigits(input: string): number {
  const digits = input.replace(/\D/g, "");
  const cents = parseInt(digits || "0", 10);
  return cents / 100;
}

export function sellingPriceDigitsToDisplay(price: number): string {
  if (!price || Number(price) === 0) return "";
  return Number(price).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
