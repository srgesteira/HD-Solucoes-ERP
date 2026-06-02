"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  SortableTable,
  type SortableColumnType,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { downloadCsv, rowsToCsv } from "@/shared/utils/export-csv";
import { cn } from "@/shared/utils/cn";

export type ReportColumn = {
  key: string;
  header: string;
  type?: SortableColumnType;
  align?: "left" | "right" | "center";
  width?: string;
};

export type ReportTableProps = {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  csvFilename?: string;
  emptyMessage?: string;
  className?: string;
};

type ReportRow = Record<string, unknown> & { __rowId: string };

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
}

function inferColumnType(
  rows: Record<string, unknown>[],
  key: string
): SortableColumnType {
  for (const row of rows) {
    const v = row[key];
    if (typeof v === "number") return "number";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return "date";
    if (typeof v === "string" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v.trim())) {
      return "date";
    }
  }
  return "text";
}

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

  const tableRows = useMemo(
    (): ReportRow[] =>
      rows.map((row, index) => ({
        ...row,
        __rowId: `${index}-${String(row[columns[0]?.key ?? ""])}`,
      })),
    [rows, columns]
  );

  const defaultWidth =
    columns.length > 0
      ? `w-[${Math.max(8, Math.floor(100 / columns.length))}%]`
      : "w-auto";

  const tableColumns = useMemo((): SortableTableColumn<ReportRow>[] => {
    return columns.map((c) => ({
      key: c.key,
      label: c.header,
      type: c.type ?? inferColumnType(rows, c.key),
      align: c.align,
      width: c.width ?? defaultWidth,
      accessor: (row) => row[c.key],
      render: (row) => (
        <span className="text-slate-800">{formatCell(row[c.key])}</span>
      ),
    }));
  }, [columns, rows, defaultWidth]);

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

      <SortableTable
        columns={tableColumns}
        data={tableRows}
        getRowKey={(row) => row.__rowId}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
