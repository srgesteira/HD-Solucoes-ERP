"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import type { InboundNfeInboxRow } from "@/modules/faturamento/lib/inbound-nfe-inbox-service";
import { fmtBRL } from "@/shared/utils/format-brl";
import { formatShortDate } from "@/shared/utils/date";

async function fetchInbox(): Promise<InboundNfeInboxRow[]> {
  const res = await fetch("/api/faturamento/entrada/inbox?status=new", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: InboundNfeInboxRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar inbox");
  return json.data ?? [];
}

async function postSync(): Promise<{ imported: number; skipped: number }> {
  const res = await fetch("/api/faturamento/entrada/inbox/sync", {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    imported?: number;
    skipped?: number;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao sincronizar");
  return {
    imported: json.imported ?? 0,
    skipped: json.skipped ?? 0,
  };
}

async function postIgnore(id: string): Promise<void> {
  const res = await fetch(`/api/faturamento/entrada/inbox/${id}/ignore`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao ignorar");
}

type Props = {
  enabled?: boolean;
  canSync?: boolean;
};

export function InboundNfeInboxPanel({
  enabled = true,
  canSync = false,
}: Props) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["inbound-nfe-inbox"],
    queryFn: fetchInbox,
    enabled,
    staleTime: 30_000,
  });

  const syncMut = useMutation({
    mutationFn: postSync,
    onSuccess: (r) => {
      toast.success(
        `Sincronização: ${r.imported} importada(s), ${r.skipped} ignorada(s).`
      );
      void qc.invalidateQueries({ queryKey: ["inbound-nfe-inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ignoreMut = useMutation({
    mutationFn: postIgnore,
    onSuccess: () => {
      toast.message("NF ignorada.");
      void qc.invalidateQueries({ queryKey: ["inbound-nfe-inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            NF recebidas (MDe)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Notas emitidas contra o CNPJ via Focus. Conciliar abre a importação
            de NF-e pré-carregada.
          </p>
        </div>
        {canSync ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={syncMut.isPending}
            onClick={() => syncMut.mutate()}
          >
            {syncMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar SEFAZ
          </Button>
        ) : null}
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />A carregar…
        </div>
      ) : q.error ? (
        <p className="text-sm text-rose-600">
          {q.error instanceof Error ? q.error.message : "Erro"}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-2">
          Nenhuma NF nova na inbox. Se o sync falhar com mensagem de MDe, a
          conta Focus ainda não tem o produto activo.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-md">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900 truncate">
                  {row.issuer_name ?? "Emitente"}
                </p>
                <p className="text-[11px] text-slate-500 font-mono">
                  {row.access_key.slice(0, 10)}…{row.access_key.slice(-6)}
                  {row.issue_date ? ` · ${formatShortDate(row.issue_date)}` : ""}
                  {row.total_amount != null
                    ? ` · ${fmtBRL(row.total_amount)}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Link
                  href={`/purchasing/invoices/reconcile?inbox=${row.id}`}
                  className="inline-flex h-7 items-center rounded-md bg-emerald-700 px-2 text-[11px] font-medium text-white hover:bg-emerald-800"
                >
                  Conciliar
                </Link>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  disabled={ignoreMut.isPending}
                  onClick={() => ignoreMut.mutate(row.id)}
                >
                  Ignorar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
