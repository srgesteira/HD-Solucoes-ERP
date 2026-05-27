"use client";

import type { CompanySettingsRow } from "@/lib/purchasing/purchase-order-display";
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
  type PurchaseOrderPrintData,
} from "@/lib/purchasing/purchase-order-display";
import { cn } from "@/lib/utils/cn";

const PRINT_STYLES = `
@media print {
  @page { size: A4; margin: 10mm 10mm 16mm 10mm; }
  body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .po-print-toolbar, .print\\:hidden { display: none !important; }
  .po-print-document { box-shadow: none !important; padding: 0 !important; max-width: none !important; }
  .quote-print-table thead { background: #1e293b !important; color: #fff !important; }
}
.po-print-document {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 9pt; line-height: 1.3; color: #0f172a;
}
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

type Props = {
  order: PurchaseOrderPrintData;
  company: CompanySettingsRow | null;
  className?: string;
};

export function PurchaseOrderPrintDocument({
  order,
  company,
  className,
}: Props) {
  const supplier = order.supplier;
  const items = order.items ?? [];
  const total = poComputedTotal(order);
  const paymentText = poPaymentTermsText(order);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <article className={cn("po-print-document quote-print-document", className)}>
        <header className="qp-header">
          <div className="qp-header-top">
            <div className="qp-header-brand">
              {company?.logo_url?.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.logo_url.trim()}
                  alt=""
                  className="qp-logo"
                />
              ) : null}
            </div>
            <div className="qp-header-company">
              {company ? (
                <>
                  <p className="font-bold text-sm text-slate-900">
                    {companyDisplayName(company)}
                  </p>
                  {company.cnpj?.trim() ? (
                    <p className="qp-company-meta">
                      CNPJ: {company.cnpj.trim()}
                    </p>
                  ) : null}
                  {formatCompanyAddressForPrint(company) ? (
                    <p className="qp-company-meta">
                      {formatCompanyAddressForPrint(company)}
                    </p>
                  ) : null}
                  {company.phone?.trim() ? (
                    <p className="qp-company-meta">Tel: {company.phone.trim()}</p>
                  ) : null}
                  {company.email?.trim() ? (
                    <p className="qp-company-meta">{company.email.trim()}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <div className="qp-header-doc">
            <h1 className="qp-doc-title">Pedido de compra</h1>
            <p className="qp-quote-number">
              N.º {order.po_number} · {poStatusLabel(order.status)}
            </p>
          </div>
        </header>

        <div className="qp-info-grid">
          <div className="qp-info-col">
            <h3>Fornecedor</h3>
            <dl>
              <div className="qp-info-row">
                <dt>Nome</dt>
                <dd>{supplier?.name?.trim() || "—"}</dd>
              </div>
              {supplier?.document?.trim() ? (
                <div className="qp-info-row">
                  <dt>CNPJ/CPF</dt>
                  <dd>{supplier.document.trim()}</dd>
                </div>
              ) : null}
              {supplier?.email?.trim() ? (
                <div className="qp-info-row">
                  <dt>E-mail</dt>
                  <dd>{supplier.email.trim()}</dd>
                </div>
              ) : null}
              {supplier?.phone?.trim() ? (
                <div className="qp-info-row">
                  <dt>Telefone</dt>
                  <dd>{supplier.phone.trim()}</dd>
                </div>
              ) : null}
            </dl>
            {supplier && formatSupplierAddressForPrint(supplier) ? (
              <p className="text-[0.65rem] text-slate-600 mt-1">
                {formatSupplierAddressForPrint(supplier)}
              </p>
            ) : null}
          </div>
          <div className="qp-info-col">
            <h3>Pedido</h3>
            <dl>
              <div className="qp-info-row">
                <dt>Data</dt>
                <dd>{fmtPoDate(order.order_date)}</dd>
              </div>
              <div className="qp-info-row">
                <dt>Entrega prevista</dt>
                <dd>{fmtPoDate(order.expected_delivery)}</dd>
              </div>
              {paymentText ? (
                <div className="qp-info-row">
                  <dt>Pagamento</dt>
                  <dd className="max-w-[10rem] text-right">{paymentText}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>

        <div className="qp-table-wrap">
          <table className="quote-print-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Produto / descrição</th>
                <th className="qp-num">Qtd.</th>
                <th className="qp-num">Preço un.</th>
                <th className="qp-num">ICMS</th>
                <th className="qp-num">IPI</th>
                <th className="qp-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id}>
                  <td>{idx + 1}</td>
                  <td>{poItemProductLabel(item)}</td>
                  <td className="qp-num">
                    {Number(item.quantity)} {item.unit}
                  </td>
                  <td className="qp-num">{fmtPoBRL(Number(item.unit_price))}</td>
                  <td className="qp-num">
                    {fmtPoBRL(Number(item.icms_value ?? 0))}
                  </td>
                  <td className="qp-num">
                    {fmtPoBRL(Number(item.ipi_value ?? 0))}
                  </td>
                  <td className="qp-num">
                    {fmtPoBRL(Number(item.total_price))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="qp-bottom-row">
          <dl className="qp-totals-inner">
            <div className="qp-totals-row">
              <dt>Subtotal</dt>
              <dd>{fmtPoBRL(order.subtotal)}</dd>
            </div>
            {order.discount > 0 ? (
              <div className="qp-totals-row">
                <dt>Desconto</dt>
                <dd>− {fmtPoBRL(order.discount)}</dd>
              </div>
            ) : null}
            {(order.total_ipi ?? 0) > 0 ? (
              <div className="qp-totals-row">
                <dt>Total IPI</dt>
                <dd>{fmtPoBRL(order.total_ipi ?? 0)}</dd>
              </div>
            ) : null}
            {order.tax > 0 ? (
              <div className="qp-totals-row">
                <dt>Outros impostos</dt>
                <dd>{fmtPoBRL(order.tax)}</dd>
              </div>
            ) : null}
            <div className="qp-totals-row qp-totals-row--grand">
              <dt>Total</dt>
              <dd>{fmtPoBRL(total)}</dd>
            </div>
          </dl>
        </div>

        {order.notes?.trim() ? (
          <div className="qp-notes">
            <h4>Observações</h4>
            <p className="whitespace-pre-wrap m-0">{order.notes.trim()}</p>
          </div>
        ) : null}
      </article>
    </>
  );
}
