"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import {
  compareSortableValues,
  type SortableColumnType,
  type SortDirection,
} from "@/shared/utils/sortable-table-sort";

export type { SortableColumnType };

export type SortableTableColumn<T> = {
  key: string;
  label: string;
  type: SortableColumnType;
  accessor?: (row: T) => unknown;
  align?: "left" | "right" | "center";
  /** Classe Tailwind de largura (ex.: w-[12%]). */
  width?: string;
  sortable?: boolean;
  truncate?: boolean;
  render?: (row: T) => ReactNode;
};

export type SortableTableActionsColumn<T> = {
  label?: string;
  width?: string;
  render: (row: T) => ReactNode;
};

export type SortableTableProps<T> = {
  columns: SortableTableColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  actionsColumn?: SortableTableActionsColumn<T>;
  isLoading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  className?: string;
  tableClassName?: string;
  rowClassName?: string | ((row: T) => string);
};

type SortState = {
  key: string;
  direction: SortDirection;
} | null;

function cellAlignClass(align: SortableTableColumn<unknown>["align"]): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function headerAlignClass(align: SortableTableColumn<unknown>["align"]): string {
  if (align === "right") return "justify-end";
  if (align === "center") return "justify-center";
  return "justify-start";
}

function getCellValue<T>(row: T, column: SortableTableColumn<T>): unknown {
  if (column.accessor) return column.accessor(row);
  const record = row as Record<string, unknown>;
  return record[column.key];
}

function cellTitleValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  if (!s || s === "—") return undefined;
  return s;
}

export function SortableTable<T>({
  columns,
  data,
  getRowKey,
  actionsColumn,
  isLoading = false,
  loadingMessage = "A carregar…",
  emptyMessage = "Nenhum registo encontrado.",
  className,
  tableClassName,
  rowClassName,
}: SortableTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);

  const colSpan =
    columns.length + (actionsColumn ? 1 : 0);

  const sortedData = useMemo(() => {
    if (!sort) return data;
    const column = columns.find((c) => c.key === sort.key);
    if (!column || column.sortable === false) return data;

    return [...data].sort((rowA, rowB) =>
      compareSortableValues(
        getCellValue(rowA, column),
        getCellValue(rowB, column),
        column.type,
        sort.direction
      )
    );
  }, [columns, data, sort]);

  function cycleSort(columnKey: string) {
    setSort((prev) => {
      if (prev?.key !== columnKey) {
        return { key: columnKey, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { key: columnKey, direction: "desc" };
      }
      return null;
    });
  }

  function sortIcon(columnKey: string) {
    if (sort?.key !== columnKey) {
      return (
        <ChevronsUpDown
          className="h-4 w-4 shrink-0 text-slate-500"
          aria-hidden
        />
      );
    }
    if (sort.direction === "asc") {
      return (
        <ChevronUp
          className="h-4 w-4 shrink-0 text-brand-700"
          aria-hidden
        />
      );
    }
    return (
      <ChevronDown
        className="h-4 w-4 shrink-0 text-brand-700"
        aria-hidden
      />
    );
  }

  const actionsWidth = actionsColumn?.width ?? "w-[5rem]";

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white w-full dark:bg-slate-950 dark:border-slate-800",
        className
      )}
    >
      <table
        className={cn(
          "w-full table-fixed text-sm text-left",
          tableClassName
        )}
      >
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} className={col.width ?? "w-auto"} />
          ))}
          {actionsColumn ? <col className={actionsWidth} /> : null}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-800">
            {columns.map((col) => {
              const sortable = col.sortable !== false;
              const isActive = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2.5 font-medium text-slate-700",
                    cellAlignClass(col.align)
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      className={cn(
                        "inline-flex w-full max-w-full items-center gap-1 min-w-0 cursor-pointer",
                        headerAlignClass(col.align),
                        "text-slate-700 hover:text-brand-800",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 rounded-sm"
                      )}
                      onClick={() => cycleSort(col.key)}
                      title={`Ordenar por ${col.label}`}
                      aria-label={`Ordenar por ${col.label}${
                        isActive
                          ? sort?.direction === "asc"
                            ? ", ascendente"
                            : ", descendente"
                          : ""
                      }`}
                    >
                      {sortIcon(col.key)}
                      <span className="truncate">{col.label}</span>
                    </button>
                  ) : (
                    <span className="truncate">{col.label}</span>
                  )}
                </th>
              );
            })}
            {actionsColumn ? (
              <th
                scope="col"
                className="px-2 py-2.5 font-medium text-slate-700 text-right"
              >
                {actionsColumn.label ?? "Acções"}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td
                colSpan={colSpan}
                className="px-3 py-10 text-center text-slate-500"
              >
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {loadingMessage}
                </span>
              </td>
            </tr>
          ) : sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className="px-3 py-10 text-center text-slate-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => {
              const rowClass =
                typeof rowClassName === "function"
                  ? rowClassName(row)
                  : rowClassName;
              return (
                <tr
                  key={getRowKey(row)}
                  className={cn(
                    "border-b border-slate-100 last:border-0 dark:border-slate-800 hover:bg-slate-50/60",
                    rowClass
                  )}
                >
                  {columns.map((col) => {
                    const raw = getCellValue(row, col);
                    const content = col.render ? col.render(row) : (
                      <span className="text-slate-800">
                        {raw === null || raw === undefined || raw === ""
                          ? "—"
                          : String(raw)}
                      </span>
                    );
                    const truncate = col.truncate !== false;
                    const title =
                      truncate && !col.render
                        ? cellTitleValue(raw)
                        : truncate && col.render
                          ? cellTitleValue(raw)
                          : undefined;

                    return (
                      <td
                        key={col.key}
                        className={cn(
                          "px-3 py-2.5 align-middle",
                          cellAlignClass(col.align)
                        )}
                      >
                        {truncate ? (
                          <span
                            className={cn(
                              "block min-w-0 truncate",
                              col.align === "right" && "tabular-nums"
                            )}
                            title={title}
                          >
                            {content}
                          </span>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                  {actionsColumn ? (
                    <td className="px-2 py-2.5 text-right align-middle w-[5rem]">
                      {actionsColumn.render(row)}
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
