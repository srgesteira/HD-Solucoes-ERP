"use client";

import { cn } from "@/shared/utils/cn";
import type { FiscalOrderReview } from "@/modules/faturamento/lib/fiscal-order-review-service";
import {
  ITEM_USAGE_TYPE_OPTIONS,
  type ItemUsageType,
} from "@/modules/fiscal/lib/item-usage-type";
import {
  INVOICE_DOCUMENT_TYPE_LABELS,
  isInvoiceDocumentType,
} from "@/modules/core/types/sales-order-billing.types";
import {
  PRODUCT_NATURE_LABELS,
  type ProductNatureCode,
} from "@/modules/engenharia/lib/products/mrp-product-nature";
import {
  companyDisplayName,
  formatCompanyAddressForPrint,
  type CompanySettingsRow,
} from "@/modules/vendas/lib/sales/sales-order-print-display";
import { fmtBRL } from "@/shared/utils/format-brl";
import { formatShortDate } from "@/shared/utils/date";

const PRINT_STYLES = `
@media print {
  @page { size: A4 landscape; margin: 8mm 8mm 12mm 8mm; }
  body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .so-print-toolbar, .fiscal-print-toolbar, .print\\:hidden { display: none !important; }
  .fiscal-print-document { box-shadow: none !important; padding: 0 !important; max-width: none !important; }
  .fiscal-print-table thead { background: #1e293b !important; color: #fff !important; }
}
.fiscal-print-document {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 8.5pt; line-height: 1.25; color: #0f172a;
}
.fp-header { padding-bottom: 0.4rem; border-bottom: 1.5px solid #1e293b; margin-bottom: 0.45rem; }
.fp-header-top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.fp-logo { max-height: 64px; max-width: 180px; object-fit: contain; }
.fp-header-company { flex: 1; text-align: right; }
.fp-company-meta { font-size: 0.65rem; color: #475569; margin: 0.08rem 0; }
.fp-header-doc { margin-top: 0.35rem; padding-top: 0.3rem; text-align: center; border-top: 1px solid #e2e8f0; }
.fp-doc-title { margin: 0; font-size: 0.95rem; font-weight: 800; letter-spacing: 0.06em; color: #1e293b; text-transform: uppercase; }
.fp-doc-sub { font-size: 0.72rem; color: #64748b; margin: 0.12rem 0 0; }
.fp-info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; margin-bottom: 0.4rem; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
.fp-info-col { padding: 0.35rem 0.5rem; }
.fp-info-col + .fp-info-col { border-left: 1px solid #e2e8f0; }
.fp-info-col h3 { font-size: 0.55rem; font-weight: 700; text-transform: uppercase; color: #64748b; margin: 0 0 0.2rem; }
.fp-info-row { display: flex; justify-content: space-between; font-size: 0.68rem; margin-bottom: 0.12rem; gap: 0.4rem; }
.fp-info-row dt { color: #64748b; flex-shrink: 0; }
.fp-info-row dd { margin: 0; font-weight: 600; text-align: right; }
.fp-table-wrap { margin: 0.35rem 0; border: 1px solid #e2e8f0; border-radius: 5px; overflow: hidden; }
.fiscal-print-table { width: 100%; border-collapse: collapse; font-size: 0.62rem; }
.fiscal-print-table thead { background: #1e293b; color: #fff; }
.fiscal-print-table thead th { padding: 0.25rem 0.28rem; font-weight: 600; text-align: left; white-space: nowrap; }
.fiscal-print-table thead th.fp-num { text-align: right; }
.fiscal-print-table tbody td { padding: 0.22rem 0.28rem; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.fiscal-print-table tbody td.fp-num { text-align: right; font-variant-numeric: tabular-nums; }
.fp-item-name { font-weight: 600; }
.fp-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.fp-bottom-row { display: flex; justify-content: space-between; gap: 1rem; margin-top: 0.35rem; align-items: flex-start; }
.fp-totals-inner { min-width: 220px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
.fp-totals-row { display: flex; justify-content: space-between; padding: 0.25rem 0.5rem; font-size: 0.68rem; border-bottom: 1px solid #f1f5f9; }
.fp-totals-row dd { margin: 0; font-weight: 600; }
.fp-totals-row--grand { background: #f8fafc; font-weight: 800; }
.fp-notes { flex: 1; font-size: 0.68rem; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.35rem 0.5rem; }
.fp-notes h4 { margin: 0 0 0.15rem; font-size: 0.55rem; text-transform: uppercase; color: #64748b; }
.fp-warn { margin-top: 0.35rem; font-size: 0.65rem; color: #92400e; border: 1px solid #fde68a; background: #fffbeb; border-radius: 6px; padding: 0.35rem 0.5rem; }
`;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

