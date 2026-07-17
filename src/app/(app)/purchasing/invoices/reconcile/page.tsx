"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  FileUp,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { NumericInput } from "@/shared/ui/numeric-input";
import { AppPage } from "@/shared/ui/app-page";
import { LoadingState } from "@/shared/ui/page-helpers";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import {
  SupplierQuickCreateModal,
  type SupplierOption,
} from "@/components/purchasing/supplier-quick-create-modal";
import { ProductComboboxField } from "@/components/products/product-combobox-field";
import type { ProductSearchHit } from "@/components/products/product-search-types";
import type { PurchaseNFExtraction } from "@/modules/compras/lib/purchasing/purchase-nf-types";
import type {
  PendingPoItem,
  ReconcileUploadResult,
} from "@/modules/compras/lib/purchasing/purchase-invoice-reconcile";
import { cn } from "@/shared/utils/cn";
import { fmtBRL } from "@/shared/utils/format-brl";

type LineMapping = {
  purchaseOrderItemId: string;
  purchaseOrderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  isNewPurchase: boolean;
};

async function uploadInvoiceFile(
  file: File
): Promise<ReconcileUploadResult & { source?: "xml" | "pdf_ai" }> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/purchasing/invoices/upload", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ReconcileUploadResult & { source?: "xml" | "pdf_ai" };
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao processar NF-e");
  }
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

function isAllowedInvoiceFile(f: File): boolean {
  const name = f.name.toLowerCase();
  const type = (f.type || "").toLowerCase();
  if (name.endsWith(".pdf") || type === "application/pdf") return true;
  if (
    name.endsWith(".xml") ||
    type === "application/xml" ||
    type === "text/xml" ||
    type.includes("xml")
  ) {
    return true;
  }
  return false;
}

function buildInitialMappings(
  data: ReconcileUploadResult,
  preferredPoId?: string
): LineMapping[] {
  const usedPoItemIds = new Set<string>();

  return data.invoiceData.items.map((item, index) => {
    const sug = data.suggestions.find((s) => s.invoiceLineIndex === index);

    const candidates = (data.pendingItems ?? []).filter(
      (p) => !usedPoItemIds.has(p.id)
    );

    const preferredCandidates = preferredPoId
      ? candidates.filter((p) => p.purchaseOrderId === preferredPoId)
      : candidates;

    let poItem =
      (sug?.suggestedPurchaseOrderItemId
        ? preferredCandidates.find((p) => p.id === sug.suggestedPurchaseOrderItemId) ??
          candidates.find((p) => p.id === sug.suggestedPurchaseOrderItemId)
        : undefined) ??
      preferredCandidates.find((p) => {
        if (sug?.suggestedProductId && p.productId === sug.suggestedProductId) {
          return true;
        }
        return false;
      }) ??
      (preferredPoId && preferredCandidates.length === 1
        ? preferredCandidates[0]
        : undefined);

    if (!poItem && sug?.suggestedPurchaseOrderItemId) {
      poItem = candidates.find((p) => p.id === sug.suggestedPurchaseOrderItemId);
    }

    if (poItem) usedPoItemIds.add(poItem.id);

    return {
      purchaseOrderItemId: poItem?.id ?? "",
      purchaseOrderId: poItem?.purchaseOrderId ?? "",
      productId:
        sug?.suggestedProductId ?? poItem?.productId ?? "",
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? 0,
      isNewPurchase: !poItem,
    };
  });
}

function applyReconcileResult(
  data: ReconcileUploadResult & { source?: string },
  setters: {
    setReconcile: (d: ReconcileUploadResult) => void;
    setSupplier: (s: SupplierOption | null) => void;
    setMappings: (m: LineMapping[]) => void;
    setProductById: Dispatch<
      SetStateAction<Record<string, ProductSearchHit>>
    >;
  },
  preferredPoId?: string
) {
  setters.setReconcile(data);
  setters.setSupplier(
    data.supplier ?
      {
        id: data.supplier.id,
        name: data.supplier.name,
        document: data.supplier.document,
        email: null,
        phone: null,
        code: data.supplier.code,
      }
    : null
  );
  setters.setMappings(buildInitialMappings(data, preferredPoId));
  setters.setProductById((prev) => {
    const next = { ...prev };
    for (const p of data.productCandidates ?? []) {
      next[p.id] = {
        id: p.id,
        name: p.name,
        code: p.code,
        technical_code: p.technical_code,
        unit: p.unit,
        cost_price: 0,
      };
    }
    return next;
  });
}

export default function PurchaseInvoiceReconcilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inboxId = searchParams.get("inbox")?.trim() ?? "";
  const preferredPoId = searchParams.get("po")?.trim() ?? "";
  const { data: me, isLoading: meLoading } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canUse = !meLoading && (isAdmin || can("purchasing"));

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [reconcile, setReconcile] = useState<ReconcileUploadResult | null>(null);
  const [supplier, setSupplier] = useState<SupplierOption | null>(null);
  const [mappings, setMappings] = useState<LineMapping[]>([]);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [productById, setProductById] = useState<Record<string, ProductSearchHit>>(
    {}
  );
  const [inboxLoading, setInboxLoading] = useState(false);

  const preferredPoNumber = useMemo(() => {
    if (!preferredPoId || !reconcile) return null;
    return (
      reconcile.pendingItems.find((p) => p.purchaseOrderId === preferredPoId)
        ?.poNumber ?? null
    );
  }, [preferredPoId, reconcile]);

  const usedPoItemIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of mappings) {
      if (!m.isNewPurchase && m.purchaseOrderItemId.trim()) {
        s.add(m.purchaseOrderItemId.trim());
      }
    }
    return s;
  }, [mappings]);

  useEffect(() => {
    if (!canUse || !inboxId || reconcile) return;
    let cancelled = false;
    setInboxLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/faturamento/entrada/inbox/${encodeURIComponent(inboxId)}/reconcile-payload`,
          { credentials: "include", cache: "no-store" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          data?: ReconcileUploadResult;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar NF da inbox");
        if (!json.data || cancelled) return;
        applyReconcileResult(
          json.data,
          {
            setReconcile,
            setSupplier,
            setMappings,
            setProductById,
          },
          preferredPoId || undefined
        );
        toast.success("NF da inbox MDe carregada. Revise a conciliação.");
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Erro ao carregar inbox");
        }
      } finally {
        if (!cancelled) setInboxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canUse, inboxId, reconcile, preferredPoId]);

  const uploadMutation = useMutation({
    mutationFn: uploadInvoiceFile,
    onSuccess: (data) => {
      applyReconcileResult(
        data,
        {
          setReconcile,
          setSupplier,
          setMappings,
          setProductById,
        },
        preferredPoId || undefined
      );
      if (!data.supplier) {
        toast.warning(
          "Fornecedor não encontrado pelo CNPJ. Cadastre-o antes de confirmar."
        );
      } else {
        const via =
          data.source === "xml" ? "XML importado" : "PDF interpretado (IA)";
        toast.success(`${via}. Revise a conciliação dos itens.`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!reconcile) throw new Error("Carregue uma NF-e primeiro.");
      if (!supplier?.id) {
        throw new Error("Selecione ou cadastre o fornecedor.");
      }

      const linkedPoItems = new Set<string>();
      const payloadMappings = mappings.map((m, index) => {
        if (!m.productId.trim()) {
          throw new Error(`Item ${index + 1}: seleccione um produto.`);
        }
        if (!m.isNewPurchase && !m.purchaseOrderItemId.trim()) {
          throw new Error(
            `Item ${index + 1}: seleccione um item de pedido ou marque como nova compra.`
          );
        }
        if (!m.isNewPurchase && m.purchaseOrderItemId.trim()) {
          const poItemId = m.purchaseOrderItemId.trim();
          if (linkedPoItems.has(poItemId)) {
            throw new Error(
              `Item ${index + 1}: o item do pedido já está ligado a outra linha da nota.`
            );
          }
          linkedPoItems.add(poItemId);
        }
        return {
          invoiceLineIndex: index,
          productId: m.productId.trim(),
          quantity: m.quantity,
          unitPrice: m.unitPrice,
          purchaseOrderId: m.isNewPurchase ? null : m.purchaseOrderId || null,
          purchaseOrderItemId:
            m.isNewPurchase ? null : m.purchaseOrderItemId || null,
          isNewPurchase: m.isNewPurchase,
        };
      });

      const res = await fetch("/api/purchasing/invoices/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier.id,
          invoiceData: reconcile.invoiceData,
          mappings: payloadMappings,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { primaryPurchaseOrderId?: string | null };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao confirmar");
      return json.data;
    },
    onSuccess: (data) => {
      toast.success("Nota fiscal recebida e estoque actualizado.");
      const poId = preferredPoId || data?.primaryPurchaseOrderId;
      if (poId) router.push(`/purchasing/orders/${poId}`);
      else router.push("/purchasing/orders");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const productLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of reconcile?.productCandidates ?? []) {
      m.set(p.id, p.name);
    }
    return m;
  }, [reconcile?.productCandidates]);

  const updateMapping = useCallback(
    (index: number, patch: Partial<LineMapping>) => {
      setMappings((prev) =>
        prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
      );
    },
    []
  );

  const onPoItemSelect = (index: number, poItemId: string) => {
    if (!poItemId) {
      updateMapping(index, {
        purchaseOrderItemId: "",
        purchaseOrderId: "",
        isNewPurchase: false,
      });
      return;
    }
    const alreadyUsed = mappings.some(
      (m, i) =>
        i !== index &&
        !m.isNewPurchase &&
        m.purchaseOrderItemId === poItemId
    );
    if (alreadyUsed) {
      toast.error("Este item do pedido já está ligado a outra linha da nota.");
      return;
    }
    const po = reconcile?.pendingItems.find((p) => p.id === poItemId);
    updateMapping(index, {
      purchaseOrderItemId: poItemId,
      purchaseOrderId: po?.purchaseOrderId ?? "",
      productId: po?.productId ?? mappings[index]?.productId ?? "",
      isNewPurchase: false,
    });
  };

  const pendingItemsForLine = useCallback(
    (currentPoItemId: string) => {
      const items = [...(reconcile?.pendingItems ?? [])].filter(
        (po) =>
          po.id === currentPoItemId || !usedPoItemIds.has(po.id)
      );
      items.sort((a, b) => {
        if (preferredPoId) {
          const aPref = a.purchaseOrderId === preferredPoId ? 0 : 1;
          const bPref = b.purchaseOrderId === preferredPoId ? 0 : 1;
          if (aPref !== bPref) return aPref - bPref;
        }
        const byPo = a.poNumber.localeCompare(b.poNumber, "pt");
        if (byPo !== 0) return byPo;
        return a.description.localeCompare(b.description, "pt");
      });
      return items;
    },
    [reconcile?.pendingItems, usedPoItemIds, preferredPoId]
  );

  const productValueForLine = (productId: string): ProductSearchHit | null => {
    if (!productId) return null;
    if (productById[productId]) return productById[productId];
    const label = productLabelById.get(productId);
    return {
      id: productId,
      name: label ?? productId,
      code: null,
      technical_code: null,
      unit: null,
      cost_price: 0,
    };
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && isAllowedInvoiceFile(f)) {
      setFile(f);
    } else {
      toast.error("Envie um ficheiro PDF ou XML da NF-e.");
    }
  };

  if (!canUse || inboxLoading) {
    return (
      <LoadingState
        label={inboxLoading ? "A carregar NF da inbox…" : "A verificar permissões…"}
      />
    );
  }

  const inv = reconcile?.invoiceData;

  return (
    <AppPage
      backHref={
        preferredPoId
          ? `/purchasing/orders/${preferredPoId}`
          : "/purchasing/orders"
      }
      backLabel={
        preferredPoId
          ? preferredPoNumber
            ? `Voltar ao pedido ${preferredPoNumber}`
            : "Voltar ao pedido"
          : "Pedidos de compra"
      }
      width="default"
      density="comfortable"
      title={
        <div className="flex items-center gap-2">
          <FileUp className="h-6 w-6 text-brand-700" aria-hidden />
          <span>
            {preferredPoNumber
              ? `Conciliar NF-e · Pedido ${preferredPoNumber}`
              : "Importar NF-e (PDF ou XML)"}
          </span>
        </div>
      }
    >
      {preferredPoId ? (
        <p className="text-sm text-slate-600 -mt-2 mb-2">
          Importa a nota neste pedido. Cada linha da NF liga a no máximo um
          item de pedido (e cada item de pedido só pode ser usado numa linha).
          Linhas de outros PCs podem ser ligadas a outros pedidos na mesma
          nota.
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Upload do PDF ou XML</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              dragOver ?
                "border-brand-600 bg-brand-50/50"
              : "border-slate-300 dark:border-slate-600"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <FileUp className="h-10 w-10 mx-auto text-slate-400 mb-3" />
            <p className="text-sm text-slate-600 mb-3">
              Arraste o XML da NF-e ou o PDF (DANFE), ou seleccione o ficheiro
            </p>
            <Input
              type="file"
              accept=".pdf,.xml,application/pdf,application/xml,text/xml"
              className="max-w-xs mx-auto"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && !isAllowedInvoiceFile(f)) {
                  toast.error("Envie um ficheiro PDF ou XML da NF-e.");
                  e.target.value = "";
                  setFile(null);
                  return;
                }
                setFile(f);
              }}
            />
            {file ? (
              <p className="text-xs text-slate-500 mt-2">{file.name}</p>
            ) : null}
          </div>
          <Button
            type="button"
            disabled={!file || uploadMutation.isPending}
            onClick={() => file && uploadMutation.mutate(file)}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {file?.name.toLowerCase().endsWith(".xml")
              ? "Importar XML"
              : "Extrair PDF (IA)"}
          </Button>
          <p className="text-xs text-slate-500">
            Preferível o <strong>XML</strong> da NF-e (no Omie: Baixar XML) —
            leitura exacta, sem IA. PDF (DANFE) usa extração por IA e pode falhar
            se o ficheiro for só imagem.
          </p>
        </CardContent>
      </Card>

      {inv ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Dados extraídos</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <span className="text-slate-500">Fornecedor</span>
                <p className="font-medium">{inv.supplierName ?? "—"}</p>
              </div>
              <div>
                <span className="text-slate-500">CNPJ</span>
                <p className="font-medium">{inv.supplierDocument ?? "—"}</p>
              </div>
              <div>
                <span className="text-slate-500">NF-e n.º</span>
                <p className="font-medium">
                  {inv.invoiceNumber ?? "—"}
                  {inv.invoiceSeries ? ` / série ${inv.invoiceSeries}` : ""}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Emissão</span>
                <p className="font-medium">{inv.issueDate ?? "—"}</p>
              </div>
              {inv.totalAmount != null ? (
                <div>
                  <span className="text-slate-500">Total NF</span>
                  <p className="font-medium">{fmtBRL(inv.totalAmount)}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fornecedor no sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {supplier ? (
                <p className="text-sm">
                  <span className="font-medium">{supplier.name}</span>
                  {supplier.document ? (
                    <span className="text-slate-500"> — {supplier.document}</span>
                  ) : null}
                </p>
              ) : (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Fornecedor não encontrado. Cadastre-o para continuar.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSupplierModalOpen(true)}
              >
                {supplier ? "Alterar / cadastrar fornecedor" : "Cadastrar fornecedor"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. Conciliação de itens</CardTitle>
              <p className="text-sm text-slate-500 font-normal">
                Associe cada linha da nota a um item de pedido pendente. Um item
                de pedido só pode ser ligado a uma linha da nota. Se a nota
                cobrir vários pedidos, escolha o PC correcto em cada linha — ou
                marque como nova compra (entrada directa no estoque).
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {inv.items.map((item, index) => {
                const map = mappings[index];
                const sug = reconcile?.suggestions.find(
                  (s) => s.invoiceLineIndex === index
                );
                if (!map) return null;

                return (
                  <div
                    key={index}
                    className="rounded-lg border border-slate-200 p-4 space-y-3 dark:border-slate-700"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">
                          {item.description}
                        </p>
                        <p className="text-xs text-slate-500">
                          NF: {item.quantity} {item.unit ?? "UN"} ×{" "}
                          {fmtBRL(item.unitPrice ?? 0)}
                          {item.productCode ?
                            ` · código ${item.productCode}`
                          : ""}
                        </p>
                      </div>
                      {sug && sug.confidence > 0 ? (
                        <span className="text-xs rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                          Sugestão {Math.round(sug.confidence * 100)}%
                          {sug.matchReason ? ` — ${sug.matchReason}` : ""}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`new-${index}`}
                        checked={map.isNewPurchase}
                        onChange={(e) =>
                          updateMapping(index, {
                            isNewPurchase: e.target.checked,
                            purchaseOrderItemId: e.target.checked ?
                              ""
                            : map.purchaseOrderItemId,
                          })
                        }
                      />
                      <Label htmlFor={`new-${index}`} className="text-sm">
                        Nova compra (sem pedido — só estoque)
                      </Label>
                    </div>

                    {!map.isNewPurchase ? (
                      <div className="space-y-2">
                        <Label className="text-xs">Item do pedido de compra</Label>
                        <select
                          className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                          value={map.purchaseOrderItemId}
                          onChange={(e) => onPoItemSelect(index, e.target.value)}
                        >
                          <option value="">— Seleccionar —</option>
                          {pendingItemsForLine(map.purchaseOrderItemId).map(
                            (po) => {
                              const isPreferred =
                                preferredPoId &&
                                po.purchaseOrderId === preferredPoId;
                              return (
                                <option key={po.id} value={po.id}>
                                  {isPreferred ? "★ " : ""}
                                  PC {po.poNumber} — {po.description.slice(0, 50)}{" "}
                                  (pend. {po.pendingQuantity})
                                </option>
                              );
                            }
                          )}
                        </select>
                        {preferredPoId ? (
                          <p className="text-[11px] text-slate-500">
                            Itens com ★ são deste pedido. Os já ligados noutra
                            linha da nota deixam de aparecer.
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-500">
                            Itens já ligados noutra linha da nota deixam de
                            aparecer.
                          </p>
                        )}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label className="text-xs">Produto</Label>
                      <ProductComboboxField
                        value={productValueForLine(map.productId)}
                        onChange={(hit) => {
                          if (hit) {
                            setProductById((prev) => ({
                              ...prev,
                              [hit.id]: hit,
                            }));
                            updateMapping(index, { productId: hit.id });
                          } else {
                            updateMapping(index, { productId: "" });
                          }
                        }}
                        productType="all"
                        showNewProductButton
                        catalogTitle="Associar produto à linha da NF-e"
                        placeholder="Digite código ou descrição…"
                        compact
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 max-w-md">
                      <div className="space-y-1">
                        <Label className="text-xs">Qtd. a receber</Label>
                        <NumericInput
                          value={map.quantity}
                          onChange={(quantity) =>
                            updateMapping(index, { quantity })
                          }
                          maxDecimals={4}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Preço unit. NF</Label>
                        <NumericInput
                          value={map.unitPrice}
                          onChange={(unitPrice) =>
                            updateMapping(index, { unitPrice })
                          }
                          maxDecimals={2}
                          className="h-8"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="lg"
              disabled={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
            >
              {confirmMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Confirmar conciliação
            </Button>
          </div>
        </>
      ) : null}

      <SupplierQuickCreateModal
        open={supplierModalOpen}
        onOpenChange={setSupplierModalOpen}
        onCreated={(s) => {
          setSupplier(s);
          setSupplierModalOpen(false);
          toast.success("Fornecedor cadastrado.");
        }}
      />

    </AppPage>
  );
}
