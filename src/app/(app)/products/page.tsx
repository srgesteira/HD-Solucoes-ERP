"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
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
} from "@/shared/ui/cronograma-layout";import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { meCanManageEngineeringProducts } from "@/modules/engenharia/lib/engineering-product-access";
import { ProductLifecycleBadge } from "@/components/products/product-lifecycle-badge";
import { ProductPrefixTabs } from "@/components/products/product-prefix-tabs";
import { ProductRowActionsMenu } from "@/components/products/product-row-actions-menu";

type ProductType = "finished" | "raw" | "component";
type ProductTab = "all" | "active" | "inactive" | "pending";

const TAB_OPTIONS: Array<{ value: ProductTab; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "pending", label: "Eng. pendente" },
];
interface ProductRow {
  id: string;
  name: string;
  type: string;
  unit: string | null;
  technical_code: string | null;
  cost_price: number;
  is_active: boolean;
  product_nature?: string | null;
  has_composition?: boolean;
  engineering_workflow_status?: string | null;
  released_for_sale?: boolean;
  prefix?: { code?: string | null } | { code?: string | null }[] | null;
}

interface ProductsApiResponse {
  data: ProductRow[];
  pagination: { page: number; limit: number; total: number };
}

const productsQueryKey = (filters: {
  tab: ProductTab;
  search: string;
  prefixCode: string;
  page: number;
  limit: number;
}) => ["products", filters] as const;
async function fetchPrefixCodes(): Promise<string[]> {
  const res = await fetch("/api/products/prefix-codes", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: string[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar prefixos");
  }
  return json.data ?? [];
}

async function fetchProducts(filters: {
  tab: ProductTab;
  search: string;
  prefixCode: string;
  page: number;
  limit: number;
}): Promise<ProductsApiResponse> {
  const params = new URLSearchParams();
  if (filters.tab === "active") params.append("is_active", "true");
  else if (filters.tab === "inactive") params.append("is_active", "false");
  else if (filters.tab === "pending") params.append("workflow_pending", "1");
  if (filters.prefixCode.trim()) {
    params.append("prefix_code", filters.prefixCode.trim());
  }
  if (filters.search.trim()) params.append("search", filters.search.trim());
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));
  const res = await fetch(`/api/products?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ProductsApiResponse & {
    error?: string;
    detail?: unknown;
  };

  if (!res.ok) {
    const errMsg =
      typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : "Erro ao carregar produtos";
    throw new Error(errMsg);
  }

  if (!json.data || !json.pagination) {
    throw new Error("Resposta inválida da API");
  }

  return json as ProductsApiResponse;
}

async function deactivateProduct(id: string): Promise<void> {
  const res = await fetch(`/api/products/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: false }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao marcar produto como inativo");
  }
}

