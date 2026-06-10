"use client";

import type { Tables } from "@/modules/core/types/database";
import {
  fmtQuoteBRL,
  fmtQuoteDay,
  formatCompanyAddressForPrint,
  quoteStatusBadge,
  unwrapQuoteCustomer,
  quoteItemPrintDescription,
  unwrapQuoteProductCode,
  unwrapQuoteProductDescription,
  unwrapQuoteProductName,
  type QuotePrintData,
} from "@/modules/vendas/lib/sales/quote-display";
import { cn } from "@/shared/utils/cn";

const PRINT_STYLES = `
@media print {
  @page {
    size: A4;
    margin: 10mm 10mm 16mm 10mm;
  }
  body {
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .quote-print-toolbar,
  .print\\:hidden {
    display: none !important;
  }
  .quote-print-document {
    box-shadow: none !important;
    padding: 0 !important;
    max-width: none !important;
  }
  .quote-print-table thead {
    background: #1e293b !important;
    color: #fff !important;
  }
  .quote-print-table thead th {
    color: #fff !important;
  }
  .quote-print-fixed-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 4px 10mm;
    border-top: 1px solid #e2e8f0;
    background: #fff;
    font-size: 7px;
    color: #64748b;
    text-align: center;
  }
  .qp-markup-hint {
    display: inline;
    margin-left: 0.2rem;
  }
  .quote-print-table tbody td {
    padding: 0.22rem 0.3rem;
  }
}

.quote-print-document {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 9pt;
  line-height: 1.3;
  color: #0f172a;
}

.qp-header {
  padding-bottom: 0.45rem;
  border-bottom: 1.5px solid #1e293b;
  margin-bottom: 0.5rem;
}

.qp-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.qp-header-brand {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
}

.qp-logo {
  max-height: 72px;
  max-width: 200px;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}

.qp-header-company {
  flex: 1 1 auto;
  min-width: 0;
  text-align: right;
}

.qp-company-meta {
  font-size: 0.68rem;
  color: #475569;
  margin: 0.1rem 0;
  line-height: 1.4;
}

.qp-header-doc {
  margin-top: 0.4rem;
  padding-top: 0.35rem;
  text-align: center;
  border-top: 1px solid #e2e8f0;
}

.qp-doc-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #1e293b;
  text-transform: uppercase;
}

.qp-quote-number {
  font-size: 0.78rem;
  color: #64748b;
  margin: 0.15rem 0 0;
}

.qp-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-bottom: 0.45rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
}

.qp-info-col {
  padding: 0.4rem 0.55rem;
}

.qp-info-col + .qp-info-col {
  border-left: 1px solid #e2e8f0;
}

.qp-info-col h3 {
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin: 0 0 0.25rem;
}

.qp-info-row {
  display: flex;
  justify-content: space-between;
  gap: 0.35rem;
  font-size: 0.72rem;
  margin-bottom: 0.15rem;
}

.qp-info-row:last-child {
  margin-bottom: 0;
}

.qp-info-row dt {
  color: #64748b;
}

.qp-info-row dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}

.qp-status-badge {
  display: inline-block;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-size: 0.62rem;
  font-weight: 600;
}

.qp-pair-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
  margin-bottom: 0.45rem;
}

.qp-pair-row--single {
  grid-template-columns: 1fr;
}

.qp-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.4rem 0.55rem;
  margin-bottom: 0;
  min-height: 0;
}

.qp-box--solo {
  margin-bottom: 0.45rem;
}

.qp-box-title {
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin: 0 0 0.3rem;
}

.qp-box-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.2rem 0.75rem;
  font-size: 0.7rem;
}

.qp-box-item dt {
  color: #64748b;
  font-size: 0.62rem;
  margin-bottom: 0;
}

.qp-box-item dd {
  margin: 0;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.25;
}

.qp-box-item--full {
  grid-column: 1 / -1;
}

.qp-table-wrap {
  margin: 0.4rem 0;
  overflow: hidden;
  border-radius: 5px;
  border: 1px solid #e2e8f0;
}

.quote-print-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.68rem;
}

.quote-print-table thead {
  background: #1e293b;
  color: #fff;
}

.quote-print-table thead th {
  padding: 0.3rem 0.35rem;
  font-weight: 600;
  text-align: left;
  font-size: 0.65rem;
}

.quote-print-table thead th.qp-num {
  text-align: right;
}

.quote-print-table thead th.qp-qty-col {
  text-align: center;
  width: 3.25rem;
}

.quote-print-table thead th.qp-code-col {
  width: 6.5rem;
}

.quote-print-table tbody td {
  padding: 0.28rem 0.35rem;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: top;
  line-height: 1.25;
}

.quote-print-table tbody td.qp-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.qp-qty {
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
}

.qp-qty-num {
  display: block;
  font-weight: 700;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.qp-qty-unit {
  display: block;
  margin-top: 0.05rem;
  font-size: 0.58rem;
  font-weight: 500;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  line-height: 1.1;
}

.quote-print-table tbody tr:last-child td {
  border-bottom: none;
}

.qp-code {
  font-family: ui-monospace, monospace;
  font-size: 0.62rem;
}

.qp-product-name {
  display: block;
  font-weight: 600;
  line-height: 1.3;
}

.qp-product-desc {
  margin: 0.2rem 0 0;
  font-size: 0.62rem;
  font-weight: 400;
  color: #475569;
  line-height: 1.35;
}

.qp-product-desc-label {
  font-weight: 600;
  color: #64748b;
}

.qp-markup-hint {
  display: block;
  font-size: 0.58rem;
  color: #64748b;
  font-weight: 400;
}

.qp-line-total {
  font-weight: 700;
}

.qp-bottom-row {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  align-items: flex-start;
  margin-top: 0.35rem;
}

.qp-totals-inner {
  width: 100%;
  max-width: 220px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.qp-totals-row {
  display: flex;
  justify-content: space-between;
  padding: 0.28rem 0.55rem;
  font-size: 0.72rem;
  border-bottom: 1px solid #f1f5f9;
}

.qp-totals-row dt,
.qp-totals-row dd {
  margin: 0;
}

.qp-totals-row dd {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.qp-totals-row--grand {
  background: #f8fafc;
  border-bottom: none;
  padding: 0.38rem 0.55rem;
}

.qp-totals-row--grand dt {
  font-weight: 800;
  font-size: 0.78rem;
}

.qp-totals-row--grand dd {
  font-weight: 800;
  font-size: 0.9rem;
  color: #1e293b;
}

.qp-notes {
  margin-top: 0.35rem;
  padding: 0.4rem 0.55rem;
  border-left: 2px solid #1e293b;
  background: #f8fafc;
  font-size: 0.7rem;
  white-space: pre-wrap;
}

.qp-screen-footer {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid #e2e8f0;
  text-align: center;
  font-size: 0.65rem;
  color: #64748b;
}

@media print {
  .qp-screen-footer {
    display: none;
  }
}
`;

