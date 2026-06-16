"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  PRODUCT_DOCUMENT_KIND_LABELS,
  PRODUCT_DOCUMENT_KINDS,
  type ProductDocumentKind,
} from "@/modules/engenharia/lib/products/product-documents";

export type ProductDocumentRow = {
  id: string;
  product_id: string;
  kind: ProductDocumentKind;
  name: string;
  revision: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  uploaded_at: string;
  uploaded_by: string | null;
  notes: string | null;
  is_active: boolean;
};

type Props = {
  productId: string;
};

function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function fetchDocuments(productId: string): Promise<ProductDocumentRow[]> {
  const res = await fetch(`/api/products/${productId}/documents`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductDocumentRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar documentos");
  return json.data ?? [];
}

export function ProductDocumentsPanel({ productId }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["product-documents", productId] as const;

  const [kind, setKind] = useState<ProductDocumentKind>("drawing");
  const [name, setName] = useState("");
  const [revision, setRevision] = useState("A");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchDocuments(productId),
  });

  const grouped = useMemo(() => {
    const map = new Map<ProductDocumentKind, ProductDocumentRow[]>();
    for (const k of PRODUCT_DOCUMENT_KINDS) map.set(k, []);
    for (const row of data ?? []) {
      const list = map.get(row.kind) ?? [];
      list.push(row);
      map.set(row.kind, list);
    }
    return map;
  }, [data]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione um ficheiro.");
      if (!name.trim()) throw new Error("Nome é obrigatório.");
      const form = new FormData();
      form.set("kind", kind);
      form.set("name", name.trim());
      form.set("revision", revision.trim() || "A");
      if (notes.trim()) form.set("notes", notes.trim());
      form.set("file", file);
      const res = await fetch(`/api/products/${productId}/documents`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao enviar documento");
    },
    onSuccess: async () => {
      toast.success("Documento enviado.");
      setFile(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar.");
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(
        `/api/products/${productId}/documents/${docId}/download`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        file_name?: string;
        error?: string;
      };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Erro ao gerar download");
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro no download.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(
        `/api/products/${productId}/documents/${docId}`,
        { method: "DELETE", credentials: "include" }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao remover");
    },
    onSuccess: async () => {
      toast.success("Documento removido.");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao remover.");
    },
  });

  const prefillNewRevision = (row: ProductDocumentRow) => {
    setKind(row.kind);
    setName(row.name);
    const rev = row.revision.trim();
    const match = rev.match(/^([A-Za-z]*)(\d+)$/);
    if (match) {
      const prefix = match[1] ?? "";
      const num = parseInt(match[2] ?? "0", 10);
      setRevision(`${prefix}${Number.isFinite(num) ? num + 1 : rev}`);
    } else {
      setRevision(`${rev}-2`);
    }
    setNotes(row.notes ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Enviar documento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pdoc-kind">Tipo</Label>
              <select
                id="pdoc-kind"
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as ProductDocumentKind)
                }
              >
                {PRODUCT_DOCUMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PRODUCT_DOCUMENT_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdoc-revision">Revisão</Label>
              <Input
                id="pdoc-revision"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                placeholder="A"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pdoc-name">Nome / título</Label>
              <Input
                id="pdoc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Desenho geral de montagem"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pdoc-file">Ficheiro (máx. 25 MB)</Label>
              <Input
                id="pdoc-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pdoc-notes">Notas (opcional)</Label>
              <Input
                id="pdoc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            Enviar
          </Button>
          <p className="text-xs text-slate-500">
            Nova revisão = novo envio com o mesmo nome e revisão diferente (histórico preservado).
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          A carregar documentos…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex justify-between gap-2">
          <span>{error instanceof Error ? error.message : "Erro"}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {PRODUCT_DOCUMENT_KINDS.map((k) => {
        const rows = grouped.get(k) ?? [];
        return (
          <Card key={k}>
            <CardHeader>
              <CardTitle className="text-base">
                {PRODUCT_DOCUMENT_KIND_LABELS[k]}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  ({rows.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum documento.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {row.name}{" "}
                          <span className="text-slate-500 font-normal">
                            rev. {row.revision}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {row.file_name} · {formatBytes(row.file_size_bytes)} ·{" "}
                          {formatDate(row.uploaded_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => downloadMutation.mutate(row.id)}
                          disabled={downloadMutation.isPending}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => prefillNewRevision(row)}
                        >
                          Nova revisão
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-red-700 border-red-200 hover:bg-red-50"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remover «${row.name}» rev. ${row.revision}?`
                              )
                            ) {
                              deleteMutation.mutate(row.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
