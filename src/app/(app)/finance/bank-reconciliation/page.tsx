"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { AppPage } from "@/shared/ui/app-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";

type ImportRow = {
  id: string;
  file_name: string;
  file_format: string;
  imported_at: string;
  status: string;
};

async function fetchImports(): Promise<ImportRow[]> {
  const res = await fetch("/api/finance/bank-imports", {
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    items?: ImportRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro");
  return json.items ?? [];
}

export default function BankReconciliationPage() {
  const qc = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [uploading, setUploading] = useState(false);

  const query = useQuery({
    queryKey: ["bank-imports"],
    queryFn: fetchImports,
  });

  const columns: SortableTableColumn<ImportRow>[] = [
    {
      key: "file_name",
      label: "Ficheiro",
      type: "text",
      accessor: (r) => r.file_name,
    },
    {
      key: "file_format",
      label: "Formato",
      type: "text",
      accessor: (r) => r.file_format,
    },
    {
      key: "imported_at",
      label: "Importado",
      type: "date",
      accessor: (r) => r.imported_at,
    },
    {
      key: "status",
      label: "Status",
      type: "text",
      accessor: (r) => r.status,
    },
  ];

  async function onUpload() {
    if (!fileName.trim() || !content.trim()) {
      toast.error("Informe nome e conteúdo do extrato.");
      return;
    }
    setUploading(true);
    try {
      const res = await fetch("/api/finance/bank-imports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: fileName.trim(),
          format: "csv",
          content,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        lines?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Falha na importação");
      toast.success(`Importadas ${json.lines ?? 0} linhas.`);
      setContent("");
      await qc.invalidateQueries({ queryKey: ["bank-imports"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setUploading(false);
    }
  }

  return (
    <AppPage
      title="Conciliação bancária"
      description="Importação de extrato (CSV/OFX) e match com contas a pagar/receber."
      width="wide"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importar extrato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="file_name">Nome do ficheiro</Label>
            <Input
              id="file_name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="extrato-junho.csv"
            />
          </div>
          <div>
            <Label htmlFor="content">Conteúdo CSV (data;valor;descrição)</Label>
            <textarea
              id="content"
              className="w-full min-h-[120px] rounded-md border border-slate-200 p-2 text-sm font-mono"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <Button type="button" onClick={() => void onUpload()} disabled={uploading}>
            <Upload className="h-4 w-4" />
            {uploading ? "A importar…" : "Importar"}
          </Button>
        </CardContent>
      </Card>

      <SortableTable
        columns={columns}
        data={query.data ?? []}
        getRowKey={(r) => r.id}
        isLoading={query.isLoading}
        emptyMessage="Nenhuma importação ainda."
        density="cronograma"
      />
    </AppPage>
  );
}
