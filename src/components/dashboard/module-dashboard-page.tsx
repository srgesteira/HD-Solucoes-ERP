"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/use-permissions";
import type { ModuleKey } from "@/shared/auth/permissions";
import { AppPage } from "@/shared/ui/app-page";
import { KpiCard, LoadingState } from "@/shared/ui/page-helpers";
import { toast } from "sonner";

type KpiItem = { title: string; value: string; subtitle?: string };

type Props = {
  title: string;
  module: ModuleKey;
  apiPath: string;
  mapData: (raw: Record<string, unknown>) => KpiItem[];
};

export function ModuleDashboardPage({
  title,
  module,
  apiPath,
  mapData,
}: Props) {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const [items, setItems] = useState<KpiItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!permLoading && !can(module)) {
      toast.error("Sem acesso a este módulo.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, module, router]);

  useEffect(() => {
    if (permLoading || !can(module)) return;
    setLoading(true);
    void fetch(apiPath, { credentials: "include" })
      .then((r) => r.json())
      .then((j: { data?: Record<string, unknown>; error?: string }) => {
        if (!j.data) throw new Error(j.error ?? "Erro ao carregar KPIs");
        setItems(mapData(j.data));
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [permLoading, can, module, apiPath, mapData]);

  return (
    <AppPage title={title} density="comfortable" width="wide">
      {loading ? (
        <LoadingState label="A carregar indicadores…" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((k) => (
            <KpiCard
              key={k.title}
              label={k.title}
              value={k.value}
              hint={k.subtitle}
            />
          ))}
        </div>
      )}
    </AppPage>
  );
}
