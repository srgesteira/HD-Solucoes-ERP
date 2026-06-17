"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";
import {
  ErrorState,
  LoadingState,
  StatusBadge,
} from "@/shared/ui/page-helpers";
import { cn } from "@/shared/utils/cn";
import type { OnboardingItem } from "@/modules/core/lib/onboarding/onboarding-state";

type Payload = { items: OnboardingItem[]; progressPct: number };

async function fetchOnboarding(): Promise<Payload> {
  const res = await fetch("/api/onboarding/state", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Payload & {
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar onboarding");
  return { items: json.items ?? [], progressPct: json.progressPct ?? 0 };
}

const SEVERITY_LABEL: Record<OnboardingItem["severity"], string> = {
  blocker: "Crítico",
  recommended: "Recomendado",
};

export default function OnboardingPage() {
  const query = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: fetchOnboarding,
    staleTime: 60_000,
  });

  const items = query.data?.items ?? [];
  const blockers = items.filter((i) => i.severity === "blocker");
  const recommended = items.filter((i) => i.severity === "recommended");
  const allBlockersDone = blockers.every((i) => i.done);
  const progress = query.data?.progressPct ?? 0;

  return (
    <AppPage
      title="Onboarding do tenant"
      description="§16: lista do que falta configurar para esta empresa começar a operar. O sistema só guia — não inventa CNPJ, regime ou alíquota."
      width="narrow"
      density="comfortable"
    >
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} />
      ) : (
        <>
          <Card>
            <CardContent className="py-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Progresso geral
                  </p>
                  {allBlockersDone ? (
                    <StatusBadge tone="success" icon={ShieldCheck} className="mt-1">
                      Itens críticos concluídos
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="warning" icon={ShieldAlert} className="mt-1">
                      Itens críticos pendentes
                    </StatusBadge>
                  )}
                </div>
                <p className="text-3xl font-semibold text-slate-900 tabular-nums">
                  {progress}%
                </p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    allBlockersDone ? "bg-emerald-500" : "bg-amber-500"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </CardContent>
          </Card>

          {blockers.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Itens críticos</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-slate-100">
                  {blockers.map((item) => (
                    <ChecklistRow key={item.id} item={item} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {recommended.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recomendados</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-slate-100">
                  {recommended.map((item) => (
                    <ChecklistRow key={item.id} item={item} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </AppPage>
  );
}

function ChecklistRow({ item }: { item: OnboardingItem }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3 min-w-0">
        {item.done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
        ) : (
          <Circle className="h-5 w-5 text-slate-400 mt-0.5 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <p
            className={cn(
              "font-medium",
              item.done ? "text-slate-500 line-through" : "text-slate-900"
            )}
          >
            {item.title}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {SEVERITY_LABEL[item.severity]} · {item.description}
          </p>
        </div>
      </div>
      {!item.done ? (
        <Link
          href={item.href}
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Configurar
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </li>
  );
}
