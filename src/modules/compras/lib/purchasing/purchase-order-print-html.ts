import type {
  CompanySettingsRow,
  PurchaseOrderPrintData,
} from "@/modules/compras/lib/purchasing/purchase-order-display";
import {
  companyDisplayName,
  fmtPoBRL,
  fmtPoDate,
  formatCompanyAddressForPrint,
  formatSupplierAddressForPrint,
  poComputedTotal,
  poItemProductLabel,
  poPaymentTermsText,
  poStatusLabel,
} from "@/modules/compras/lib/purchasing/purchase-order-display";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PRINT_CSS = `
@page { size: A4; margin: 10mm 10mm 16mm 10mm; }
body { margin: 0; background: #fff; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
.po-print-document { font-size: 9pt; line-height: 1.3; color: #0f172a; padding: 0; }
.qp-header { padding-bottom: 0.45rem; border-bottom: 1.5px solid #1e293b; margin-bottom: 0.5rem; }
.qp-header-top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.qp-logo { max-height: 72px; max-width: 200px; object-fit: contain; }
.qp-header-company { flex: 1; text-align: right; }
.qp-company-meta { font-size: 0.68rem; color: #475569; margin: 0.1rem 0; }
.qp-header-doc { margin-top: 0.4rem; padding-top: 0.35rem; text-align: center; border-top: 1px solid #e2e8f0; }
.qp-doc-title { margin: 0; font-size: 1rem; font-weight: 800; letter-spacing: 0.08em; color: #1e293b; text-transform: uppercase; }
.qp-quote-number { font-size: 0.78rem; color: #64748b; margin: 0.15rem 0 0; }
.qp-info-grid { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 0.45rem; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
.qp-info-col { padding: 0.4rem 0.55rem; }
.qp-info-col + .qp-info-col { border-left: 1px solid #e2e8f0; }
.qp-info-col h3 { font-size: 0.58rem; font-weight: 700; text-transform: uppercase; color: #64748b; margin: 0 0 0.25rem; }
.qp-info-row { display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 0.15rem; }
.qp-info-row dt { color: #64748b; }
.qp-info-row dd { margin: 0; font-weight: 600; text-align: right; }
.qp-table-wrap { margin: 0.4rem 0; border: 1px solid #e2e8f0; border-radius: 5px; overflow: hidden; }
.quote-print-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
.quote-print-table thead { background: #1e293b; color: #fff; }
.quote-print-table thead th { padding: 0.3rem 0.35rem; font-weight: 600; text-align: left; }
.quote-print-table thead th.qp-num { text-align: right; }
.quote-print-table tbody td { padding: 0.28rem 0.35rem; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.quote-print-table tbody td.qp-num { text-align: right; font-variant-numeric: tabular-nums; }
.qp-bottom-row { display: flex; justify-content: flex-end; margin-top: 0.35rem; }
.qp-totals-inner { max-width: 240px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
.qp-totals-row { display: flex; justify-content: space-between; padding: 0.28rem 0.55rem; font-size: 0.72rem; border-bottom: 1px solid #f1f5f9; }
.qp-totals-row dd { margin: 0; font-weight: 600; }
.qp-totals-row--grand { background: #f8fafc; font-weight: 800; }
.qp-notes { margin-top: 0.45rem; font-size: 0.72rem; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.4rem 0.55rem; }
.qp-notes h4 { margin: 0 0 0.2rem; font-size: 0.58rem; text-transform: uppercase; color: #64748b; }
`;

