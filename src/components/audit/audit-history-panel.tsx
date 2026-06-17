"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, History, Loader2, User } from "lucide-react";
import type { AuditLogRow } from "@/modules/core/lib/audit/audit-log";

type Props = {
  table: string;
  recordId: string;
  limit?: number;
  className?: string;
};

async function fetchHistory(
  table: string,
  recordId: string,
  limit: number
): Promise<AuditLogRow[]> {
  const url = `/api/audit-log?table=${encodeURIComponent(table)}&record_id=${encodeURIComponent(recordId)}&limit=${limit}`;
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    entries?: AuditLogRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar histórico");
  return json.entries ?? [];
}

const ACTION_LABEL: Record<string, string> = {
  insert: "Criado",
  update: "Atualizado",
  delete: "Removido",
  event: "Evento",
};

const ACTION_BADGE: Record<string, string> = {
  insert: "bg-emerald-100 text-emerald-800 border-emerald-200",
  update: "bg-blue-100 text-blue-800 border-blue-200",
  delete: "bg-red-100 text-red-800 border-red-200",
  event: "bg-violet-100 text-violet-800 border-violet-200",
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AuditHistoryPanel({
  table,
  recordId,
  limit = 50,
  className,
}: Props) {
  const query = useQuery({
    queryKey: ["audit-log", table, recordId, limit],
    queryFn: () => fetchHistory(table, recordId, limit),
    staleTime: 30_000,
  });

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-800">
          Histórico de alterações
        </h3>
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : query.error ? (
        <p className="text-xs text-red-700">
          {(query.error as Error).message}
        </p>
      ) : !query.data || query.data.length === 0 ? (
        <p className="text-xs text-slate-500">
          Sem entradas registadas para este registo.
        </p>
      ) : (
        <ul className="space-y-3">
          {query.data.map((entry) => (
            <li
              key={entry.id}
              className="rounded-md border border-slate-200 p-3 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ACTION_BADGE[entry.action] ?? ACTION_BADGE.event}`}
                >
                  {entry.event_kind ?? ACTION_LABEL[entry.action] ?? entry.action}
                </span>
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Clock className="h-3 w-3" />
                  {formatTime(entry.occurred_at)}
                </span>
                <span className="inline-flex items-center gap-1 text-slate-700">
                  <User className="h-3 w-3" />
                  {entry.actor_email ?? "sistema"}
                </span>
              </div>
              {entry.changed_fields && entry.changed_fields.length > 0 ? (
                <p className="mt-2 text-slate-700">
                  Campos: {entry.changed_fields.join(", ")}
                </p>
              ) : null}
              {entry.event_kind && entry.event_payload ? (
                <pre className="mt-2 rounded bg-slate-50 p-2 text-[11px] text-slate-700 max-h-40 overflow-auto">
                  {JSON.stringify(entry.event_payload, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
