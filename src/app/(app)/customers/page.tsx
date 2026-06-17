"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, User, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { AppPage } from "@/shared/ui/app-page";
import { StatusBadge } from "@/shared/ui/page-helpers";
import {
  CRONOGRAMA_TOKENS,
  CronogramaError,
  CronogramaPagination,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
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

type CustomerTab = "all" | "active" | "inactive";

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

const TAB_OPTIONS: Array<{ value: CustomerTab; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

async function fetchCustomers(filters: {
  tab: CustomerTab;
  search: string;
  page: number;
  limit: number;
}): Promise<CustomersApiResponse> {
  const params = new URLSearchParams();
  if (filters.tab === "active") params.append("is_active", "true");
  else if (filters.tab === "inactive") params.append("is_active", "false");
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

  const [activeTab, setActiveTab] = useState<CustomerTab>("all");
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();
  const [page, setPage] = useState(1);
  const limit = 25;
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerFormValues | null>(null);
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search, activeTab]);

  const queryFilters = useMemo(
    () => ({ tab: activeTab, search, page, limit }),
    [activeTab, search, page, limit]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: customersListQueryKey({
      isActive: activeTab,
      search,
      page,
      limit,
    }),
    queryFn: () => fetchCustomers(queryFilters),
    enabled: canManage,
  });

  const totalPages = data?.pagination
    ? Math.max(1, Math.ceil(data.pagination.total / limit))
    : 0;

  const rangeDescription = useMemo(() => {
    if (!data?.pagination) return "";
    const { total } = data.pagination;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    return `${start}–${end} de ${total}`;
  }, [data?.pagination, page, limit]);

  const invalidateCustomers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
  }, [queryClient]);

  const handleToggleActive = async (row: CustomerRow) => {
    setToggleBusy(row.id);
    try {
      await setCustomerActive(row.id, !row.is_active);
      toast.success(row.is_active ? "Cliente desativado." : "Cliente reativado.");
      await invalidateCustomers();
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
          <span className={`${CRONOGRAMA_TOKENS.cellText} font-medium line-clamp-2`}>
            {row.name}
          </span>
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
          <span className={`${CRONOGRAMA_TOKENS.cellMuted} whitespace-nowrap`}>
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
          <span className={CRONOGRAMA_TOKENS.cellText}>
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
          <span className={`${CRONOGRAMA_TOKENS.cellMuted} whitespace-nowrap`}>
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
          <StatusBadge tone={row.is_active ? "success" : "muted"}>
            {row.is_active ? "Ativo" : "Inativo"}
          </StatusBadge>
        ),
      },
    ];
  }, []);

  if (!canManage) {
    return (
      <AppPage title="Clientes" width="narrow">
        <p className="text-sm text-slate-600">
          Sem permissão para aceder ao cadastro de clientes.
        </p>
      </AppPage>
    );
  }

  const listPanel = (
    <CronogramaPanel
      search={
        <CronogramaSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Buscar nome, documento, e-mail, telefone ou morada…"
        />
      }
      error={
        error ? (
          <CronogramaError message={error.message} onRetry={() => void refetch()} />
        ) : null
      }
      footer={
        data?.pagination?.total ? (
          <CronogramaPagination
            page={page}
            totalPages={totalPages}
            rangeDescription={rangeDescription}
            itemCount={data?.data?.length}
            onPageChange={setPage}
          />
        ) : null
      }
    >
      <SortableTable
        columns={tableColumns}
        data={data?.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        emptyMessage="Nenhum cliente encontrado."
        actionsColumn={{
          label: "Ações",
          width: "w-[5rem]",
          render: (row) => (
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
          ),
        }}
      />
    </CronogramaPanel>
  );

  return (
    <AppPage
      title="Clientes"
      description="Cronograma de cadastro — orçamentos e pedidos de venda."
      density="comfortable"
      width="wide"
      actions={
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo cliente
        </Button>
      }
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as CustomerTab);
          setPage(1);
        }}
      >
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {TAB_OPTIONS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TAB_OPTIONS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            {listPanel}
          </TabsContent>
        ))}
      </Tabs>

      <CustomerQuickCreateModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditTarget(null);
        }}
        editCustomer={editTarget}
        onCreated={() => {
          toast.success("Cliente criado.");
          void invalidateCustomers();
        }}
        onUpdated={() => {
          toast.success("Cliente atualizado.");
          void invalidateCustomers();
        }}
      />
    </AppPage>
  );
}
