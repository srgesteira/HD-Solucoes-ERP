"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { AppPage } from "@/shared/ui/app-page";
import { LoadingState } from "@/shared/ui/page-helpers";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import {
  CRONOGRAMA_TOKENS,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import {
  matchesUniversalSearchRow,
  parseUniversalSearch,
} from "@/shared/utils/universal-search";
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
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();
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

  const searchHint = parseUniversalSearch(search);
  const visibleRows = useMemo(() => {
    if (!searchHint.text) return rows;
    return rows.filter((row) =>
      matchesUniversalSearchRow(
        searchHint,
        [
          row.code,
          row.name,
          row.is_support ? "apoio sim" : "apoio não",
          DRIVER_LABELS[row.allocation_driver ?? "hours"],
        ],
        []
      )
    );
  }, [rows, searchHint]);

  const tableColumns = useMemo((): SortableTableColumn<Department>[] => {
    return [
      {
        key: "code",
        label: "Código",
        type: "text",
        width: "w-[15%]",
        accessor: (row) => row.code,
        truncate: false,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellLink}>{row.code}</span>
        ),
      },
      {
        key: "name",
        label: "Nome",
        type: "text",
        width: "w-[30%]",
        accessor: (row) => row.name,
      },
      {
        key: "is_support",
        label: "Apoio",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => (row.is_support ? "Sim" : "Não"),
      },
      {
        key: "allocation_driver",
        label: "Direcionador de rateio",
        type: "text",
        width: "w-[38%]",
        accessor: (row) =>
          row.is_support
            ? DRIVER_LABELS[row.allocation_driver ?? "hours"]
            : "—",
        truncate: false,
        render: (row) =>
          row.is_support && isAdmin ? (
            <select
              className="flex h-9 w-full max-w-[220px] rounded-md border border-slate-300 px-2 text-sm bg-white"
              value={row.allocation_driver ?? "hours"}
              onChange={(e) =>
                void updateDriver(
                  row.id,
                  e.target.value as AllocationDriver
                )
              }
            >
              {(Object.keys(DRIVER_LABELS) as AllocationDriver[]).map((d) => (
                <option
                  key={d}
                  value={d}
                  disabled={
                    d === "shipped_weight" || d === "movements_count"
                  }
                >
                  {DRIVER_LABELS[d]}
                </option>
              ))}
            </select>
          ) : row.is_support ? (
            DRIVER_LABELS[row.allocation_driver ?? "hours"]
          ) : (
            "—"
          ),
      },
    ];
  }, [isAdmin]);

  if (permLoading || (!permLoading && !can("hr"))) {
    return (
      <AppPage title="Departamentos">
        <LoadingState label="A validar acesso…" />
      </AppPage>
    );
  }

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-brand-700" />
          Departamentos
        </span>
      }
      description="Cronograma de departamentos — rateio para linhas de produção."
      width="wide"
      density="comfortable"
      actions={
        isAdmin ? (
          <Button
            type="button"
            size="sm"
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
            Novo
          </Button>
        ) : null
      }
    >

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

      <CronogramaPanel
        search={
          <CronogramaSearch
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Buscar código, nome ou direcionador…"
          />
        }
      >
        <SortableTable
          columns={tableColumns}
          data={visibleRows}
          getRowKey={(row) => row.id}
          isLoading={loading}
          emptyMessage="Nenhum departamento cadastrado."
        />
      </CronogramaPanel>
    </AppPage>
  );
}
