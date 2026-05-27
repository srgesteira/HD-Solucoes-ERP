"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/hooks/use-me";
import {
  MENU_MODULE_LABELS,
} from "@/shared/auth/route-module-guard";
import { userHasModule } from "@/shared/auth/menu-modules";
import { HOME_MODULES } from "@/shared/auth/modules-registry";
import type { DashboardKpiResponse } from "@/modules/core/lib/dashboard/module-kpis";
import { AppPage } from "@/shared/ui/app-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

type MiniState =
  | { status: "loading" }
  | { status: "ok"; data: DashboardKpiResponse }
  | { status: "error"; message: string };

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: me } = useMe();
  const [kpiByKey, setKpiByKey] = useState<Record<string, MiniState>>({});

  useEffect(() => {
    const denied = searchParams.get("denied");
    if (!denied) return;
    const label = MENU_MODULE_LABELS[denied] ?? denied;
    toast.error(`Sem permissão para o módulo ${label}.`);
    router.replace("/home");
  }, [searchParams, router]);

  const visible = useMemo(() => {
    if (!me) return [];
    return HOME_MODULES.filter((m) =>
      userHasModule(
        { role: me.role, enabled_modules: me.enabled_modules },
        m.key
      )
    );
  }, [me]);

  const keys = visible.map((m) => m.key).join(",");

  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (!keys) {
      setKpiByKey({});
      return;
    }
    const gen = ++fetchGenRef.current;
    let cancelled = false;

    setKpiByKey((prev) => {
      const next: Record<string, MiniState> = { ...prev };
      for (const m of visible) {
        next[m.key] = { status: "loading" };
      }
      return next;
    });

    void (async () => {
      const res = await fetch("/api/dashboard/kpis", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        modules?: Record<string, DashboardKpiResponse>;
        error?: string;
      };
      if (cancelled || fetchGenRef.current !== gen) return;

      if (!res.ok) {
        const msg = json.error ?? "Indisponível";
        setKpiByKey((prev) => {
          const next = { ...prev };
          for (const m of visible) next[m.key] = { status: "error", message: msg };
          return next;
        });
        return;
      }

      setKpiByKey((prev) => {
        const next = { ...prev };
        for (const m of visible) {
          const data = json.modules?.[m.key];
          next[m.key] = data
            ? { status: "ok", data }
            : { status: "error", message: "Sem KPIs" };
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [keys, visible]);

  return (
    <AppPage
      title="Portal"
      description="Mini-dashboards por módulo activo para o seu utilizador."
      wide
    >
      {!me ? (
        <p className="text-slate-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </p>
      ) : visible.length === 0 ? (
        <p className="text-slate-500">
          Nenhum módulo activo. Peça ao administrador para configurar{" "}
          <code className="text-xs">enabled_modules</code>.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((mod) => {
            const st = kpiByKey[mod.key];
            return (
              <Card key={mod.key} className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span>{mod.name}</span>
                    <Link
                      href={mod.href}
                      className="text-xs font-normal text-brand-700 hover:underline"
                    >
                      Abrir
                    </Link>
                  </CardTitle>
                  <p className="text-xs text-slate-500">{mod.description}</p>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {!st || st.status === "loading" ? (
                    <span className="flex items-center gap-2 text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> KPIs…
                    </span>
                  ) : st.status === "error" ? (
                    <span className="text-amber-700">{st.message}</span>
                  ) : (
                    <>
                      {st.data.kpis.slice(0, 4).map((k) => (
                        <div
                          key={k.key}
                          className="flex justify-between gap-2 border-b border-slate-100 pb-1"
                        >
                          <span className="text-slate-600">{k.label}</span>
                          <span className="font-medium text-slate-900">
                            {k.value}
                          </span>
                        </div>
                      ))}
                      {st.data.alerts?.map((a, i) => (
                        <p key={i} className="text-xs text-amber-700">
                          {a.message}
                        </p>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppPage>
  );
}
