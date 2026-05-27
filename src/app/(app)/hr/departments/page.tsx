"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/use-permissions";
import { useMe } from "@/hooks/use-me";

type AllocationDriver =
  | "hours"
  | "purchase_orders"
  | "shipped_weight"
  | "movements_count";

type Department = {
  id: string;
  name: string;
  code: string;
  is_support: boolean;
  allocation_driver: AllocationDriver;
};

const DRIVER_LABELS: Record<AllocationDriver, string> = {
  hours: "Horas trabalhadas",
  purchase_orders: "Pedidos de compra (MRP)",
  shipped_weight: "Peso expedido (em breve)",
  movements_count: "Movimentações estoque (em breve)",
};

export default function HrDepartmentsPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const [rows, setRows] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    is_support: true,
    allocation_driver: "hours" as AllocationDriver,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/departments", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as { data?: Department[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro");
      setRows(j.data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!permLoading && !can("hr")) {
      toast.error("Sem acesso ao módulo RH.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, router]);

  useEffect(() => {
    if (permLoading || !can("hr")) return;
    void load();
  }, [permLoading, can, load]);

  async function save() {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error("Nome e código são obrigatórios.");
      return;
    }
    const res = await fetch("/api/departments", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        code: form.code.trim(),
        is_support: form.is_support,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro");
      return;
    }
    toast.success("Departamento criado.");
    setShowNew(false);
    setForm({
      name: "",
      code: "",
      is_support: true,
      allocation_driver: "hours",
    });
    void load();
  }

  async function updateDriver(id: string, driver: AllocationDriver) {
    const res = await fetch(`/api/departments/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocation_driver: driver }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro");
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, allocation_driver: driver } : r))
    );
    toast.success("Direcionador actualizado.");
  }

  if (permLoading || (!permLoading && !can("hr"))) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-brand-700" />
            Departamentos
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Departamentos de apoio são rateados para as linhas conforme o
            direcionador escolhido.
          </p>
        </div>
        {isAdmin ? (
          <Button
            type="button"
            onClick={() => {
              setShowNew(true);
              setForm({
                name: "",
                code: "",
                is_support: true,
                allocation_driver: "hours",
              });
            }}
          >
            <Plus className="h-4 w-4" />
            <span className="ml-1">Novo</span>
          </Button>
        ) : null}
      </div>

      {showNew && isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo departamento</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Código *</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="COMPRAS"
              />
            </div>
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                id="dept-support"
                type="checkbox"
                checked={form.is_support}
                onChange={(e) =>
                  setForm((f) => ({ ...f, is_support: e.target.checked }))
                }
              />
              <Label htmlFor="dept-support">
                Departamento de apoio (entra no rateio)
              </Label>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void save()}>
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listagem</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-600 py-6 text-center">
              Nenhum departamento cadastrado.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2">Código</th>
                    <th className="text-left px-3 py-2">Nome</th>
                    <th className="text-left px-3 py-2">Apoio</th>
                    <th className="text-left px-3 py-2">Direcionador de rateio</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">{r.is_support ? "Sim" : "Não"}</td>
                      <td className="px-3 py-2">
                        {r.is_support && isAdmin ? (
                          <select
                            className="flex h-9 min-w-[220px] rounded-md border border-slate-300 px-2 text-sm bg-white"
                            value={r.allocation_driver ?? "hours"}
                            onChange={(e) =>
                              void updateDriver(
                                r.id,
                                e.target.value as AllocationDriver
                              )
                            }
                          >
                            {(Object.keys(DRIVER_LABELS) as AllocationDriver[]).map(
                              (d) => (
                                <option
                                  key={d}
                                  value={d}
                                  disabled={
                                    d === "shipped_weight" ||
                                    d === "movements_count"
                                  }
                                >
                                  {DRIVER_LABELS[d]}
                                </option>
                              )
                            )}
                          </select>
                        ) : r.is_support ? (
                          DRIVER_LABELS[r.allocation_driver ?? "hours"]
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
