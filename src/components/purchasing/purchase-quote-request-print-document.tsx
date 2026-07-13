"use client";

import type { CompanySettingsRow } from "@/modules/compras/lib/purchasing/purchase-order-display";
import {
  companyDisplayName,
  fmtPoDate,
  formatCompanyAddressForPrint,
} from "@/modules/compras/lib/purchasing/purchase-order-display";
import {
  purchaseQuoteRequestStatusLabel,
  type PurchaseQuoteRequestDetail,
} from "@/modules/compras/lib/purchasing/request-purchase-quote";
import { cn } from "@/shared/utils/cn";

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
.qp-notes { margin-top: 0.45rem; font-size: 0.72rem; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.4rem 0.55rem; }
.qp-notes h4 { margin: 0 0 0.2rem; font-size: 0.58rem; text-transform: uppercase; color: #64748b; }
`;

function itemCode(item: PurchaseQuoteRequestDetail["items"][number]): string {
  return (
    item.product?.technical_code?.trim() ||
    item.product?.code?.trim() ||
    "—"
  );
}

function itemLabel(item: PurchaseQuoteRequestDetail["items"][number]): string {
  return item.product?.name?.trim() || item.description;
}

type Props = {
  request: PurchaseQuoteRequestDetail;
  company: CompanySettingsRow | null;
  className?: string;
};

export function PurchaseQuoteRequestPrintDocument({
  request,
  company,
  className,
}: Props) {
  const items = request.items ?? [];

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
            <h1 className="qp-doc-title">Solicitação de orçamento</h1>
            <p className="qp-quote-number">
              N.º {request.request_number} ·{" "}
              {purchaseQuoteRequestStatusLabel(request.status)}
            </p>
          </div>
        </header>

        <div className="qp-info-grid">
          <div className="qp-info-col">
            <h3>Dados da solicitação</h3>
            <dl>
              <div className="qp-info-row">
                <dt>Data</dt>
                <dd>{fmtPoDate(request.request_date)}</dd>
              </div>
              <div className="qp-info-row">
                <dt>Necessidade</dt>
                <dd>
                  {request.need_date ? fmtPoDate(request.need_date) : "—"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="qp-info-col">
            <h3>Pedido ao fornecedor</h3>
            <p className="text-[0.72rem] text-slate-700 m-0 leading-snug">
              {request.message?.trim() ||
                "Solicito cotação dos itens abaixo, com prazo de entrega e condições de pagamento."}
            </p>
          </div>
        </div>

        <div className="qp-table-wrap">
          <table className="quote-print-table">
            <thead>
              <tr>
                <th style={{ width: "6%" }}>#</th>
                <th style={{ width: "16%" }}>Código</th>
                <th>Descrição</th>
                <th className="qp-num" style={{ width: "14%" }}>
                  Qtd
                </th>
                <th style={{ width: "10%" }}>Un.</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 12 }}>
                    Sem itens nesta solicitação.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td style={{ fontFamily: "monospace" }}>{itemCode(item)}</td>
                    <td>{itemLabel(item)}</td>
                    <td className="qp-num">{item.quantity}</td>
                    <td>{item.unit}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {request.notes?.trim() ? (
          <div className="qp-notes">
            <h4>Observações</h4>
            <p className="m-0 whitespace-pre-wrap">{request.notes.trim()}</p>
          </div>
        ) : null}
      </article>
    </>
  );
}
