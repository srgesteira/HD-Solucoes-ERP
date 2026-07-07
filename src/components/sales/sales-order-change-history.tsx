"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BRAZIL_DATE_DISPLAY_FORMAT, formatShortDate } from "@/shared/utils/date";
import { SALES_ORDER_FIELD_LABELS } from "@/modules/vendas/lib/sales/sales-order-change-log";

type LogUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type LogRow = {
  id: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  notes: string | null;
  changed_at: string;
  changed_by_user?: LogUser | LogUser[] | null;
};

function unwrapUser(
  u: LogUser | LogUser[] | null | undefined
): LogUser | null {
  if (!u) return null;
  return Array.isArray(u) ? (u[0] ?? null) : u;
}

function fieldLabel(field: string | null): string {
  if (!field) return "—";
  return SALES_ORDER_FIELD_LABELS[field] ?? field;
}

const DATE_LOG_FIELDS = new Set([
  "expected_delivery",
  "order_date",
  "pcp_deadline",
  "actual_delivery",
]);

function formatDisplayValue(field: string | null, raw: string | null): string {
  if (raw === null || raw === "") return "—";
  if (field === "items") {
    try {
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) return raw;
      return `${parsed.length} linha(s)`;
    } catch {
      return "Itens alterados";
    }
  }
  if (field && DATE_LOG_FIELDS.has(field) && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const formatted = formatShortDate(raw.slice(0, 10));
    return formatted === "--" ? raw : formatted;
  }
  return raw;
}

async function fetchOrderLogs(orderId: string): Promise<LogRow[]> {
  const res = await fetch(`/api/sales/orders/${orderId}/logs`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: LogRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar histórico");
  return json.data ?? [];
}

export function SalesOrderChangeHistory({ orderId }: { orderId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-order-logs", orderId],
    queryFn: () => fetchOrderLogs(orderId),
    enabled: Boolean(orderId),
  });

  if (isLoading) {
    return (
      <p className="text-sm text-slate-500 flex items-center gap-2 py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar histórico…
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-700 py-2">
        {error instanceof Error ? error.message : "Erro"}
      </p>
    );
  }

  if (!data?.length) {
    return (
      <p className="text-sm text-slate-500 py-4">
        Nenhuma alteração registada neste pedido.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
            <th className="px-3 py-2 text-left font-medium">Data</th>
            <th className="px-3 py-2 text-left font-medium">Utilizador</th>
            <th className="px-3 py-2 text-left font-medium">Campo</th>
            <th className="px-3 py-2 text-left font-medium">De</th>
            <th className="px-3 py-2 text-left font-medium">Para</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const user = unwrapUser(row.changed_by_user);
            const userName =
              user?.full_name?.trim() ||
              user?.email?.trim() ||
              "Sistema";
            const when = row.changed_at
              ? format(new Date(row.changed_at), `${BRAZIL_DATE_DISPLAY_FORMAT} HH:mm`, {
                  locale: ptBR,
                })
              : "—";
            return (
              <tr
                key={row.id}
                className="border-b border-slate-100 dark:border-slate-800 align-top"
              >
                <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                  {when}
                </td>
                <td className="px-3 py-2">{userName}</td>
                <td className="px-3 py-2 font-medium">
                  {fieldLabel(row.field_name)}
                </td>
                <td className="px-3 py-2 text-slate-600 max-w-[200px] break-words">
                  {formatDisplayValue(row.field_name, row.old_value)}
                </td>
                <td className="px-3 py-2 max-w-[200px] break-words">
                  {formatDisplayValue(row.field_name, row.new_value)}
                  {row.notes?.trim() ? (
                    <span className="block text-xs text-slate-500 mt-1">
                      {row.notes}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
