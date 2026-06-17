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
            <CardContent>
              <ul className="divide-y divide-slate-100">
                {issues.map((issue) => (
                  <li
                    key={issue.rule_id}
                    className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 max-w-3xl">
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
                    </div>
                    <Link
                      href={issue.href}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Ir corrigir
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </AppPage>
  );
}
