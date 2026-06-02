"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Plus,
  Search,
  Truck,
  User,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import {
  SUPPLIERS_QUERY_KEY,
  suppliersListQueryKey,
} from "@/modules/compras/lib/suppliers/query-keys";

interface SupplierRow {
  id: string;
  code: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

interface SuppliersApiResponse {
  data: SupplierRow[];
  pagination: { page: number; limit: number; total: number };
}

async function fetchSuppliers(filters: {
  isActive: string;
  search: string;
  page: number;
  limit: number;
}): Promise<SuppliersApiResponse> {
  const params = new URLSearchParams();
  if (filters.isActive !== "all") {
    params.append(
      "is_active",
      filters.isActive === "active" ? "true" : "false"
    );
  }
  if (filters.search.trim()) params.append("search", filters.search.trim());
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));

  const res = await fetch(`/api/purchasing/suppliers?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as SuppliersApiResponse & {
    error?: string;
    detail?: unknown;
  };

  if (!res.ok) {
    const errMsg =
      typeof json.error === "string" ? json.error : "Erro ao carregar fornecedores";
    throw new Error(errMsg);
  }

  if (!json.data || !json.pagination) {
    throw new Error("Resposta invÃ¡lida da API");
  }

  return json as SuppliersApiResponse;
}

async function setSupplierActive(id: string, isActive: boolean): Promise<void> {
  const res = await fetch(`/api/purchasing/suppliers/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar fornecedor");
}

export default function SuppliersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
    isActive: "all",
    search: "",
    page: 1,
    limit: 25,
  });

  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput, page: 1 }));
    }, 380);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: suppliersListQueryKey(filters),
    queryFn: () => fetchSuppliers(filters),
  });

  const [toggleBusy, setToggleBusy] = useState<string | null>(null);

  const handleToggleActive = async (row: SupplierRow) => {
    if (!isAdmin) return;
    setToggleBusy(row.id);
    try {
      await setSupplierActive(row.id, !row.is_active);
      toast.success(
        row.is_active ? "Fornecedor desativado." : "Fornecedor reativado."
      );
      await queryClient.invalidateQueries({ queryKey: SUPPLIERS_QUERY_KEY });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "NÃ£o foi possÃ­vel alterar o estado."
      );
    } finally {
      setToggleBusy(null);
    }
  };

  const totalPages = data?.pagination
    ? Math.max(1, Math.ceil(data.pagination.total / filters.limit))
    : 0;

  const rangeDescription = useMemo(() => {
    if (!data?.pagination) return "";
    const { total } = data.pagination;
    const start = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
    const end = Math.min(filters.page * filters.limit, total);
    return `${start}â€“${end} de ${total}`;
  }, [data?.pagination, filters.page, filters.limit]);

  const tableColumns = useMemo((): SortableTableColumn<SupplierRow>[] => {
    return [
      {
        key: "code",
        label: "Código",
        type: "text",
        width: "w-[10%]",
        accessor: (row) => row.code,
        truncate: false,
        render: (row) => (
          <span className="font-medium text-slate-900 whitespace-nowrap">
            {row.code}
          </span>
        ),
      },
      {
        key: "name",
        label: "Nome",
        type: "text",
        width: "w-[20%]",
        accessor: (row) => row.name,
        render: (row) => (
          <span className="text-slate-800 line-clamp-2">{row.name}</span>
        ),
      },
      {
        key: "document",
        label: "Documento",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => row.document,
        truncate: false,
        render: (row) => (
          <span className="text-slate-700 whitespace-nowrap">
            {row.document?.trim() || "—"}
          </span>
        ),
      },
      {
        key: "email",
        label: "E-mail",
        type: "text",
        width: "w-[18%]",
        accessor: (row) => row.email,
        render: (row) => (
          <span className="text-slate-700 line-clamp-1">
            {row.email?.trim() || "—"}
          </span>
        ),
      },
      {
        key: "phone",
        label: "Telefone",
        type: "text",
        width: "w-[13%]",
        accessor: (row) => row.phone,
        truncate: false,
        render: (row) => (
          <span className="text-slate-700 whitespace-nowrap">
            {row.phone?.trim() || "—"}
          </span>
        ),
      },
      {
        key: "is_active",
        label: "Estado",
        type: "text",
        width: "w-[10%]",
        accessor: (row) => (row.is_active ? "Ativo" : "Inativo"),
        truncate: false,
        render: (row) => (
          <span
            className={cn(
              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
              row.is_active
                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                : "bg-slate-100 text-slate-600 ring-1 ring-slate-300"
            )}
          >
            {row.is_active ? "Ativo" : "Inativo"}
          </span>
        ),
      },
    ];
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Fornecedores</h2>
          <p className="text-sm text-slate-500 mt-1">
            Cadastro de fornecedores do tenant â€” CNPJ/CPF, contactos e estado.
          </p>
        </div>
        {isAdmin ? (
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/purchasing/suppliers/new")}
          >
            <Plus className="h-4 w-4" />
            Novo fornecedor
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 font-semibold">
            <Truck className="h-5 w-5 text-slate-600" aria-hidden />
            Listagem
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                aria-hidden
              />
              <Input
                placeholder="Buscar por nome, documento ou e-mailâ€¦"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <select
                className={cn(
                  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
                )}
                aria-label="Filtrar por estado"
                value={filters.isActive}
                onChange={(e) =>
                  setFilters({ ...filters, isActive: e.target.value, page: 1 })
                }
              >
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-red-800">{error.message}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
              >
                Tentar de novo
              </Button>
            </div>
          ) : null}

          <SortableTable
            columns={tableColumns}
            data={data?.data ?? []}
            getRowKey={(row) => row.id}
            isLoading={isLoading}
            emptyMessage="Nenhum fornecedor encontrado para estes filtros."
            actionsColumn={{
              label: "Ações",
              width: "w-[5rem]",
              render: (supplier) =>
                isAdmin ? (
                  <RowActionsMenu
                    items={[
                      {
                        id: "edit",
                        label: "Editar",
                        icon: <Edit className="h-4 w-4" />,
                        onClick: () =>
                          router.push(
                            `/purchasing/suppliers/${supplier.id}/edit`
                          ),
                      },
                      {
                        id: "toggle",
                        label: supplier.is_active ? "Desativar" : "Reativar",
                        icon: supplier.is_active ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <User className="h-4 w-4" />
                        ),
                        disabled: toggleBusy === supplier.id,
                        onClick: () => void handleToggleActive(supplier),
                      },
                    ]}
                  />
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            }}
          />

          {data?.pagination?.total !== undefined && data.pagination.total > 0 ? (
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-1">
              <p className="text-sm text-slate-500">
                Fornecedores nesta pÃ¡gina: {data.data.length}. Intervalo total:{" "}
                <span className="font-medium text-slate-700">
                  {rangeDescription}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() =>
                    setFilters({ ...filters, page: Math.max(1, filters.page - 1) })
                  }
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-sm tabular-nums px-2 text-slate-600">
                  PÃ¡gina {filters.page} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filters.page >= totalPages}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      page: Math.min(totalPages, filters.page + 1),
                    })
                  }
                  aria-label="PÃ¡gina seguinte"
                >
                  Seguinte
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>


      {!isLoading && error == null ? (
        <p className="text-xs text-slate-500 text-center pb-8">
          <Link href="/boards" className="text-brand-700 underline">
            Voltar Ã s tarefas
          </Link>
        </p>
      ) : null}
    </div>
  );
}
