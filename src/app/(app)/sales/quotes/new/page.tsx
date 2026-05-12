"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";
import { QuoteFormFields } from "@/components/sales/quote-form-fields";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:opacity-60 " +
  "dark:bg-slate-950 dark:border-slate-600";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultValidUntilISODate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

type ProductOption = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  selling_price: number;
};

type QuoteLineDraft = {
  key: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  unit: string;
};

async function fetchSuggestion(): Promise<string> {
  const res = await fetch("/api/sales/quotes?suggest_number=1", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    suggestion?: string;
    error?: string;
  };
  if (!res.ok)
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao sugerir número"
    );
  if (!json.suggestion?.trim()) throw new Error("Resposta inválida");
  return json.suggestion.trim();
}

async function fetchProducts(): Promise<ProductOption[]> {
  const params = new URLSearchParams({
    is_active: "true",
    page: "1",
    limit: "500",
  });
  const res = await fetch(`/api/products?${params}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductOption[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao carregar produtos"
    );
  }
  return json.data ?? [];
}

function newLine(): QuoteLineDraft {
  return {
    key: crypto.randomUUID(),
    productId: "",
    quantity: 1,
    unitPrice: 0,
    unit: "UN",
  };
}

function lineSubtotal(line: QuoteLineDraft): number {
  const q = Number(line.quantity);
  const u = Number(line.unitPrice);
  if (!Number.isFinite(q) || !Number.isFinite(u)) return 0;
  return Math.round(q * u * 10000) / 10000;
}

async function createQuote(payload: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/sales/quotes", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok)
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao criar orçamento"
    );
}

export default function NewQuotePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();

  const [quoteNumber, setQuoteNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [quoteDate, setQuoteDate] = useState(todayISODate);
  const [validUntil, setValidUntil] = useState(defaultValidUntilISODate);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<QuoteLineDraft[]>(() => [newLine()]);

  const suggestionQuery = useQuery({
    queryKey: ["sales-quotes", "suggest-number"],
    queryFn: fetchSuggestion,
    enabled: !meLoading && me?.role === "admin",
    staleTime: 30_000,
    retry: 1,
  });

  useEffect(() => {
  useEffect(() => {
    const s = suggestionQuery.data?.trim();
    if (!s) return;
    setQuoteNumber((prev) => (prev.trim() === "" ? s : prev));
  }, [suggestionQuery.data]);
  }, [suggestionQuery.data]);

  const productsQuery = useQuery({
    queryKey: ["products", "quote-form-active"],
    queryFn: fetchProducts,
    enabled: !meLoading && me?.role === "admin",
    staleTime: 60_000,
  });

  const productById = useMemo(() => {
    const map = new Map<string, ProductOption>();
    for (const p of productsQuery.data ?? []) map.set(p.id, p);
    return map;
  }, [productsQuery.data]);

  const sortedProducts = useMemo(() => {
    return [...(productsQuery.data ?? [])].sort((a, b) =>
      `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "pt-BR")
    );
  }, [productsQuery.data]);

  useEffect(() => {
    if (meLoading) return;
    if (!me || me.role !== "admin") {
      toast.error("Apenas administradores podem criar orçamentos.");
      router.replace("/sales/quotes");
    }
  }, [me, meLoading, router]);

  const computedTotal = useMemo(
    () => lines.reduce((sum, l) => sum + lineSubtotal(l), 0),
    [lines]
  );

  const updateLine = (
    key: string,
    patch: Partial<Omit<QuoteLineDraft, "key">>
  ) => {
    setLines((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  };

  const handleProductChange = (key: string, productId: string) => {
    if (!productId) {
      updateLine(key, { productId: "", unitPrice: 0, unit: "UN" });
      return;
    }
    const p = productById.get(productId);
    updateLine(key, {
      productId,
      unitPrice: p ? Number(p.selling_price) : 0,
      unit: (p?.unit && p.unit.trim()) || "UN",
    });
  };

  const mutation = useMutation({
    mutationFn: createQuote,
    onSuccess: async () => {
      toast.success("Orçamento criado.");
      await queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
      router.push("/sales/quotes");
    },
  });

  const handleSuggestionRefresh = () => {
    void suggestionQuery.refetch().then((res) => {
      const next = typeof res.data === "string" ? res.data.trim() : "";
      if (next) setQuoteNumber(next);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (me?.role !== "admin") return;

    const qn = quoteNumber.trim();
    if (!qn) {
      toast.error("O número do orçamento é obrigatório.");
      return;
    }
    const cn = clientName.trim();
    if (!cn) {
      toast.error("O nome do cliente é obrigatório.");
      return;
    }

    const qd = quoteDate.trim();
    if (!qd) {
      toast.error("Indique a data do orçamento.");
      return;
    }
    const vu = validUntil.trim();
    if (!vu) {
      toast.error("Indique a validade.");
      return;
    }

    const builtItems: Array<Record<string, unknown>> = [];

    for (const line of lines) {
      if (!line.productId.trim()) continue;
      const prod = productById.get(line.productId);
      if (!prod) {
        toast.error("Produto inválido numa linha.");
        return;
      }
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        toast.error("Quantidade inválida (deve ser maior que zero).");
        return;
      }
      if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
        toast.error("Preço unitário inválido.");
        return;
      }
      builtItems.push({
        product_id: prod.id,
        description: `${prod.code} — ${prod.name}`,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        unit: line.unit.trim() || "UN",
      });
    }

    if (builtItems.length === 0) {
      toast.error("Adicione pelo menos um produto ao orçamento.");
      return;
    }

    const payload = {
      quote_number: qn,
      client_name: cn,
      client_document: clientDocument.trim() || null,
      client_email: clientEmail.trim() || null,
      client_phone: clientPhone.trim() || null,
      quote_date: qd.slice(0, 10),
      valid_until: vu.slice(0, 10),
      notes: notes.trim() || null,
      items: builtItems,
    };

    try {
      await mutation.mutateAsync(payload);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível criar o orçamento."
      );
    }
  };

  if (meLoading || !me || me.role !== "admin") {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">A validar permissões…</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/sales/quotes">
            <Button type="button" variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">Novo orçamento</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={suggestionQuery.isFetching}
          onClick={handleSuggestionRefresh}
        >
          {suggestionQuery.isFetching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              …
            </>
          ) : (
            "Nova sugestão de número"
          )}
        </Button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-slate-600" aria-hidden />
              Dados do orçamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {suggestionQuery.isError ? (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100">
                Não foi possível gerar automaticamente o número. Preencha no formato{" "}
                <strong className="font-medium">ORC-AAAA-NNNN</strong>.
              </p>
            ) : null}
            <QuoteFormFields
              quoteNumber={quoteNumber}
              onQuoteNumberChange={setQuoteNumber}
              clientName={clientName}
              onClientNameChange={setClientName}
              clientDocument={clientDocument}
              onClientDocumentChange={setClientDocument}
              clientEmail={clientEmail}
              onClientEmailChange={setClientEmail}
              clientPhone={clientPhone}
              onClientPhoneChange={setClientPhone}
              quoteDate={quoteDate}
              onQuoteDateChange={setQuoteDate}
              validUntil={validUntil}
              onValidUntilChange={setValidUntil}
              notes={notes}
              onNotesChange={setNotes}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900">
              Itens do orçamento
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((p) => [...p, newLine()])}
            >
              <Plus className="h-4 w-4" />
              Adicionar produto
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {productsQuery.error ? (
              <p className="text-sm text-red-700">
                {productsQuery.error instanceof Error
                  ? productsQuery.error.message
                  : "Erro ao carregar produtos."}
              </p>
            ) : null}

            <div className="space-y-4">
              {lines.map((line, index) => {
                const sub = lineSubtotal(line);
                return (
                  <div
                    key={line.key}
                    className={cn(
                      "rounded-lg border border-slate-200 p-4 space-y-3 dark:border-slate-800"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-700">
                        Item {index + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                        aria-label={`Remover item ${index + 1}`}
                        onClick={() =>
                          setLines((prev) =>
                            prev.length <= 1
                              ? prev
                              : prev.filter((r) => r.key !== line.key)
                          )
                        }
                        disabled={lines.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor={`product-${line.key}`}>Produto</Label>
                        <select
                          id={`product-${line.key}`}
                          className={SELECT_CLASS}
                          value={line.productId}
                          onChange={(e) =>
                            handleProductChange(line.key, e.target.value)
                          }
                          disabled={productsQuery.isLoading}
                        >
                          <option value="">— Selecione —</option>
                          {sortedProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} — {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`qty-${line.key}`}>Quantidade</Label>
                        <Input
                          id={`qty-${line.key}`}
                          type="number"
                          step="any"
                          min={0}
                          value={
                            Number.isFinite(line.quantity) ? String(line.quantity) : ""
                          }
                          onChange={(e) => {
                            const n = parseFloat(
                              e.target.value.replace(",", ".")
                            );
                            updateLine(line.key, {
                              quantity: Number.isFinite(n) ? n : 0,
                            });
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`price-${line.key}`}>
                          Valor unitário (R$)
                        </Label>
                        <Input
                          id={`price-${line.key}`}
                          type="number"
                          step="0.01"
                          min={0}
                          value={
                            Number.isFinite(line.unitPrice)
                              ? String(line.unitPrice)
                              : ""
                          }
                          onChange={(e) => {
                            const n = parseFloat(
                              e.target.value.replace(",", ".")
                            );
                            updateLine(line.key, {
                              unitPrice: Number.isFinite(n) ? n : 0,
                            });
                          }}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <p className="text-sm text-slate-600">
                          Subtotal do item:{" "}
                          <strong className="text-slate-900 tabular-nums">
                            {formatBRL(sub)}
                          </strong>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-1 dark:border-slate-800">
              <p className="text-base font-semibold text-slate-900">
                Total (soma das linhas):{" "}
                <span className="tabular-nums">{formatBRL(computedTotal)}</span>
              </p>
              <p className="text-xs text-slate-500">
                O valor final registado será o definido pela base de dados
                (subtotal das linhas, descontos e impostos podem aplicar‑se mais
                tarde ao editar o orçamento).
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 justify-end">
          <Link href="/sales/quotes">
            <Button type="button" variant="outline" size="sm">
              Cancelar
            </Button>
          </Link>
          <Button
            type="submit"
            size="sm"
            disabled={mutation.isPending || productsQuery.isLoading}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                A guardar…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Salvar
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
