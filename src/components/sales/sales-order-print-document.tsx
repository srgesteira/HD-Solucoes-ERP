"use client";

import { cn } from "@/shared/utils/cn";
import {
  companyDisplayName,
  formatCompanyAddressForPrint,
  fmtSoBRL,
  fmtSoDate,
  soItemCode,
  soItemLineTotal,
  soItemName,
  soPaymentTermsText,
  soStatusLabel,
  type CompanySettingsRow,
  type SalesOrderPrintData,
} from "@/modules/vendas/lib/sales/sales-order-print-display";

const PRINT_STYLES = `
@media print {
  @page { size: A4; margin: 10mm 10mm 16mm 10mm; }
  body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .so-print-toolbar, .print\\:hidden { display: none !important; }
  .so-print-document { box-shadow: none !important; padding: 0 !important; max-width: none !important; }
  .quote-print-table thead { background: #1e293b !important; color: #fff !important; }
}
.so-print-document {
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
.qp-info-row { display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 0.15rem; gap: 0.5rem; }
.qp-info-row dt { color: #64748b; flex-shrink: 0; }
.qp-info-row dd { margin: 0; font-weight: 600; text-align: right; }
.qp-table-wrap { margin: 0.4rem 0; border: 1px solid #e2e8f0; border-radius: 5px; overflow: hidden; }
.quote-print-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
.quote-print-table thead { background: #1e293b; color: #fff; }
.quote-print-table thead th { padding: 0.3rem 0.35rem; font-weight: 600; text-align: left; }
.quote-print-table thead th.qp-num { text-align: right; }
.quote-print-table tbody td { padding: 0.28rem 0.35rem; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.quote-print-table tbody td.qp-num { text-align: right; font-variant-numeric: tabular-nums; }
.qp-item-name { font-weight: 600; }
.qp-item-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.62rem; color: #64748b; }
.qp-item-extra { margin: 0.2rem 0 0; font-size: 0.65rem; color: #475569; white-space: pre-wrap; }
.qp-item-extra-label { font-weight: 600; color: #64748b; }
.qp-bottom-row { display: flex; justify-content: flex-end; margin-top: 0.35rem; }
.qp-totals-inner { max-width: 240px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
.qp-totals-row { display: flex; justify-content: space-between; padding: 0.28rem 0.55rem; font-size: 0.72rem; border-bottom: 1px solid #f1f5f9; }
.qp-totals-row dd { margin: 0; font-weight: 600; }
.qp-totals-row--grand { background: #f8fafc; font-weight: 800; }
.qp-notes { margin-top: 0.45rem; font-size: 0.72rem; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.4rem 0.55rem; }
.qp-notes h4 { margin: 0 0 0.2rem; font-size: 0.58rem; text-transform: uppercase; color: #64748b; }
`;

type Props = {
  order: SalesOrderPrintData;
  company: CompanySettingsRow | null;
  className?: string;
};

export function SalesOrderPrintDocument({
  order,
  company,
  className,
}: Props) {
  const items = order.items ?? [];
  const paymentText = soPaymentTermsText(order);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <article className={cn("so-print-document quote-print-document", className)}>
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
                    <p className="qp-company-meta">
                      Tel: {company.phone.trim()}
                    </p>
                  ) : null}
                  {company.email?.trim() ? (
                    <p className="qp-company-meta">{company.email.trim()}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <div className="qp-header-doc">
            <h1 className="qp-doc-title">Pedido de venda</h1>
            <p className="qp-quote-number">
              N.º {order.order_number} · {soStatusLabel(order.status)}
            </p>
          </div>
        </header>

        <div className="qp-info-grid">
          <div className="qp-info-col">
            <h3>Cliente</h3>
            <dl>
              <div className="qp-info-row">
                <dt>Nome</dt>
                <dd>{order.client_name?.trim() || "—"}</dd>
              </div>
              {order.client_document?.trim() ? (
                <div className="qp-info-row">
                  <dt>CNPJ/CPF</dt>
                  <dd>{order.client_document.trim()}</dd>
                </div>
              ) : null}
              {order.client_email?.trim() ? (
                <div className="qp-info-row">
                  <dt>E-mail</dt>
                  <dd>{order.client_email.trim()}</dd>
                </div>
              ) : null}
              {order.client_phone?.trim() ? (
                <div className="qp-info-row">
                  <dt>Telefone</dt>
                  <dd>{order.client_phone.trim()}</dd>
                </div>
              ) : null}
              {order.customer_po_number?.trim() ? (
                <div className="qp-info-row">
                  <dt>Pedido do cliente</dt>
                  <dd>{order.customer_po_number.trim()}</dd>
                </div>
              ) : null}
            </dl>
            {order.client_address?.trim() ? (
              <p className="text-[0.65rem] text-slate-600 mt-1 whitespace-pre-wrap">
                {order.client_address.trim()}
              </p>
            ) : null}
          </div>
          <div className="qp-info-col">
            <h3>Pedido</h3>
            <dl>
              <div className="qp-info-row">
                <dt>Data</dt>
                <dd>{fmtSoDate(order.order_date)}</dd>
              </div>
              <div className="qp-info-row">
                <dt>Prazo de entrega</dt>
                <dd>{fmtSoDate(order.expected_delivery)}</dd>
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
                <th>Código</th>
                <th>Produto</th>
                <th className="qp-num">Qtd.</th>
                <th className="qp-num">Preço un.</th>
                <th className="qp-num">Desc.</th>
                <th className="qp-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const notes = item.item_notes?.trim() || "";
                const disc = Number(item.discount ?? 0);
                return (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td className="qp-item-code">{soItemCode(item)}</td>
                    <td>
                      <div className="qp-item-name">{soItemName(item)}</div>
                      {notes ? (
                        <p className="qp-item-extra">
                          <span className="qp-item-extra-label">Obs.: </span>
                          {notes}
                        </p>
                      ) : null}
                    </td>
                    <td className="qp-num">
                      {Number(item.quantity)}
                      {item.unit?.trim() ? ` ${item.unit.trim()}` : ""}
                    </td>
                    <td className="qp-num">
                      {fmtSoBRL(Number(item.unit_price))}
                    </td>
                    <td className="qp-num">
                      {disc > 0 ? fmtSoBRL(disc) : "—"}
                    </td>
                    <td className="qp-num">
                      {fmtSoBRL(soItemLineTotal(item))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="qp-bottom-row">
          <dl className="qp-totals-inner">
            <div className="qp-totals-row">
              <dt>Subtotal</dt>
              <dd>{fmtSoBRL(Number(order.subtotal))}</dd>
            </div>
            {Number(order.discount) > 0 ? (
              <div className="qp-totals-row">
                <dt>Desconto</dt>
                <dd>− {fmtSoBRL(Number(order.discount))}</dd>
              </div>
            ) : null}
            {Number(order.total_ipi ?? 0) > 0 ? (
              <div className="qp-totals-row">
                <dt>Total IPI</dt>
                <dd>{fmtSoBRL(Number(order.total_ipi ?? 0))}</dd>
              </div>
            ) : null}
            {Number(order.tax) > 0 ? (
              <div className="qp-totals-row">
                <dt>Outros impostos</dt>
                <dd>{fmtSoBRL(Number(order.tax))}</dd>
              </div>
            ) : null}
            <div className="qp-totals-row qp-totals-row--grand">
              <dt>Total</dt>
              <dd>{fmtSoBRL(Number(order.total))}</dd>
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