type Props = {
  quote: QuotePrintData;
  company: Tables<"company_settings"> | null | undefined;
  className?: string;
};

export function QuotePrintDocument({ quote, company, className }: Props) {
  const sb = quoteStatusBadge(quote.status);
  const cust = unwrapQuoteCustomer(quote.customer, quote.client_name);
  const items = Array.isArray(quote.items) ? quote.items : [];
  const addr = company ? formatCompanyAddressForPrint(company) : null;

  const hasCommercial =
    Boolean(quote.payment_terms?.trim()) ||
    Boolean(quote.delivery_deadline?.trim()) ||
    Boolean(quote.shipping_type?.trim());

  const contactLine = company
    ? [
        company.phone?.trim() ? `Tel. ${company.phone.trim()}` : null,
        company.email?.trim() ?? null,
        company.website?.trim() ?? null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <article className={cn("quote-print-document", className)}>
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
            {company ? (
              <div className="qp-header-company">
                {company.cnpj?.trim() ? (
                  <p className="qp-company-meta">
                    CNPJ {company.cnpj.trim()}
                  </p>
                ) : null}
                {addr ? <p className="qp-company-meta">{addr}</p> : null}
                {contactLine ? (
                  <p className="qp-company-meta">{contactLine}</p>
                ) : null}
              </div>
            ) : (
              <div className="qp-header-company" aria-hidden />
            )}
          </div>
          <div className="qp-header-doc">
            <h1 className="qp-doc-title">Orçamento comercial</h1>
            <p className="qp-quote-number">Nº {quote.quote_number}</p>
          </div>
        </header>

        <section className="qp-info-grid">
          <div className="qp-info-col">
            <h3>Dados do orçamento</h3>
            <dl>
              <div className="qp-info-row">
                <dt>Data</dt>
                <dd>{fmtQuoteDay(quote.quote_date)}</dd>
              </div>
              <div className="qp-info-row">
                <dt>Validade</dt>
                <dd>
                  {fmtQuoteDay(quote.valid_until)}
                  {quote.validity_days != null
                    ? ` (${quote.validity_days}d)`
                    : ""}
                </dd>
              </div>
            </dl>
          </div>
          <div className="qp-info-col">
            <h3>Controlo</h3>
            <dl>
              <div className="qp-info-row">
                <dt>Estado</dt>
                <dd>
                  <span className={cn("qp-status-badge", sb.className)}>
                    {sb.label}
                  </span>
                </dd>
              </div>
              <div className="qp-info-row">
                <dt>Registado em</dt>
                <dd>{fmtQuoteDay(quote.created_at)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <div
          className={cn(
            "qp-pair-row",
            !hasCommercial && "qp-pair-row--single",
          )}
        >
          <section className="qp-box">
            <h2 className="qp-box-title">Cliente</h2>
            <dl className="qp-box-grid">
              <div className="qp-box-item">
                <dt>Nome</dt>
                <dd>{cust?.name ?? quote.client_name}</dd>
              </div>
              <div className="qp-box-item">
                <dt>Documento</dt>
                <dd>{cust?.document ?? "—"}</dd>
              </div>
              <div className="qp-box-item">
                <dt>E-mail</dt>
                <dd>{quote.client_email ?? cust?.email ?? "—"}</dd>
              </div>
              <div className="qp-box-item">
                <dt>Telefone</dt>
                <dd>{cust?.phone ?? "—"}</dd>
              </div>
              {cust?.address ? (
                <div className="qp-box-item qp-box-item--full">
                  <dt>Endereço</dt>
                  <dd>{cust.address}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {hasCommercial ? (
            <section className="qp-box">
              <h2 className="qp-box-title">Condições comerciais</h2>
              <dl className="qp-box-grid">
                <div className="qp-box-item">
                  <dt>Pagamento</dt>
                  <dd>{quote.payment_terms?.trim() || "—"}</dd>
                </div>
                <div className="qp-box-item">
                  <dt>Prazo de entrega</dt>
                  <dd>{quote.delivery_deadline?.trim() || "—"}</dd>
                </div>
                <div className="qp-box-item">
                  <dt>Frete</dt>
                  <dd>
                    {quote.shipping_type?.trim() || "—"}
                    {quote.shipping_type === "CIF" &&
                    Number(quote.freight_cost ?? 0) > 0
                      ? ` — ${fmtQuoteBRL(Number(quote.freight_cost))}`
                      : ""}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}
        </div>

        <section className="qp-table-wrap">
          <table className="quote-print-table">
            <thead>
              <tr>
                <th className="qp-code-col">Código</th>
                <th>Produto</th>
                <th className="qp-qty-col">Qtd.</th>
                <th className="qp-num">Preço unit.</th>
                <th className="qp-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((line) => {
                  const showProductDesc = Boolean(line.show_product_description);
                  const productDesc = showProductDesc
                    ? unwrapQuoteProductDescription(line.product)
                    : null;
                  const extraDesc = showProductDesc
                    ? quoteItemPrintDescription(
                        line.description,
                        line.product
                      )
                    : null;
                  return (
                  <tr key={line.id}>
                    <td className="qp-code">
                      {unwrapQuoteProductCode(line.product)}
                    </td>
                    <td>
                      <span className="qp-product-name">
                        {unwrapQuoteProductName(line.product)}
                      </span>
                      {productDesc ? (
                        <p className="qp-product-desc whitespace-pre-wrap">
                          <span className="qp-product-desc-label">
                            Descrição:{" "}
                          </span>
                          {productDesc}
                        </p>
                      ) : null}
                      {extraDesc && extraDesc !== productDesc ? (
                        <p className="qp-product-desc whitespace-pre-wrap">
                          <span className="qp-product-desc-label">
                            Detalhe:{" "}
                          </span>
                          {extraDesc}
                        </p>
                      ) : null}
                      {line.client_notes?.trim() ? (
                        <p className="qp-product-desc">
                          <span className="qp-product-desc-label">
                            Observações:{" "}
                          </span>
                          {line.client_notes.trim()}
                        </p>
                      ) : null}
                    </td>
                    <td className="qp-qty">
                      <span className="qp-qty-num">
                        {Number(line.quantity)}
                      </span>
                      {line.unit?.trim() ? (
                        <span className="qp-qty-unit">
                          {line.unit.trim()}
                        </span>
                      ) : null}
                    </td>
                    <td className="qp-num">
                      {fmtQuoteBRL(Number(line.unit_price))}
                      {line.markup_percent != null ? (
                        <span className="qp-markup-hint">
                          ({Number(line.markup_percent)}% markup)
                        </span>
                      ) : null}
                    </td>
                    <td className="qp-num qp-line-total">
                      {fmtQuoteBRL(Number(line.total_price))}
                    </td>
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "0.75rem" }}>
                    Sem itens neste orçamento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="qp-bottom-row">
          <dl className="qp-totals-inner">
            <div className="qp-totals-row">
              <dt>Subtotal</dt>
              <dd>{fmtQuoteBRL(quote.subtotal)}</dd>
            </div>
            {quote.discount > 0 ? (
              <div className="qp-totals-row">
                <dt>Desconto</dt>
                <dd>− {fmtQuoteBRL(quote.discount)}</dd>
              </div>
            ) : null}
            <div className="qp-totals-row">
              <dt>Impostos</dt>
              <dd>{fmtQuoteBRL(quote.tax)}</dd>
            </div>
            {quote.shipping_type === "CIF" &&
            Number(quote.freight_cost ?? 0) > 0 ? (
              <div className="qp-totals-row">
                <dt>Frete (CIF)</dt>
                <dd>{fmtQuoteBRL(Number(quote.freight_cost))}</dd>
              </div>
            ) : null}
            <div className="qp-totals-row qp-totals-row--grand">
              <dt>Total</dt>
              <dd>{fmtQuoteBRL(quote.total)}</dd>
            </div>
          </dl>
        </div>

        {quote.notes?.trim() ? (
          <section className="qp-notes">
            <strong>Observações: </strong>
            {quote.notes.trim()}
          </section>
        ) : null}

        <footer className="qp-screen-footer">
          <p>
            Este orçamento é válido até {fmtQuoteDay(quote.valid_until)}, salvo
            alteração das condições de mercado ou disponibilidade de estoque.
          </p>
        </footer>

        <footer className="quote-print-fixed-footer print:block hidden">
          <p>
            Válido até {fmtQuoteDay(quote.valid_until)} · {quote.quote_number}
          </p>
        </footer>
      </article>
    </>
  );
}
