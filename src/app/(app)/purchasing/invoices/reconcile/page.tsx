"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  FileUp,
  Loader2,
  Save,
  Search,
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
import { ProductCatalogPickerModal } from "@/components/products/product-catalog-picker-modal";
import type { ProductSearchHit } from "@/components/products/product-search-types";
import type { PurchaseNFExtraction } from "@/modules/engenharia/lib/services/ai.service";
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

async function uploadInvoicePdf(file: File): Promise<ReconcileUploadResult> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/purchasing/invoices/upload", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ReconcileUploadResult;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao processar NF-e");
  }
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

function buildInitialMappings(data: ReconcileUploadResult): LineMapping[] {
  return data.invoiceData.items.map((item, index) => {
    const sug = data.suggestions.find((s) => s.invoiceLineIndex === index);
    const poItem = data.pendingItems.find(
      (p) => p.id === sug?.suggestedPurchaseOrderItemId
    );
    return {
      purchaseOrderItemId: sug?.suggestedPurchaseOrderItemId ?? "",
      purchaseOrderId: sug?.suggestedPurchaseOrderId ?? poItem?.purchaseOrderId ?? "",
      productId: sug?.suggestedProductId ?? poItem?.productId ?? "",
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? 0,
      isNewPurchase: !sug?.suggestedPurchaseOrderItemId,
    };
  });
}

export default function PurchaseInvoiceReconcilePage() {
  const router = useRouter();
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
  const [productPickerLine, setProductPickerLine] = useState<number | null>(null);

  const uploadMutation = useMutation({
    mutationFn: uploadInvoicePdf,
    onSuccess: (data) => {
      setReconcile(data);
      setSupplier(
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
      setMappings(buildInitialMappings(data));
      if (!data.supplier) {
        toast.warning(
          "Fornecedor não encontrado pelo CNPJ. Cadastre-o antes de confirmar."
        );
      } else {
        toast.success("NF-e interpretada. Revise a conciliação dos itens.");
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

      const payloadMappings = mappings.map((m, index) => {
        if (!m.productId.trim()) {
          throw new Error(`Item ${index + 1}: seleccione um produto.`);
        }
        if (!m.isNewPurchase && !m.purchaseOrderItemId.trim()) {
          throw new Error(
            `Item ${index + 1}: seleccione um item de pedido ou marque como nova compra.`
          );
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
      const poId = data?.primaryPurchaseOrderId;
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
    const po = reconcile?.pendingItems.find((p) => p.id === poItemId);
    updateMapping(index, {
      purchaseOrderItemId: poItemId,
      purchaseOrderId: po?.purchaseOrderId ?? "",
      productId: po?.productId ?? mappings[index]?.productId ?? "",
      isNewPurchase: false,
    });
  };

  const handleProductPick = (hit: ProductSearchHit) => {
    if (productPickerLine === null) return;
    updateMapping(productPickerLine, { productId: hit.id });
    setProductPickerLine(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f?.type === "application/pdf") {
      setFile(f);
    } else {
      toast.error("Envie um ficheiro PDF.");
    }
  };

  if (!canUse) {
    return <LoadingState label="A verificar permissões…" />;
  }

  const inv = reconcile?.invoiceData;

  return (
    <AppPage
      backHref="/purchasing/orders"
      backLabel="Pedidos de compra"
      width="default"
      density="comfortable"
      title={
        <div className="flex items-center gap-2">
          <FileUp className="h-6 w-6 text-brand-700" aria-hidden />
          <span>Importar NF-e (PDF)</span>
        </div>
      }
    >

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Upload do PDF</CardTitle>
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
              Arraste o PDF da NF-e ou seleccione o ficheiro
            </p>
            <Input
              type="file"
              accept="application/pdf"
              className="max-w-xs mx-auto"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
            Extrair com IA
          </Button>
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
                Associe cada linha da nota a um item de pedido pendente ou marque
                como nova compra (entrada directa no estoque).
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
                          {(reconcile?.pendingItems ?? []).map((po) => (
                            <option key={po.id} value={po.id}>
                              PC {po.poNumber} — {po.description.slice(0, 50)} (
                              pend. {po.pendingQuantity})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label className="text-xs">Produto</Label>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-sm text-slate-700 flex-1 min-w-[12rem]">
                          {map.productId ?
                            productLabelById.get(map.productId) ?? map.productId
                          : "Não seleccionado"}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setProductPickerLine(index)}
                        >
                          <Search className="h-3.5 w-3.5" />
                          Buscar produto
                        </Button>
                      </div>
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

      <ProductCatalogPickerModal
        open={productPickerLine !== null}
        onOpenChange={(open) => {
          if (!open) setProductPickerLine(null);
        }}
        onSelect={handleProductPick}
        excludeIds={[]}
        productType="all"
        showNewProductButton
        title="Associar produto à linha da NF-e"
      />
    </AppPage>
  );
}
