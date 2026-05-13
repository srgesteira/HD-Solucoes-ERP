"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv, rowsToCsv } from "@/lib/utils/export-csv";
import { cn } from "@/lib/utils/cn";

export type ReportColumn = { key: string; header: string };

export type ReportTableProps = {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  csvFilename?: string;
  emptyMessage?: string;
  className?: string;
};

export function ReportTable({
  columns,
  rows,
  csvFilename = "relatorio",
  emptyMessage = "Sem dados para o período seleccionado.",
  className,
}: ReportTableProps) {
  function handleExportCsv() {
    const csv = rowsToCsv(rows, columns);
    downloadCsv(csvFilename, csv);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length === 0}
          onClick={handleExportCsv}
        >
          <Download className="h-4 w-4" />
          <span className="ml-1">Exportar CSV</span>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="text-left font-medium text-slate-700 px-3 py-2 whitespace-nowrap"
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                >
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2 text-slate-800">
                      {formatCell(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
}