async function hardDeleteProduct(id: string): Promise<void> {
  const res = await fetch(`/api/products/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao excluir produto");
}

function typeBadgeClasses(type: string): { label: string; className: string } {
  switch (type as ProductType) {
    case "finished":
      return {
        label: "Acabado",
        className: "bg-brand-50 text-brand-800 ring-1 ring-brand-700/25",
      };
    case "raw":
      return {
        label: "Matéria-prima",
        className: "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
      };
    case "component":
      return {
        label: "Componente",
        className:
          "bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30",
      };
    default:
      return {
        label: type,
        className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
      };
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

export default function ProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const canManageProducts = meCanManageEngineeringProducts(me);

  const [activeTab, setActiveTab] = useState<ProductTab>("all");
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();
  const [prefixCode, setPrefixCode] = useState("");
  const [page, setPage] = useState(1);
  const limit = 25;

  useEffect(() => {
    setPage(1);
  }, [search, activeTab, prefixCode]);

  const queryFilters = useMemo(
    () => ({ tab: activeTab, search, prefixCode, page, limit }),
    [activeTab, search, prefixCode, page, limit]
  );

  const prefixCodesQuery = useQuery({
    queryKey: ["product-prefix-codes"],
    queryFn: fetchPrefixCodes,
    staleTime: 120_000,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: productsQueryKey(queryFilters),
    queryFn: () => fetchProducts(queryFilters),
    staleTime: 60_000,
  });

  const [deactivateTarget, setDeactivateTarget] = useState<ProductRow | null>(
    null
  );
  const [hardDeleteTarget, setHardDeleteTarget] = useState<ProductRow | null>(
    null
  );
  const [actionBusy, setActionBusy] = useState(false);

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget || !isAdmin) return;
    setActionBusy(true);
    try {
      await deactivateProduct(deactivateTarget.id);
      toast.success("Produto marcado como inativo.");
      setDeactivateTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível desactivar."
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmHardDelete = async () => {
    if (!hardDeleteTarget || !isAdmin) return;
    setActionBusy(true);
    try {
      await hardDeleteProduct(hardDeleteTarget.id);
      toast.success("Produto excluído permanentemente.");
      setHardDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
    } finally {
      setActionBusy(false);
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

  const tableColumns = useMemo((): SortableTableColumn<ProductRow>[] => {
    return [
      {
        key: "technical_code",
        label: "Código técnico",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => row.technical_code,
        truncate: false,
        render: (row) => (
          <button
            type="button"
            onClick={() => router.push(`/products/${row.id}/edit`)}
            className="font-mono text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:underline whitespace-nowrap cursor-pointer text-left"
          >
            {row.technical_code?.trim() || "—"}
          </button>
        ),
      },
      {
        key: "name",
        label: "Nome",
        type: "text",
        width: "w-[24%]",
        accessor: (row) => row.name,
        truncate: false,
        render: (row) => (
          <span className="text-slate-800 line-clamp-2">{row.name}</span>
        ),
      },
      {
        key: "lifecycle",
        label: "Ciclo",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => row.product_nature ?? row.type,
        truncate: false,
        render: (row) => (
          <ProductLifecycleBadge
            prefix={row.prefix}
            product_nature={row.product_nature}
            has_composition={row.has_composition}
            released_for_sale={row.released_for_sale}
            engineering_workflow_status={row.engineering_workflow_status}
          />
        ),
      },
      {
        key: "type",
        label: "Tipo",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => typeBadgeClasses(row.type).label,
        truncate: false,
        render: (row) => {
          const tb = typeBadgeClasses(row.type);
          return (
            <span
              className={cn(
                "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                tb.className
              )}
            >
              {tb.label}
            </span>
          );
        },
      },
      {
        key: "unit",
        label: "Und.",
        type: "text",
        width: "w-[8%]",
        accessor: (row) => row.unit,
        truncate: false,
        render: (row) => (
          <span className="text-slate-700 whitespace-nowrap">
            {row.unit?.trim() || "—"}
          </span>
        ),
      },
      {
        key: "cost_price",
        label: "Custo lista",
        type: "number",
        width: "w-[12%]",
        align: "right",
        accessor: (row) => row.cost_price,
        truncate: false,
        render: (row) => (
          <span className="tabular-nums text-slate-800">
            {formatCurrency(row.cost_price)}
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

  const listPanel = (
    <CronogramaPanel
      search={
        <>
          <ProductPrefixTabs
            codes={prefixCodesQuery.data ?? []}
            activeCode={prefixCode}
            onChange={(code) => {
              setPrefixCode(code);
              setPage(1);
            }}
            isLoading={prefixCodesQuery.isLoading}
            showAllTab={isAdmin}
          />
          <CronogramaSearch
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Buscar código técnico, nome, tipo ou descrição…"
          />
        </>
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
        emptyMessage="Nenhum produto encontrado."
        rowClassName={(row) =>
          row.engineering_workflow_status === "pending_composition"
            ? "bg-amber-50/90 animate-pulse ring-1 ring-inset ring-amber-300/80"
            : ""
        }
        actionsColumn={{
          label: "Ações",
          width: "w-[5rem]",
          render: (product) =>
            isAdmin ? (
              <ProductRowActionsMenu
                productId={product.id}
                productType={product.type}
                onDeactivate={() => setDeactivateTarget(product)}
                onHardDelete={() => setHardDeleteTarget(product)}
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
      title="Produtos"
      description="Cronograma de catálogo — códigos, custos e ciclo de engenharia."
      density="comfortable"
      width="wide"
      actions={
        canManageProducts ? (
          <Button type="button" size="sm" onClick={() => router.push("/products/new")}>
            <Plus className="h-4 w-4" />
            Novo produto
          </Button>
        ) : null
      }
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as ProductTab);
          setPage(1);
        }}
      >
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {TAB_OPTIONS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "text-xs sm:text-sm",
                tab.value === "pending" &&
                  activeTab === "pending" &&
                  "animate-pulse text-amber-800"
              )}
            >
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

      {deactivateTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deactivate-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3
              id="deactivate-title"
              className="text-lg font-semibold text-slate-900"
            >
              Marcar como inativo
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              O produto{" "}
              <strong className="font-medium text-slate-900">
                {deactivateTarget.technical_code?.trim()
                  ? `${deactivateTarget.technical_code} — `
                  : ""}
                {deactivateTarget.name}
              </strong>{" "}
              deixará de aparecer como ativo, mas permanece no sistema.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={actionBusy}
                onClick={() => setDeactivateTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={actionBusy}
                onClick={() => void handleConfirmDeactivate()}
              >
                {actionBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A guardar…
                  </>
                ) : (
                  "Marcar como inativo"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {hardDeleteTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hard-del-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 id="hard-del-title" className="text-lg font-semibold text-slate-900">
              Excluir permanentemente
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Tem certeza que deseja excluir este produto? Esta ação é
              irreversível. O produto só será excluído se não tiver sido usado em
              vendas, compras, produção ou composições.
            </p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              {hardDeleteTarget.technical_code?.trim()
                ? `${hardDeleteTarget.technical_code} — `
                : ""}
              {hardDeleteTarget.name}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={actionBusy}
                onClick={() => setHardDeleteTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={actionBusy}
                onClick={() => void handleConfirmHardDelete()}
              >
                {actionBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A excluir…
                  </>
                ) : (
                  "Excluir permanentemente"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
