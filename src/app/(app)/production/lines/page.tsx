"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Factory, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type LineRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export default function ProductionLinesPage() {
  const [rows, setRows] = useState<LineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/production/lines", {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await res.json().catch(() => ({}))) as {
          data?: LineRow[];
          error?: string;
        };
        if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
        if (!cancelled) setRows(j.data ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Factory className="h-7 w-7 text-brand-700" aria-hidden />
            Linhas de produção
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Cadastro de linhas usadas nas ordens de produção.
          </p>
        </div>
        <Link
          href="/production/orders"
          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 h-9 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Ver ordens de produção
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma linha</CardTitle>
            <CardDescription>
              As linhas podem ser criadas por administradores (API ou futura UI de
              gestão).
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      {r.code} — {r.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.is_active ? "Activa" : "Inactiva"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
