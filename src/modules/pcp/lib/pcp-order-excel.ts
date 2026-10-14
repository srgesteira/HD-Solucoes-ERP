import type { PcpPlanningItem, PcpPlanningOrder } from "@/modules/pcp/lib/pcp-planning";
import {
  effectiveOrderProductionDeadline,
  formatPcpDate,
  itemProductionEndDate,
} from "@/modules/pcp/lib/pcp-order-display";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cell(value: string | number): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`;
}

function row(values: Array<string | number>, styleId?: string): string {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Row>${values.map((value) => cell(value).replace("<Cell>", `<Cell${style}>`)).join("")}</Row>`;
}

function pcStatus(item: PcpPlanningItem, received: boolean): string {
  if (item.origin_kind === "estoque") return "—";
  if (!item.purchase_order_item_id) return "Sem PC";
  return received ? "Recebido" : "Pendente";
}

/** Planilha .xls (Excel) com o pedido no formato da folha de produção. */
export function buildPcpOrderExcelXml(
  order: PcpPlanningOrder,
  isPcReceived: (item: PcpPlanningItem) => boolean
): string {
  const items = [...order.items].sort(
    (a, b) => a.line_number - b.line_number
  );
  const prodDeadline = effectiveOrderProductionDeadline(order);

  const headerRows = [
    row(["Pedido para produção"], "Title"),
    row(["Pedido", order.order_number]),
    row(["Cliente", order.client_name]),
    row(["Data início", formatPcpDate(order.created_at.slice(0, 10))]),
    row(["Prazo vendas", formatPcpDate(order.expected_delivery)]),
    row(["Prazo PCP", formatPcpDate(order.pcp_deadline)]),
    row(["Prazo produção", formatPcpDate(prodDeadline)]),
    row([""]),
    row(
      [
        "Item",
        "Código",
        "Descrição",
        "Qtd",
        "Linha",
        "Origem",
        "PC",
        "Prazo prod.",
      ],
      "Header"
    ),
  ];

  const itemRows = items.map((item) =>
    row([
      item.line_number,
      item.product_code?.trim() || "—",
      item.product_name?.trim() || "—",
      item.quantity,
      item.line_name?.trim() || "—",
      item.origin?.trim() || item.origin_label || "—",
      pcStatus(item, isPcReceived(item)),
      formatPcpDate(itemProductionEndDate(item)),
    ])
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/></Style>
  <Style ss:ID="Header"><Font ss:Bold="1"/></Style>
 </Styles>
 <Worksheet ss:Name="Producao">
  <Table>
   <Column ss:Width="50"/>
   <Column ss:Width="140"/>
   <Column ss:Width="360"/>
   <Column ss:Width="50"/>
   <Column ss:Width="120"/>
   <Column ss:Width="90"/>
   <Column ss:Width="80"/>
   <Column ss:Width="90"/>
   ${headerRows.join("\n   ")}
   ${itemRows.join("\n   ")}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function pcpOrderExcelFileName(orderNumber: string): string {
  const safe = orderNumber.trim().replace(/[^\w.\-]+/g, "-") || "pedido";
  return `producao-${safe}.xls`;
}

export function downloadPcpOrderExcel(
  order: PcpPlanningOrder,
  isPcReceived: (item: PcpPlanningItem) => boolean
): void {
  const xml = buildPcpOrderExcelXml(order, isPcReceived);
  const blob = new Blob([xml], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = pcpOrderExcelFileName(order.order_number);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
