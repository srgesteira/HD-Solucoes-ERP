"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, User, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { AppPage } from "@/shared/ui/app-page";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  CRONOGRAMA_TOKENS,
  CronogramaError,
  CronogramaPagination,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import {
  SUPPLIERS_QUERY_KEY,
  suppliersListQueryKey,
} from "@/modules/compras/lib/suppliers/query-keys";

type SupplierTab = "all" | "active" | "inactive";

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

const TAB_OPTIONS: Array<{ value: SupplierTab; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

async function fetchSuppliers(filters: {
  tab: SupplierTab;
  search: string;
  page: number;
  limit: number;
}): Promise<SuppliersApiResponse> {
  const params = new URLSearchParams();
  if (filters.tab === "active") params.append("is_active", "true");
  else if (filters.tab === "inactive") params.append("is_active", "false");
  if (filters.search.trim()) params.append("search", filters.search.trim());
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));

  const res = await fetch(`/api/purchasing/suppliers?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as SuppliersApiResponse & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao carregar fornecedores"
    );
  }

  if (!json.data || !json.pagination) {
    throw new Error("Resposta inválida da API");
  }

  return json;
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

  const [activeTab, setActiveTab] = useState<SupplierTab>("all");
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();
  const [page, setPage] = useState(1);
  const limit = 25;
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search, activeTab]);

  const queryFilters = useMemo(
    () => ({ tab: activeTab, search, page, limit }),
    [activeTab, search, page, limit]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: suppliersListQueryKey({
      isActive: activeTab,
      search,
      page,
      limit,
    }),
    queryFn: () => fetchSuppliers(queryFilters),
  });

  const invalidateSuppliers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: SUPPLIERS_QUERY_KEY });
  }, [queryClient]);

  const handleToggleActive = async (row: SupplierRow) => {
    if (!isAdmin) return;
    setToggleBusy(row.id);
    try {
      await setSupplierActive(row.id, !row.is_active);
      toast.success(
        row.is_active ? "Fornecedor desativado." : "Fornecedor reativado."
      );
      await invalidateSuppliers();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível alterar o estado."
      );
    } finally {
      setToggleBusy(null);
    }
  };

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
          <span className={`${CRONOGRAMA_TOKENS.cellLink} whitespace-nowrap`}>
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
          <span className={CRONOGRAMA_TOKENS.cellText}>{row.name}</span>
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
        width: "w-[18%]",
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
        width: "w-[13%]",
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
          <span
            className={cn(
              CRONOGRAMA_TOKENS.badge,
              row.is_active
                ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                : "bg-slate-100 text-slate-600 ring-slate-300"
            )}
          >
            {row.is_active ? "Ativo" : "Inativo"}
          </span>
        ),
      },
    ];
  }, []);

  const listPanel = (
    <CronogramaPanel
      search={
        <CronogramaSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Buscar código, nome, documento, e-mail ou telefone…"
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
        emptyMessage="Nenhum fornecedor encontrado."
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
                      router.push(`/purchasing/suppliers/${supplier.id}/edit`),
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
    </CronogramaPanel>
  );

  return (
    <AppPage
      title="Fornecedores"
      description="Cronograma de cadastro — compras e contas a pagar."
      density="comfortable"
      width="wide"
      actions={
        isAdmin ? (
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/purchasing/suppliers/new")}
          >
            <Plus className="h-4 w-4" />
            Novo fornecedor
          </Button>
        ) : null
      }
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as SupplierTab);
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

      {!isLoading && error == null ? (
        <p className="text-xs text-slate-500 text-center pb-8">
          <Link href="/boards" className="text-brand-700 underline">
            Voltar às tarefas
          </Link>
        </p>
      ) : null}
    </AppPage>
  );
}
