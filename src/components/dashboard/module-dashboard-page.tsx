"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { usePermissions } from "@/hooks/use-permissions";
import type { ModuleKey } from "@/lib/permissions";
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
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
      {loading ? (
        <p className="flex items-center gap-2 text-slate-600 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((k) => (
            <KpiCard
              key={k.title}
              title={k.title}
              value={k.value}
              subtitle={k.subtitle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
