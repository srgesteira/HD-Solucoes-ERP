"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Upload, Wand2 } from "lucide-react";
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
import { formatBrl } from "@/shared/utils/format-brl";

type ImportRow = {
  id: string;
  file_name: string;
  file_format: string;
  imported_at: string;
  status: string;
};

type StatementLine = {
  id: string;
  transaction_date: string;
  amount: number;
  description: string | null;
  document_number: string | null;
  match_status: string;
  matched_receivable_id: string | null;
  matched_payable_id: string | null;
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

async function fetchLines(importId: string): Promise<StatementLine[]> {
  const res = await fetch(`/api/finance/bank-imports/${importId}`, {
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    items?: StatementLine[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro");
  return json.items ?? [];
}

export default function BankReconciliationPage() {
  const qc = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<"csv" | "ofx">("csv");
  const [uploading, setUploading] = useState(false);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);

  const query = useQuery({
    queryKey: ["bank-imports"],
    queryFn: fetchImports,
  });

  const linesQuery = useQuery({
    queryKey: ["bank-import-lines", selectedImportId],
    queryFn: () => fetchLines(selectedImportId!),
    enabled: Boolean(selectedImportId),
  });

  const importColumns: SortableTableColumn<ImportRow>[] = [
    {
      key: "file_name",
      label: "Ficheiro",
      type: "text",
      accessor: (r) => r.file_name,
      render: (r) => (
        <button
          type="button"
          className="text-left text-brand-700 hover:underline"
          onClick={() => setSelectedImportId(r.id)}
        >
          {r.file_name}
        </button>
      ),
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

  const lineColumns: SortableTableColumn<StatementLine>[] = [
      {
        key: "transaction_date",
        label: "Data",
        type: "date",
        accessor: (r) => r.transaction_date,
      },
      {
        key: "amount",
        label: "Valor",
        type: "number",
        accessor: (r) => r.amount,
        render: (r) => (
          <span className="tabular-nums">{formatBrl(r.amount)}</span>
        ),
      },
      {
        key: "description",
        label: "Descrição",
        type: "text",
        accessor: (r) => r.description ?? "",
      },
      {
        key: "match_status",
        label: "Conciliação",
        type: "text",
        accessor: (r) => r.match_status,
        render: (r) => (
          <span
            className={
              r.match_status === "matched"
                ? "text-emerald-700"
                : r.match_status === "ignored"
                  ? "text-slate-500"
                  : "text-amber-700"
            }
          >
            {r.match_status}
          </span>
        ),
      },
      {
        key: "actions",
        label: "",
        type: "text",
        accessor: () => "",
        render: (r) =>
          r.match_status === "unmatched" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => void ignoreLine(r.id)}
            >
              Ignorar
            </Button>
          ) : null,
      },
    ];

  async function ignoreLine(lineId: string) {
    try {
      const res = await fetch(
        `/api/finance/bank-statement-lines/${lineId}/match`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "ignore" }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro");
      toast.success("Linha ignorada.");
      await qc.invalidateQueries({
        queryKey: ["bank-import-lines", selectedImportId],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

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
          format,
          content,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        lines?: number;
        auto_matched?: number;
        import_id?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Falha na importação");
      toast.success(
        `Importadas ${json.lines ?? 0} linhas (${json.auto_matched ?? 0} conciliadas automaticamente).`
      );
      setContent("");
      if (json.import_id) setSelectedImportId(json.import_id);
      await qc.invalidateQueries({ queryKey: ["bank-imports"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setUploading(false);
    }
  }

  async function runAutoMatch() {
    if (!selectedImportId) return;
    setMatching(true);
    try {
      const res = await fetch(`/api/finance/bank-imports/${selectedImportId}`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        matched?: number;
        unmatched?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro no match");
      toast.success(
        `${json.matched ?? 0} conciliadas · ${json.unmatched ?? 0} pendentes`
      );
      await qc.invalidateQueries({
        queryKey: ["bank-import-lines", selectedImportId],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setMatching(false);
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
          <div className="grid gap-3 sm:grid-cols-2">
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
              <Label htmlFor="format">Formato</Label>
              <select
                id="format"
                className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm"
                value={format}
                onChange={(e) =>
                  setFormat(e.target.value === "ofx" ? "ofx" : "csv")
                }
              >
                <option value="csv">CSV (data;valor;descrição)</option>
                <option value="ofx">OFX</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="content">Conteúdo do extrato</Label>
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
        columns={importColumns}
        data={query.data ?? []}
        getRowKey={(r) => r.id}
        isLoading={query.isLoading}
        emptyMessage="Nenhuma importação ainda."
        density="cronograma"
      />

      {selectedImportId ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Linhas do extrato
            </CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={matching}
              onClick={() => void runAutoMatch()}
            >
              <Wand2 className="h-4 w-4" />
              {matching ? "A conciliar…" : "Match automático"}
            </Button>
          </CardHeader>
          <CardContent>
            <SortableTable
              columns={lineColumns}
              data={linesQuery.data ?? []}
              getRowKey={(r) => r.id}
              isLoading={linesQuery.isLoading}
              emptyMessage="Nenhuma linha nesta importação."
              density="cronograma"
            />
          </CardContent>
        </Card>
      ) : null}
    </AppPage>
  );
}
