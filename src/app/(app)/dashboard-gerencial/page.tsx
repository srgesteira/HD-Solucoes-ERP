"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppPage } from "@/shared/ui/app-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import type { DashboardKpiResponse } from "@/modules/core/lib/dashboard/module-kpis";

export default function DashboardGerencialPage() {
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<Record<string, DashboardKpiResponse>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/kpis", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json()) as {
          modules?: Record<string, DashboardKpiResponse>;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar KPIs");
        setModules(json.modules ?? {});
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro");
        setModules({});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AppPage
      title="Dashboard Gerencial"
      description="Visão consolidada dos indicadores por módulo (construção nova — Fase 3)."
      wide
      actions={
        <Link
          href="/home"
          className="text-sm text-brand-700 hover:underline font-medium"
        >
          Portal (mini-dashboards)
        </Link>
      }
    >
      {loading ? (
        <p className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" /> A agregar KPIs…
        </p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(modules).map(([key, block]) => (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base capitalize">{key}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {block.kpis.map((k) => (
                  <div key={k.key} className="flex justify-between gap-2">
                    <span className="text-slate-600">{k.label}</span>
                    <span className="font-medium">{k.value}</span>
                  </div>
                ))}
                {block.alerts?.map((a, i) => (
                  <p key={i} className="text-xs text-amber-700">
                    {a.message}
                  </p>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppPage>
  );
}