function usageLabel(usage: ItemUsageType | null): string {
  if (!usage) return "—";
  return (
    ITEM_USAGE_TYPE_OPTIONS.find((o) => o.value === usage)?.label ?? usage
  );
}

function natureLabel(nature: string | null): string {
  if (!nature) return "—";
  const code = nature.trim().toUpperCase() as ProductNatureCode;
  return PRODUCT_NATURE_LABELS[code] ?? nature;
}

function invoiceTypeLabel(raw: string | null): string {
  if (!raw) return "—";
  if (isInvoiceDocumentType(raw)) return INVOICE_DOCUMENT_TYPE_LABELS[raw];
  return raw;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value}%`;
}

function fmtMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return fmtBRL(value);
}

type Props = {
  review: FiscalOrderReview;
  company: CompanySettingsRow | null;
  className?: string;
};

export function FiscalOrderPrintDocument({
  review,
  company,
  className,
}: Props) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <article className={cn("fiscal-print-document", className)}>
        <header className="fp-header">
          <div className="fp-header-top">
            <div>
              {company?.logo_url?.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.logo_url.trim()}
                  alt=""
                  className="fp-logo"
                />
              ) : null}
            </div>
            <div className="fp-header-company">
              {company ? (
                <>
                  <p className="font-bold text-sm text-slate-900">
                    {companyDisplayName(company)}
                  </p>
                  {company.cnpj?.trim() ? (
                    <p className="fp-company-meta">
                      CNPJ: {company.cnpj.trim()}
                    </p>
                  ) : null}
                  {formatCompanyAddressForPrint(company) ? (
                    <p className="fp-company-meta">
                      {formatCompanyAddressForPrint(company)}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <div className="fp-header-doc">
            <h1 className="fp-doc-title">Conferência fiscal — Pedido de venda</h1>
            <p className="fp-doc-sub">
              N.º {review.order_number} · {review.fiscal_status_label}
              {review.invoice_document_type
                ? ` · ${invoiceTypeLabel(review.invoice_document_type)}`
                : ""}
            </p>
          </div>
        </header>

        <div className="fp-info-grid">
          <div className="fp-info-col">
            <h3>Cliente e destino</h3>
            <dl>
              <div className="fp-info-row">
                <dt>Nome</dt>
                <dd>{review.client_name?.trim() || "—"}</dd>
              </div>
              {review.client_document?.trim() ? (
                <div className="fp-info-row">
                  <dt>CNPJ/CPF</dt>
                  <dd>{review.client_document.trim()}</dd>
                </div>
              ) : null}
              <div className="fp-info-row">
                <dt>UF destino</dt>
                <dd>{review.destination_uf ?? "—"}</dd>
              </div>
              <div className="fp-info-row">
                <dt>UF origem</dt>
                <dd>{review.origin_uf ?? "—"}</dd>
              </div>
              {review.customer_po_number?.trim() ? (
                <div className="fp-info-row">
                  <dt>Ped. compra</dt>
                  <dd className="max-w-[11rem]">{review.customer_po_number.trim()}</dd>
                </div>
              ) : null}
            </dl>
            {review.client_address?.trim() ? (
              <p className="text-[0.62rem] text-slate-600 mt-1 whitespace-pre-wrap">
                {review.client_address.trim()}
              </p>
            ) : null}
          </div>
          <div className="fp-info-col">
            <h3>Operação fiscal</h3>
            <dl>
              <div className="fp-info-row">
                <dt>Regime</dt>
                <dd>{review.tax_regime ?? "—"}</dd>
              </div>
              <div className="fp-info-row">
                <dt>Tipo de nota</dt>
                <dd>{invoiceTypeLabel(review.invoice_document_type)}</dd>
              </div>
              <div className="fp-info-row">
                <dt>Estado fiscal</dt>
                <dd>{review.fiscal_status_label}</dd>
              </div>
              <div className="fp-info-row">
                <dt>Alinhado</dt>
                <dd>{review.fiscal_configured ? "Sim" : "Não"}</dd>
              </div>
            </dl>
          </div>
          <div className="fp-info-col">
            <h3>Pedido</h3>
            <dl>
              <div className="fp-info-row">
                <dt>Data</dt>
                <dd>{fmtDate(review.order_date)}</dd>
              </div>
              <div className="fp-info-row">
                <dt>Total</dt>
                <dd>{fmtBRL(Number(review.total))}</dd>
              </div>
              <div className="fp-info-row">
                <dt>Base cálculo</dt>
                <dd>{fmtBRL(Number(review.total_tax_base))}</dd>
              </div>
              <div className="fp-info-row">
                <dt>Total ICMS</dt>
                <dd>{fmtBRL(Number(review.total_icms))}</dd>
              </div>
              <div className="fp-info-row">
                <dt>Total IPI</dt>
                <dd>{fmtBRL(Number(review.total_ipi))}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="fp-table-wrap">
          <table className="fiscal-print-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Produto</th>
                <th>NCM</th>
                <th>Natureza</th>
                <th>Utilização</th>
                <th>CFOP</th>
                <th>Regra</th>
                <th className="fp-num">Qtd.</th>
                <th className="fp-num">Total</th>
                <th className="fp-num">Base</th>
                <th className="fp-num">ICMS %</th>
                <th className="fp-num">ICMS R$</th>
                <th className="fp-num">IPI %</th>
                <th className="fp-num">IPI R$</th>
                <th className="fp-num">PIS %</th>
                <th className="fp-num">COFINS %</th>
              </tr>
            </thead>
            <tbody>
              {review.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.line_number}</td>
                  <td>
                    <div className="fp-item-name">
                      {item.product_name?.trim() ||
                        item.description?.trim() ||
                        "—"}
                    </div>
                    {item.description?.trim() &&
                    item.product_name?.trim() &&
                    item.description.trim() !== item.product_name.trim() ? (
                      <div className="text-slate-500 text-[0.58rem]">
                        {item.description.trim()}
                      </div>
                    ) : null}
                  </td>
                  <td className="fp-mono">{item.ncm?.trim() || "—"}</td>
                  <td>{natureLabel(item.product_nature)}</td>
                  <td>{usageLabel(item.usage_type)}</td>
                  <td className="fp-mono font-semibold">
                    {item.cfop?.trim() || "—"}
                  </td>
                  <td>{item.fiscal_rule_name?.trim() || item.fiscal_source_label}</td>
                  <td className="fp-num">
                    {Number(item.quantity)}
                    {item.unit?.trim() ? ` ${item.unit.trim()}` : ""}
                  </td>
                  <td className="fp-num">{fmtMoney(item.total_price)}</td>
                  <td className="fp-num">{fmtMoney(item.tax_base)}</td>
                  <td className="fp-num">{fmtPct(item.icms_rate)}</td>
                  <td className="fp-num">{fmtMoney(item.icms_value)}</td>
                  <td className="fp-num">{fmtPct(item.ipi_rate)}</td>
                  <td className="fp-num">{fmtMoney(item.ipi_value)}</td>
                  <td className="fp-num">{fmtPct(item.pis_rate)}</td>
                  <td className="fp-num">{fmtPct(item.cofins_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="fp-bottom-row">
          <div className="fp-notes">
            <h4>Observações / informações da NF</h4>
            <dl className="m-0">
              <div className="fp-info-row">
                <dt>Pedido HD</dt>
                <dd>{review.order_number}</dd>
              </div>
              <div className="fp-info-row">
                <dt>Pedido de compra do cliente</dt>
                <dd>
                  {review.customer_po_number?.trim() || "—"}
                </dd>
              </div>
            </dl>
            {review.customer_po_number?.trim() || review.notes?.trim() ? (
              <p className="whitespace-pre-wrap m-0 mt-2 text-[0.65rem] text-slate-700">
                {[
                  `Pedido HD ${review.order_number}`,
                  review.customer_po_number?.trim()
                    ? `Pedido compra cliente ${review.customer_po_number.trim()}`
                    : null,
                  review.notes?.trim() || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : (
              <p className="m-0 mt-2 text-[0.65rem] text-slate-500">
                Sem pedido de compra do cliente nem observações no pedido.
              </p>
            )}
            {review.notes?.trim() ? (
              <>
                <h4 className="mt-2">Observações do pedido</h4>
                <p className="whitespace-pre-wrap m-0">{review.notes.trim()}</p>
              </>
            ) : null}
            {review.warnings.length > 0 ? (
              <>
                <h4 className="mt-2">Avisos da conferência</h4>
                <ul className="m-0 pl-4">
                  {review.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
          <dl className="fp-totals-inner">
            <div className="fp-totals-row">
              <dt>Base de cálculo</dt>
              <dd>{fmtBRL(Number(review.total_tax_base))}</dd>
            </div>
            <div className="fp-totals-row">
              <dt>Total ICMS</dt>
              <dd>{fmtBRL(Number(review.total_icms))}</dd>
            </div>
            <div className="fp-totals-row">
              <dt>Total IPI</dt>
              <dd>{fmtBRL(Number(review.total_ipi))}</dd>
            </div>
            <div className="fp-totals-row fp-totals-row--grand">
              <dt>Total do pedido</dt>
              <dd>{fmtBRL(Number(review.total))}</dd>
            </div>
          </dl>
        </div>
      </article>
    </>
  );
}
