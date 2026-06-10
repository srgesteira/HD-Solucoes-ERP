"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { menuAlertsQueryKey } from "@/hooks/use-menu-alerts";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import type { ProductSearchHit } from "@/components/products/product-search-types";
import { ClassificationSelectWithAdd } from "@/components/products/classification-select-with-add";
import {
  QuickAddClassificationItemDialog,
  type QuickAddClassificationConfig,
} from "@/components/products/quick-add-classification-item-dialog";
import { validateClassificationCatalogCode } from "@/modules/engenharia/lib/products/classification-catalog-codes";
import {
  isCompleteClassificationSuffix,
  isSimplifiedClassificationSuffix,
} from "@/modules/engenharia/lib/products/prefix-classification";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 " +
  "dark:bg-slate-950 dark:border-slate-600";

type ClassRow = { id: string; code: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceQuoteId?: string | null;
  onCreated: (product: ProductSearchHit) => void;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar dados");
  return json.data as T;
}

export function ProductCommercialQuickCreateModal({
  open,
  onOpenChange,
  sourceQuoteId,
  onCreated,
}: Props) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("UN");
  const [prefixId, setPrefixId] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [subfamilyId, setSubfamilyId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [finishId, setFinishId] = useState("");
  const [prefixes, setPrefixes] = useState<ClassRow[]>([]);
  const [families, setFamilies] = useState<ClassRow[]>([]);
  const [subfamilies, setSubfamilies] = useState<ClassRow[]>([]);
  const [materials, setMaterials] = useState<ClassRow[]>([]);
  const [finishes, setFinishes] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [finLoading, setFinLoading] = useState(false);
  const [familiesLoading, setFamiliesLoading] = useState(false);
  const [quickAdd, setQuickAdd] = useState<"family" | "subfamily" | null>(null);

  const selectedPrefix = prefixes.find((p) => p.id === prefixId);
  const selectedFamily = families.find((f) => f.id === familyId);
  const prefixCode = selectedPrefix?.code ?? "";
  const needsComplete = isCompleteClassificationSuffix(prefixCode);
  const showClassFields =
    prefixCode &&
    (needsComplete || isSimplifiedClassificationSuffix(prefixCode)) &&
    !prefixCode.startsWith("MO");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setUnit("UN");
      setPrefixId("");
      setFamilyId("");
      setSubfamilyId("");
      setMaterialId("");
      setFinishId("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [pfx, mat] = await Promise.all([
          fetchJson<ClassRow[]>("/api/products/prefixes"),
          fetchJson<ClassRow[]>("/api/products/materials"),
        ]);
        if (cancelled) return;
        const finishedPrefixes = pfx.filter((p) =>
          ["HD1", "HD2", "HD3", "AC"].includes(p.code.toUpperCase())
        );
        setPrefixes(finishedPrefixes.length ? finishedPrefixes : pfx);
        setMaterials(mat);
        const defaultPfx =
          finishedPrefixes.find((p) => p.code === "HD1") ?? finishedPrefixes[0];
        if (defaultPfx) setPrefixId(defaultPfx.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar listas");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !prefixId) {
      setFamilies([]);
      setFamilyId("");
      setSubfamilyId("");
      return;
    }
    let cancelled = false;
    (async () => {
      setFamiliesLoading(true);
      try {
        const fam = await fetchJson<ClassRow[]>(
          `/api/products/families?prefix_id=${encodeURIComponent(prefixId)}`
        );
        if (cancelled) return;
        setFamilies(fam);
        if (familyId && !fam.some((f) => f.id === familyId)) {
          setFamilyId("");
          setSubfamilyId("");
        }
      } catch {
        if (!cancelled) setFamilies([]);
      } finally {
        if (!cancelled) setFamiliesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, prefixId]);

  useEffect(() => {
    if (!open || !familyId) {
      setSubfamilies([]);
      return;
    }
    let cancelled = false;
    setSubLoading(true);
    (async () => {
      try {
        const subs = await fetchJson<ClassRow[]>(
          `/api/products/subfamilies?family_id=${encodeURIComponent(familyId)}`
        );
        if (!cancelled) setSubfamilies(subs);
      } catch {
        if (!cancelled) setSubfamilies([]);
      } finally {
        if (!cancelled) setSubLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, familyId]);

  useEffect(() => {
    if (!open || !materialId) {
      setFinishes([]);
      return;
    }
    let cancelled = false;
    setFinLoading(true);
    (async () => {
      try {
        const fin = await fetchJson<ClassRow[]>(
          `/api/products/finishes?material_id=${encodeURIComponent(materialId)}`
        );
        if (!cancelled) setFinishes(fin);
      } catch {
        if (!cancelled) setFinishes([]);
      } finally {
        if (!cancelled) setFinLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, materialId]);

  const quickAddFamilyConfig: QuickAddClassificationConfig | null = prefixId
    ? {
        title: "Nova família",
        contextHint: selectedPrefix
          ? `Será criada só para o sufixo ${selectedPrefix.code} — ${selectedPrefix.name}.`
          : undefined,
        validateCode: validateClassificationCatalogCode,
        postUrl: "/api/products/families",
        buildBody: ({ code, name, description }) => ({
          prefix_id: prefixId,
          code,
          name,
          description,
        }),
      }
    : null;

  const quickAddSubfamilyConfig: QuickAddClassificationConfig | null = familyId
    ? {
        title: "Nova sub-família",
        contextHint: selectedFamily
          ? `Será criada só para a família ${selectedFamily.code} — ${selectedFamily.name}.`
          : undefined,
        validateCode: validateClassificationCatalogCode,
        postUrl: "/api/products/subfamilies",
        buildBody: ({ code, name, description }) => ({
          family_id: familyId,
          code,
          name,
          description,
        }),
      }
    : null;

  async function reloadFamilies() {
    if (!prefixId) return [];
    const fam = await fetchJson<ClassRow[]>(
      `/api/products/families?prefix_id=${encodeURIComponent(prefixId)}`
    );
    setFamilies(fam);
    return fam;
  }

  async function reloadSubfamilies() {
    if (!familyId) return [];
    setSubLoading(true);
    try {
      const subs = await fetchJson<ClassRow[]>(
        `/api/products/subfamilies?family_id=${encodeURIComponent(familyId)}`
      );
      setSubfamilies(subs);
      return subs;
    } finally {
      setSubLoading(false);
    }
  }

  const canSubmit = useMemo(() => {
    if (!name.trim() || !prefixId || !unit.trim()) return false;
    if (!showClassFields) return false;
    if (needsComplete && (!familyId || !subfamilyId)) return false;
    return Boolean(materialId && finishId);
  }, [
    name,
    prefixId,
    unit,
    showClassFields,
    needsComplete,
    familyId,
    subfamilyId,
    materialId,
    finishId,
  ]);

  const handleSubmit = async (
    e?: React.FormEvent | React.MouseEvent<HTMLButtonElement>
  ) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sales/products/quick-create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          unit: unit.trim() || "UN",
          prefix_id: prefixId,
          family_id: needsComplete ? familyId : null,
          subfamily_id: needsComplete ? subfamilyId : null,
          material_id: materialId,
          finish_id: finishId,
          source_quote_id: sourceQuoteId ?? null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: {
          id: string;
          name: string;
          technical_code: string | null;
          code: string | null;
          unit: string | null;
          cost_price: number;
        };
        error?: string;
      };
      if (!res.ok || !json.data?.id) {
        throw new Error(json.error ?? "Erro ao criar produto");
      }
      const p = json.data;
      toast.success(
        "Produto registado. A engenharia irá criar a estrutura e libertar o custo."
      );
      onCreated({
        id: p.id,
        name: p.name,
        technical_code: p.technical_code,
        code: p.code,
        unit: p.unit,
        cost_price: Number(p.cost_price ?? 0),
      });
      void queryClient.invalidateQueries({ queryKey: menuAlertsQueryKey });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar produto");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="commercial-product-create-title"
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="commercial-product-create-title"
          className="text-lg font-semibold text-slate-900"
        >
          Adicionar produto
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Cadastro rápido para o orçamento. A engenharia criará a estrutura (BOM) e
          libertará o custo para aplicar markup.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-slate-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar…
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="commercial-product-name">Nome *</Label>
              <Input
                id="commercial-product-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ex.: Caixa especial projeto X"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commercial-product-desc">Descrição</Label>
              <Textarea
                id="commercial-product-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="commercial-product-unit">Unidade *</Label>
                <Input
                  id="commercial-product-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-product-prefix">Prefixo *</Label>
                <select
                  id="commercial-product-prefix"
                  className={SELECT_CLASS}
                  value={prefixId}
                  required
                  onChange={(e) => {
                    setPrefixId(e.target.value);
                    setFamilyId("");
                    setSubfamilyId("");
                    setMaterialId("");
                    setFinishId("");
                  }}
                >
                  <option value="">Selecionar…</option>
                  {prefixes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {needsComplete ? (
              <>
                <ClassificationSelectWithAdd
                  id="commercial-product-family"
                  label="Família"
                  required
                  value={familyId}
                  options={families}
                  loading={familiesLoading}
                  disabled={!prefixId}
                  placeholder="Selecionar…"
                  emptyLabel="Nenhuma família neste sufixo"
                  addLabel="+ Adicionar família"
                  showExternalAdd
                  onChange={(id) => {
                    setFamilyId(id);
                    setSubfamilyId("");
                  }}
                  onAddClick={() => setQuickAdd("family")}
                />
                <ClassificationSelectWithAdd
                  id="commercial-product-subfamily"
                  label="Sub-família"
                  required
                  value={subfamilyId}
                  options={subfamilies}
                  loading={subLoading}
                  disabled={!familyId}
                  placeholder={
                    familyId ? "Selecionar…" : "Escolha primeiro a família"
                  }
                  emptyLabel="Nenhuma sub-família nesta família"
                  addLabel="+ Adicionar sub-família"
                  showExternalAdd
                  addDisabled={!familyId}
                  addDisabledHint="Seleccione primeiro a família."
                  onChange={setSubfamilyId}
                  onAddClick={() => setQuickAdd("subfamily")}
                />
              </>
            ) : null}

            {showClassFields ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="commercial-product-material">Material *</Label>
                  <select
                    id="commercial-product-material"
                    className={SELECT_CLASS}
                    value={materialId}
                    required
                    onChange={(e) => {
                      setMaterialId(e.target.value);
                      setFinishId("");
                    }}
                  >
                    <option value="">Selecionar…</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} — {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commercial-product-finish">Acabamento *</Label>
                  <select
                    id="commercial-product-finish"
                    className={SELECT_CLASS}
                    value={finishId}
                    required
                    disabled={!materialId || finLoading}
                    onChange={(e) => setFinishId(e.target.value)}
                  >
                    <option value="">
                      {materialId
                        ? finLoading
                          ? "A carregar…"
                          : "Selecionar…"
                        : "Escolha o material"}
                    </option>
                    {finishes.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.code} — {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!canSubmit || saving}
                onClick={(e) => void handleSubmit(e)}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Criar e usar no orçamento"
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(
    <>
      {modal}
      {quickAddFamilyConfig ? (
        <QuickAddClassificationItemDialog
          open={quickAdd === "family"}
          config={quickAddFamilyConfig}
          onClose={() => setQuickAdd(null)}
          onCreated={async (row) => {
            await reloadFamilies();
            setFamilyId(row.id);
            setSubfamilyId("");
          }}
        />
      ) : null}
      {quickAddSubfamilyConfig ? (
        <QuickAddClassificationItemDialog
          open={quickAdd === "subfamily"}
          config={quickAddSubfamilyConfig}
          onClose={() => setQuickAdd(null)}
          onCreated={async (row) => {
            await reloadSubfamilies();
            setSubfamilyId(row.id);
          }}
        />
      ) : null}
    </>,
    document.body
  );
}
