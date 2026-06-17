"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Send } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { AppPage } from "@/shared/ui/app-page";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  CRONOGRAMA_TOKENS,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import { StatusBadge, type StatusTone } from "@/shared/ui/page-helpers";
import {
  matchesUniversalSearchRow,
  parseUniversalSearch,
} from "@/shared/utils/universal-search";

type ShipmentTab = "all" | "prepared" | "in_transit" | "delivered" | "cancelled";

type ShipmentRow = {
  id: string;
  shipment_number: string;
  source_kind: string;
  direction: string;
  status: string;
  scheduled_for: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  destination_name: string | null;
  carrier_name: string | null;
  tracking_code: string | null;
  freight_value: number;
};

const TAB_OPTIONS: Array<{ value: ShipmentTab; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "prepared", label: "Preparados" },
  { value: "in_transit", label: "Em trânsito" },
  { value: "delivered", label: "Entregues" },
  { value: "cancelled", label: "Cancelados" },
];

async function fetchShipments(): Promise<ShipmentRow[]> {
  const res = await fetch("/api/shipments", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    items?: ShipmentRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar despachos");
  return json.items ?? [];
}

const STATUS_LABEL: Record<string, string> = {
  prepared: "Preparado",
  in_transit: "Em trânsito",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_TONE: Record<string, StatusTone> = {
  prepared: "neutral",
  in_transit: "warning",
  delivered: "success",
  cancelled: "danger",
};

const SOURCE_LABEL: Record<string, string> = {
  sales_order: "Pedido de venda",
  sales_return: "Devolução de venda",
  purchase_return: "Devolução de compra",
  manual: "Manual",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

import { formatBrl } from "@/shared/utils/format-brl";

type DirectionTab = "all" | "outbound" | "inbound";

const DIRECTION_TABS: Array<{ value: DirectionTab; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "outbound", label: "Entrega" },
  { value: "inbound", label: "Coleta" },
];

const DIRECTION_LABEL: Record<string, string> = {
  outbound: "Entrega",
  inbound: "Coleta",
};

export default function LogisticsShippingPage() {
  const [directionTab, setDirectionTab] = useState<DirectionTab>("outbound");
  const [statusFilter, setStatusFilter] = useState<ShipmentTab>("all");
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();

  const query = useQuery({
    queryKey: ["shipments"],
    queryFn: fetchShipments,
    staleTime: 30_000,
  });

  const searchHint = parseUniversalSearch(search);
  const filteredItems = useMemo(() => {
    let items = query.data ?? [];
    if (directionTab !== "all") {
      items = items.filter((s) => s.direction === directionTab);
    }
    if (statusFilter !== "all") {
      items = items.filter((s) => s.status === statusFilter);
    }
    if (!searchHint.text) return items;
    return items.filter((s) =>
      matchesUniversalSearchRow(
        searchHint,
        [
          s.shipment_number,
          s.destination_name,
          s.carrier_name,
          s.tracking_code,
          s.scheduled_for,
          STATUS_LABEL[s.status],
          SOURCE_LABEL[s.source_kind],
          s.freight_value,
        ],
        []
      )
    );
  }, [query.data, directionTab, statusFilter, searchHint]);

  const tableColumns = useMemo((): SortableTableColumn<ShipmentRow>[] => {
    return [
      {
        key: "shipment_number",
        label: "Número",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => row.shipment_number,
        truncate: false,
        render: (row) => (
          <Link
            href={`/logistics/shipping/${row.id}`}
            className={CRONOGRAMA_TOKENS.cellLink}
          >
            {row.shipment_number}
          </Link>
        ),
      },
      {
        key: "direction",
        label: "Tipo",
        type: "text",
        width: "w-[8%]",
        accessor: (row) => row.direction,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellText}>
            {DIRECTION_LABEL[row.direction] ?? row.direction}
          </span>
        ),
      },
      {
        key: "source_kind",
        label: "Origem",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => SOURCE_LABEL[row.source_kind] ?? row.source_kind,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellText}>
            {SOURCE_LABEL[row.source_kind] ?? row.source_kind}
          </span>
        ),
      },
      {
        key: "destination_name",
        label: "Destino",
        type: "text",
        width: "w-[16%]",
        accessor: (row) => row.destination_name,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellText}>
            {row.destination_name ?? "—"}
          </span>
        ),
      },
      {
        key: "carrier_name",
        label: "Transportadora",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => row.carrier_name,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellText}>
            {row.carrier_name ?? "—"}
          </span>
        ),
      },
      {
        key: "tracking_code",
        label: "Tracking",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => row.tracking_code,
        truncate: false,
        render: (row) => (
          <span className="font-mono text-xs text-slate-600">
            {row.tracking_code ?? "—"}
          </span>
        ),
      },
      {
        key: "scheduled_for",
        label: "Agendado",
        type: "date",
        width: "w-[10%]",
        accessor: (row) => row.scheduled_for,
        truncate: false,
        render: (row) => (
          <span className={`${CRONOGRAMA_TOKENS.cellMuted} whitespace-nowrap`}>
            {formatDate(row.scheduled_for)}
          </span>
        ),
      },
      {
        key: "freight_value",
        label: "Frete",
        type: "number",
        width: "w-[10%]",
        align: "right",
        accessor: (row) => row.freight_value,
        truncate: false,
        render: (row) => (
          <span className="text-xs tabular-nums font-medium">
            {formatBrl(row.freight_value)}
          </span>
        ),
      },
      {
        key: "status",
        label: "Status",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => STATUS_LABEL[row.status] ?? row.status,
        truncate: false,
        render: (row) => (
          <StatusBadge tone={STATUS_TONE[row.status] ?? "neutral"}>
            {STATUS_LABEL[row.status] ?? row.status}
          </StatusBadge>
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
          placeholder="Buscar nº, destino, transportadora, tracking ou data…"
        />
      }
    >
      <SortableTable
        columns={tableColumns}
        data={filteredItems}
        getRowKey={(row) => row.id}
        isLoading={query.isLoading}
        emptyMessage="Nenhum despacho no filtro actual."
      />
    </CronogramaPanel>
  );

  return (
    <AppPage
      title="Expedição"
      description="Cronograma logístico — cargas, coletas e rastreamento."
      width="wide"
      density="comfortable"
      actions={
        <Link href="/logistics/shipping/new">
          <Button type="button" size="sm">
            <Plus className="h-4 w-4" />
            Novo despacho
          </Button>
        </Link>
      }
    >
      <Tabs
        value={directionTab}
        onValueChange={(v) =>
          setDirectionTab(
            v === "inbound" || v === "all" ? v : "outbound"
          )
        }
      >
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {DIRECTION_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-500">Status:</span>
          {TAB_OPTIONS.map((tab) => (
            <Button
              key={tab.value}
              type="button"
              size="sm"
              variant={statusFilter === tab.value ? "primary" : "outline"}
              className="h-7 text-xs"
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        {DIRECTION_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            {listPanel}
          </TabsContent>
        ))}
      </Tabs>
    </AppPage>
  );
}
