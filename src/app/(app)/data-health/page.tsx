"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Heart, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";
import {
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingState,
  StatusBadge,
  type StatusTone,
} from "@/shared/ui/page-helpers";
import type {
  DataHealthAffectedItem,
  DataHealthIssue,
  DataHealthSeverity,
} from "@/modules/core/lib/data-health/data-health";

type Payload = {
  issues: DataHealthIssue[];
  total: number;
  blockers: number;
  warnings: number;
};

async function fetchDataHealth(): Promise<Payload> {
  const res = await fetch("/api/data-health", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Payload & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar saúde do dado");
  }
  return {
    issues: json.issues ?? [],
    total: json.total ?? 0,
    blockers: json.blockers ?? 0,
    warnings: json.warnings ?? 0,
  };
}

const SEVERITY_LABEL: Record<DataHealthSeverity, string> = {
  blocker: "Bloqueio",
  warning: "Atenção",
  info: "Informação",
};

const SEVERITY_TONE: Record<DataHealthSeverity, StatusTone> = {
  blocker: "danger",
  warning: "warning",
  info: "neutral",
};

const SEVERITY_RANK: Record<DataHealthSeverity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

export default function DataHealthPage() {
  const query = useQuery({
    queryKey: ["data-health"],
    queryFn: fetchDataHealth,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const issues = (query.data?.issues ?? [])
    .slice()
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        a.module.localeCompare(b.module)
    );

  return (
    <AppPage
      title="Saúde do dado"
      description="§13: cadastros incompletos quebram fiscal, MRP e financeiro silenciosamente. O sistema aponta — a correção é humana."
      density="comfortable"
      width="wide"
    >
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} />
      ) : issues.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Sem problemas detectados"
          description="Todos os cadastros críticos estão em ordem."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard
              label="Total"
              value={query.data?.total ?? 0}
              icon={Heart}
            />
            <KpiCard
              label="Bloqueios"
              value={query.data?.blockers ?? 0}
              tone="danger"
              icon={AlertTriangle}
            />
            <KpiCard
              label="Atenção"
              value={query.data?.warnings ?? 0}
              tone="warning"
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Itens detectados
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <ul className="divide-y divide-slate-100 px-4 sm:px-0">
                {issues.map((issue) => {
                  const fixHref =
                    issue.items[0]?.href ?? issue.href;
                  return (
                  <li
                    key={issue.rule_id}
                    className="py-3 first:pt-0 last:pb-0 border-b border-slate-100 last:border-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 flex flex-wrap items-center gap-2">
                        <StatusBadge tone={SEVERITY_TONE[issue.severity]}>
                          {SEVERITY_LABEL[issue.severity]}
                        </StatusBadge>
                        <span>{issue.title}</span>
                        <span className="text-xs font-normal text-slate-500">
                          ({issue.count})
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {issue.module}
                      </p>
                      <p className="text-sm text-slate-700 mt-1">
                        {issue.impact}
                      </p>
                      {issue.items.length > 0 ? (
                        <ul className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                          {issue.items.map((item: DataHealthAffectedItem) => (
                            <li key={item.id} className="flex flex-wrap items-center gap-2">
                              <Link
                                href={item.href}
                                className="text-sm font-mono text-brand-700 hover:underline"
                              >
                                {item.label}
                              </Link>
                              <span className="text-xs text-slate-500">
                                → abrir cadastro
                              </span>
                            </li>
                          ))}
                          {issue.count > issue.items.length ? (
                            <li className="text-xs text-slate-500 pt-1">
                              + {issue.count - issue.items.length} registo(s)
                              adicional(is) — use a lista geral se necessário.
                            </li>
                          ) : null}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">
                          Abra a área indicada para localizar e corrigir os{" "}
                          {issue.count} registo(s).
                        </p>
                      )}
                    </div>
                    <Link
                      href={fixHref}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
                    >
                      Ir corrigir
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    </div>
                  </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </AppPage>
  );
}
