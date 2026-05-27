import PDFDocument from "pdfkit";
import type { PurchaseOrderExportData } from "@/modules/compras/lib/purchasing/fetch-purchase-order-for-export";
import { fmtPoBRL, fmtPoDate } from "@/modules/compras/lib/purchasing/fetch-purchase-order-for-export";

export async function generatePurchaseOrderPdfBuffer(
  order: PurchaseOrderExportData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text("Pedido de compra", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Nº ${order.po_number}`, { align: "center" });
    doc.moveDown(1);

    doc.fontSize(10);
    doc.text(`Fornecedor: ${order.supplier_name}`);
    doc.text(`Data do pedido: ${fmtPoDate(order.order_date)}`);
    doc.text(
      `Prazo de entrega: ${fmtPoDate(order.expected_delivery)}`
    );
    doc.moveDown(0.75);

    doc.fontSize(9).fillColor("#334155");
    const colDesc = 48;
    const colQty = 320;
    const colUnit = 380;
    const colPrice = 430;
    const colTotal = 500;
    let y = doc.y;
    doc.text("Descrição", colDesc, y);
    doc.text("Qtd", colQty, y, { width: 50, align: "right" });
    doc.text("Un.", colUnit, y);
    doc.text("Preço", colPrice, y, { width: 60, align: "right" });
    doc.text("Total", colTotal, y, { width: 60, align: "right" });
    doc.moveDown(0.35);
    doc
      .strokeColor("#cbd5e1")
      .moveTo(48, doc.y)
      .lineTo(547, doc.y)
      .stroke();
    doc.moveDown(0.25);
    doc.fillColor("#0f172a");

    for (const item of order.items) {
      if (doc.y > 700) {
        doc.addPage();
      }
      y = doc.y;
      doc.text(item.description, colDesc, y, { width: 260 });
      const rowH = Math.max(
        doc.heightOfString(item.description, { width: 260 }),
        14
      );
      doc.text(String(item.quantity), colQty, y, {
        width: 50,
        align: "right",
      });
      doc.text(item.unit, colUnit, y);
      doc.text(fmtPoBRL(item.unit_price), colPrice, y, {
        width: 60,
        align: "right",
      });
      doc.text(fmtPoBRL(item.total_price), colTotal, y, {
        width: 60,
        align: "right",
      });
      doc.y = y + rowH + 4;
    }

    doc.moveDown(0.75);
    doc
      .strokeColor("#cbd5e1")
      .moveTo(48, doc.y)
      .lineTo(547, doc.y)
      .stroke();
    doc.moveDown(0.5);

    const totalsX = 360;
    const addTotalRow = (label: string, value: number, bold = false) => {
      if (bold) doc.font("Helvetica-Bold");
      doc.text(label, totalsX, doc.y, { continued: true });
      doc.text(fmtPoBRL(value), { align: "right" });
      if (bold) doc.font("Helvetica");
      doc.moveDown(0.15);
    };

    if (order.discount > 0) addTotalRow("Desconto: ", order.discount);
    if (order.freight_cost > 0) addTotalRow("Frete: ", order.freight_cost);
    addTotalRow("Total: ", order.total, true);

    if (order.notes?.trim()) {
      doc.moveDown(0.75);
      doc.fontSize(9).fillColor("#475569").text("Observações:", { underline: true });
      doc.fillColor("#0f172a").text(order.notes.trim(), { width: 500 });
    }

    doc.end();
  });
}