export function buildPurchaseOrderPrintHtml(
  order: PurchaseOrderPrintData,
  company: CompanySettingsRow | null,
  logoSrc?: string | null
): string {
  const supplier = order.supplier;
  const items = order.items ?? [];
  const total = poComputedTotal(order);
  const paymentText = poPaymentTermsText(order);
  const supplierAddr = supplier ? formatSupplierAddressForPrint(supplier) : null;

  const itemRows = items
    .map(
      (item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${esc(poItemProductLabel(item))}</td>
        <td class="qp-num">${Number(item.quantity)} ${esc(item.unit)}</td>
        <td class="qp-num">${esc(fmtPoBRL(Number(item.unit_price)))}</td>
        <td class="qp-num">${esc(fmtPoBRL(Number(item.icms_value ?? 0)))}</td>
        <td class="qp-num">${esc(fmtPoBRL(Number(item.ipi_value ?? 0)))}</td>
        <td class="qp-num">${esc(fmtPoBRL(Number(item.total_price)))}</td>
      </tr>`
    )
    .join("");

  const companyBlock = company
    ? `
      <p style="font-weight:700;font-size:0.875rem;color:#0f172a;margin:0">${esc(companyDisplayName(company))}</p>
      ${company.cnpj?.trim() ? `<p class="qp-company-meta">CNPJ: ${esc(company.cnpj.trim())}</p>` : ""}
      ${formatCompanyAddressForPrint(company) ? `<p class="qp-company-meta">${esc(formatCompanyAddressForPrint(company)!)}</p>` : ""}
      ${company.phone?.trim() ? `<p class="qp-company-meta">Tel: ${esc(company.phone.trim())}</p>` : ""}
      ${company.email?.trim() ? `<p class="qp-company-meta">${esc(company.email.trim())}</p>` : ""}
    `
    : "";

  const logoHtml =
    logoSrc?.trim() ?
      `<img src="${esc(logoSrc.trim())}" alt="" class="qp-logo" />`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Pedido ${esc(order.po_number)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <article class="po-print-document">
    <header class="qp-header">
      <div class="qp-header-top">
        <div class="qp-header-brand">${logoHtml}</div>
        <div class="qp-header-company">${companyBlock}</div>
      </div>
      <div class="qp-header-doc">
        <h1 class="qp-doc-title">Pedido de compra</h1>
        <p class="qp-quote-number">N.º ${esc(order.po_number)} · ${esc(poStatusLabel(order.status))}</p>
      </div>
    </header>
    <div class="qp-info-grid">
      <div class="qp-info-col">
        <h3>Fornecedor</h3>
        <dl>
          <div class="qp-info-row"><dt>Nome</dt><dd>${esc(supplier?.name?.trim() || "—")}</dd></div>
          ${supplier?.document?.trim() ? `<div class="qp-info-row"><dt>CNPJ/CPF</dt><dd>${esc(supplier.document.trim())}</dd></div>` : ""}
          ${supplier?.email?.trim() ? `<div class="qp-info-row"><dt>E-mail</dt><dd>${esc(supplier.email.trim())}</dd></div>` : ""}
          ${supplier?.phone?.trim() ? `<div class="qp-info-row"><dt>Telefone</dt><dd>${esc(supplier.phone.trim())}</dd></div>` : ""}
        </dl>
        ${supplierAddr ? `<p style="font-size:0.65rem;color:#475569;margin-top:0.25rem">${esc(supplierAddr)}</p>` : ""}
      </div>
      <div class="qp-info-col">
        <h3>Pedido</h3>
        <dl>
          <div class="qp-info-row"><dt>Data</dt><dd>${esc(fmtPoDate(order.order_date))}</dd></div>
          <div class="qp-info-row"><dt>Entrega prevista</dt><dd>${esc(fmtPoDate(order.expected_delivery))}</dd></div>
          ${paymentText ? `<div class="qp-info-row"><dt>Pagamento</dt><dd style="max-width:10rem;text-align:right">${esc(paymentText)}</dd></div>` : ""}
        </dl>
      </div>
    </div>
    <div class="qp-table-wrap">
      <table class="quote-print-table">
        <thead>
          <tr>
            <th>#</th><th>Produto / descrição</th>
            <th class="qp-num">Qtd.</th><th class="qp-num">Preço un.</th>
            <th class="qp-num">ICMS</th><th class="qp-num">IPI</th><th class="qp-num">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
    <div class="qp-bottom-row">
      <dl class="qp-totals-inner">
        <div class="qp-totals-row"><dt>Subtotal</dt><dd>${esc(fmtPoBRL(order.subtotal))}</dd></div>
        ${order.discount > 0 ? `<div class="qp-totals-row"><dt>Desconto</dt><dd>− ${esc(fmtPoBRL(order.discount))}</dd></div>` : ""}
        ${(order.total_ipi ?? 0) > 0 ? `<div class="qp-totals-row"><dt>Total IPI</dt><dd>${esc(fmtPoBRL(order.total_ipi ?? 0))}</dd></div>` : ""}
        ${order.tax > 0 ? `<div class="qp-totals-row"><dt>Outros impostos</dt><dd>${esc(fmtPoBRL(order.tax))}</dd></div>` : ""}
        <div class="qp-totals-row qp-totals-row--grand"><dt>Total</dt><dd>${esc(fmtPoBRL(total))}</dd></div>
      </dl>
    </div>
    ${order.notes?.trim() ? `<div class="qp-notes"><h4>Observações</h4><p style="margin:0;white-space:pre-wrap">${esc(order.notes.trim())}</p></div>` : ""}
  </article>
</body>
</html>`;
}
