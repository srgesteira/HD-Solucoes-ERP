"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Plus,
  Search,
  User,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { cn } from "@/shared/utils/cn";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import {
  CustomerQuickCreateModal,
  type CustomerFormValues,
} from "@/components/sales/customer-quick-create-modal";
import {
  CUSTOMERS_QUERY_KEY,
  customersListQueryKey,
} from "@/modules/vendas/lib/customers/query-keys";

interface CustomerRow {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
}

interface CustomersApiResponse {
  data: CustomerRow[];
  pagination: { page: number; limit: number; total: number };
}

async function fetchCustomers(filters: {
  isActive: string;
  search: string;
  page: number;
  limit: number;
}): Promise<CustomersApiResponse> {
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

  const res = await fetch(`/api/customers?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as CustomersApiResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao carregar clientes"
    );
  }
  if (!json.data || !json.pagination) {
    throw new Error("Resposta inválida da API");
  }
  return json;
}

async function setCustomerActive(id: string, isActive: boolean): Promise<void> {
  const res = await fetch(`/api/customers/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar cliente");
}

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { can } = usePermissions();
  const canManage = me?.role === "admin" || can("sales");

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
    isActive: "all",
    search: "",
    page: 1,
    limit: 25,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerFormValues | null>(null);
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput, page: 1 }));
    }, 380);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: customersListQueryKey(filters),
    queryFn: () => fetchCustomers(filters),
    enabled: canManage,
  });

  const totalPages = data?.pagination
    ? Math.max(1, Math.ceil(data.pagination.total / filters.limit))
    : 0;

  const rangeDescription = useMemo(() => {
    if (!data?.pagination) return "";
    const { total } = data.pagination;
    const start = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
    const end = Math.min(filters.page * filters.limit, total);
    return `${start}–${end} de ${total}`;
  }, [data?.pagination, filters.page, filters.limit]);

  const handleToggleActive = async (row: CustomerRow) => {
    setToggleBusy(row.id);
    try {
      await setCustomerActive(row.id, !row.is_active);
      toast.success(row.is_active ? "Cliente desativado." : "Cliente reativado.");
      await queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível alterar o estado."
      );
    } finally {
      setToggleBusy(null);
    }
  };

  const openCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const openEdit = (row: CustomerRow) => {
    setEditTarget({
      id: row.id,
      name: row.name,
      document: row.document,
      email: row.email,
      phone: row.phone,
      address: row.address,
      is_active: row.is_active,
    });
    setModalOpen(true);
  };

  const tableColumns = useMemo((): SortableTableColumn<CustomerRow>[] => {
    return [
      {
        key: "name",
        label: "Nome",
        type: "text",
        width: "w-[22%]",
        accessor: (row) => row.name,
        render: (row) => (
          <span className="font-medium text-slate-900 line-clamp-2">{row.name}</span>
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
        width: "w-[20%]",
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
        width: "w-[14%]",
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

  if (!canManage) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <p className="text-sm text-slate-600">
          Sem permissão para aceder ao cadastro de clientes.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Clientes</h2>
          <p className="text-sm text-slate-500 mt-1">
            Cadastro para orçamentos e pedidos — busca por CNPJ/CPF e contactos.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo cliente
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 font-semibold">
            <User className="h-5 w-5 text-slate-600" aria-hidden />
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
                placeholder="Buscar por nome, documento ou e-mail…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
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
            emptyMessage="Nenhum cliente encontrado para estes filtros."
            actionsColumn={{
              label: "Ações",
              width: "w-[5rem]",
              render: (row) =>
                canManage ? (
                  <RowActionsMenu
                    items={[
                      {
                        id: "edit",
                        label: "Editar",
                        icon: <Edit className="h-4 w-4" />,
                        onClick: () => openEdit(row),
                      },
                      {
                        id: "toggle",
                        label: row.is_active ? "Desativar" : "Reativar",
                        icon: row.is_active ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <User className="h-4 w-4" />
                        ),
                        disabled: toggleBusy === row.id,
                        onClick: () => void handleToggleActive(row),
                      },
                    ]}
                  />
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            }}
          />

          {data?.pagination && data.pagination.total > 0 ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-600">
              <span>{rangeDescription}</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() =>
                    setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums">
                  Página {filters.page} de {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filters.page >= totalPages}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      page: Math.min(totalPages, f.page + 1),
                    }))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <CustomerQuickCreateModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditTarget(null);
        }}
        editCustomer={editTarget}
        onCreated={() => {
          toast.success("Cliente criado.");
          void queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
        }}
        onUpdated={() => {
          toast.success("Cliente atualizado.");
          void queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
        }}
      />
    </div>
  );
}
