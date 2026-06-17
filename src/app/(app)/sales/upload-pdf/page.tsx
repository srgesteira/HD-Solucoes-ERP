"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { AppPage } from "@/shared/ui/app-page";
import { EmptyState } from "@/shared/ui/page-helpers";
import { useMe } from "@/hooks/use-me";
import type { OrderPdfExtraction } from "@/modules/engenharia/lib/services/ai.service";

async function extractPdf(file: File): Promise<OrderPdfExtraction> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/ai/extract-pdf-order", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: OrderPdfExtraction;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro na extração"
    );
  }
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function createQuoteFromExtracted(payload: {
  client_name: string;
  client_document?: string;
  client_email?: string;
  client_phone?: string;
  items: OrderPdfExtraction["items"];
}): Promise<{ id: string }> {
  const body = {
    client_name: payload.client_name.trim(),
    client_document: payload.client_document?.trim() || undefined,
    client_email: payload.client_email?.trim() || undefined,
    client_phone: payload.client_phone?.trim() || undefined,
    items: payload.items.map((it) => ({
      description: it.description.trim(),
      quantity: it.quantity,
      unit_price: 0,
      unit: (it.unit?.trim() || "UN").slice(0, 16),
    })),
  };
  const res = await fetch("/api/sales/quotes", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { id?: string };
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao criar orçamento"
    );
  }
  const id = json.data?.id;
  if (!id) throw new Error("Resposta inválida");
  return { id };
}

export default function SalesUploadPdfPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<OrderPdfExtraction | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const extractMutation = useMutation({
    mutationFn: async (f: File) => extractPdf(f),
    onSuccess: (data) => {
      setPreview(data);
      const name =
        typeof data.clientName === "string" && data.clientName.trim() ?
          data.clientName.trim()
        : "";
      setClientName(name);
      setClientDocument(
        typeof data.clientDocument === "string" ? data.clientDocument.trim() : ""
      );
      setClientEmail(
        typeof data.clientEmail === "string" ? data.clientEmail.trim() : ""
      );
      setClientPhone(
        typeof data.clientPhone === "string" ? data.clientPhone.trim() : ""
      );
      toast.success("PDF interpretado. Revise os dados antes de criar o orçamento.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Extraia um PDF primeiro.");
      const name = clientName.trim();
      if (!name) throw new Error("Indique o nome do cliente.");
      const items = (preview.items ?? []).filter(
        (it) => it.description?.trim() && Number(it.quantity) > 0
      );
      if (!items.length) throw new Error("Nenhuma linha válida para o orçamento.");
      return createQuoteFromExtracted({
        client_name: name,
        client_document: clientDocument.trim() || undefined,
        client_email: clientEmail.trim() || undefined,
        client_phone: clientPhone.trim() || undefined,
        items,
      });
    },
    onSuccess: ({ id }) => {
      toast.success("Orçamento criado.");
      router.push(`/sales/quotes/${id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isAdmin = me?.role === "admin";

  if (!meLoading && !isAdmin) {
    return (
      <AppPage
        title="Orçamento a partir de PDF"
        backHref="/sales/quotes"
        backLabel="Voltar aos orçamentos"
        width="narrow"
      >
        <EmptyState
          title="Sem permissão"
          description="Apenas administradores podem importar PDF para orçamento."
        />
      </AppPage>
    );
  }

  return (
    <AppPage
      title={
        <div className="flex items-center gap-2">
          <FileUp className="h-6 w-6 text-brand-700" aria-hidden />
          <span>Orçamento a partir de PDF</span>
        </div>
      }
      description="Importe um PDF e gere um orçamento em rascunho automaticamente"
      backHref="/sales/quotes"
      width="narrow"
      density="comfortable"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Extração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Envie um PDF com texto seleccionável (não digitalizado como imagem
            pura). A IA extrai cliente e linhas; depois pode criar um orçamento
            em rascunho com preços zero para completar no editor.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="pdf-file">Ficheiro PDF</Label>
            <Input
              id="pdf-file"
              type="file"
              accept="application/pdf"
              disabled={extractMutation.isPending || meLoading}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setPreview(null);
              }}
            />
          </div>
          <Button
            type="button"
            disabled={!file || extractMutation.isPending || meLoading}
            onClick={() => {
              if (file) extractMutation.mutate(file);
            }}
          >
            {extractMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                A processar…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Extrair com IA
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="client-name">Cliente *</Label>
                <Input
                  id="client-name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nome do cliente"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-doc">CPF / CNPJ</Label>
                <Input
                  id="client-doc"
                  value={clientDocument}
                  onChange={(e) => setClientDocument(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-mail">E-mail</Label>
                <Input
                  id="client-mail"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="client-phone">Telefone</Label>
                <Input
                  id="client-phone"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
            {preview.orderNumber?.trim() ? (
              <p className="text-xs text-slate-500">
                Referência no documento: {preview.orderNumber.trim()}
              </p>
            ) : null}
            <div className="rounded-lg border border-slate-200 overflow-x-auto dark:border-slate-800">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                    <th className="px-3 py-2 text-left font-medium">
                      Descrição
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Qtd</th>
                    <th className="px-3 py-2 text-left font-medium">Un.</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.items ?? []).map((it, idx) => (
                    <tr
                      key={`${idx}-${it.description}`}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-3 py-2">{it.description || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(it.quantity)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {it.unit?.trim() || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A criar…
                </>
              ) : (
                "Criar orçamento"
              )}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </AppPage>
  );
}
