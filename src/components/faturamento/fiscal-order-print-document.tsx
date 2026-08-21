"use client";

import { cn } from "@/shared/utils/cn";
import type { FiscalOrderReview } from "@/modules/faturamento/lib/fiscal-order-review-service";
import {
  companyDisplayName,
  formatCompanyAddressForPrint,
  type CompanySettingsRow,
} from "@/modules/vendas/lib/sales/sales-order-print-display";
import { fmtBRL } from "@/shared/utils/format-brl";
import { formatShortDate } from "@/shared/utils/date";
import { isInvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";
import { INVOICE_DOCUMENT_TYPE_LABELS } from "@/modules/core/types/sales-order-billing.types";
import { buildBlingNfePayloadView } from "@/modules/fiscal/lib/bling/bling-nfe-payload";
import { CreateBlingProductButton } from "@/components/faturamento/create-bling-product-button";
import { UnmappedBlingProductsPanel } from "@/components/faturamento/unmapped-bling-products-panel";

const PRINT_STYLES = `
@media print {
  @page { size: A4 portrait; margin: 6mm; }
  body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .so-print-toolbar, .fiscal-print-toolbar, .print\\:hidden { display: none !important; }
  .fiscal-print-document { box-shadow: none !important; padding: 0 !important; max-width: none !important; }
}
.fiscal-print-document {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 7.5pt;
  line-height: 1.2;
  color: #111;
}
.danfe { width: 100%; border-collapse: collapse; }
.danfe, .danfe td, .danfe th { border: 1px solid #111; }
.danfe td, .danfe th { padding: 2px 4px; vertical-align: top; }
.danfe .lbl {
  display: block;
  font-size: 5.5pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #333;
  margin: 0 0 1px;
}
.danfe .val { font-size: 8pt; font-weight: 600; }
.danfe .val-sm { font-size: 7pt; }
.danfe .center { text-align: center; }
.danfe .right { text-align: right; font-variant-numeric: tabular-nums; }
.danfe .muted { font-weight: 400; color: #333; }
.danfe-title { font-size: 11pt; font-weight: 800; letter-spacing: 0.12em; margin: 0; }
.danfe-sub { font-size: 6.5pt; margin: 2px 0 0; }
.danfe-logo { max-height: 52px; max-width: 140px; object-fit: contain; }
.danfe-items { width: 100%; border-collapse: collapse; font-size: 6.5pt; }
.danfe-items th, .danfe-items td { border: 1px solid #111; padding: 2px 3px; }
.danfe-items thead th {
  font-size: 5.5pt;
  text-transform: uppercase;
  background: #f1f5f9;
  font-weight: 700;
}
.danfe-items .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.danfe-banner {
  border: 1px solid #ca8a04;
  background: #fffbeb;
  color: #854d0e;
  padding: 6px 8px;
  font-size: 7.5pt;
  margin-bottom: 6px;
}
.danfe-warn { color: #9a3412; font-size: 7pt; }
`;

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0,00";
  return fmtBRL(value).replace("R$", "").trim();
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? String(iso).slice(0, 10) : formatted;
}

function invoiceTypeLabel(raw: string | null): string {
  if (!raw) return "NF-e";
  if (isInvoiceDocumentType(raw)) return INVOICE_DOCUMENT_TYPE_LABELS[raw];
  return raw;
}

function isBlingProductNfe(type: string | null): boolean {
  return type === "nfe_product" || type === "nfe_industrialization";
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
  const payload = buildBlingNfePayloadView(review);
  const nfeNum = review.nfe?.nfe_number?.trim() || "—";
  const serie = "—";
  const emitente = company ? companyDisplayName(company) : "—";
  const emitAddr = company ? formatCompanyAddressForPrint(company) : null;
  const productsTotal = payload.itens.reduce((acc, it) => {
    return acc + Math.max(0, it.quantidade * it.valor - (it.desconto ?? 0));
  }, 0);
  const pis = review.items.reduce((s, it) => s + Number(it.pis_value ?? 0), 0);
  const cofins = review.items.reduce(
    (s, it) => s + Number(it.cofins_value ?? 0),
    0
  );
  const showBlingActions = isBlingProductNfe(review.invoice_document_type);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <article className={cn("fiscal-print-document", className)}>
        <div className="danfe-banner print:hidden">
          Pré-visualização no estilo DANFE — não é a NF-e autorizada. A nota
          oficial sai do pedido de venda já preparado no Bling (cliente,
          produtos com NCM e natureza/CFOP).
        </div>

        <UnmappedBlingProductsPanel
          orderId={review.id}
          invoiceDocumentType={review.invoice_document_type}
          items={review.items}
          className="mb-2"
        />

        <table className="danfe">
          <tbody>
            <tr>
              <td rowSpan={3} style={{ width: "46%" }}>
                {company?.logo_url?.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={company.logo_url.trim()}
                    alt=""
                    className="danfe-logo"
                  />
                ) : null}
                <div className="val">{emitente}</div>
                {emitAddr ? (
                  <div className="val-sm muted">{emitAddr}</div>
                ) : null}
                <div className="val-sm muted">
                  CNPJ: {company?.cnpj?.trim() || "—"}
                  {company?.state_registration?.trim()
                    ? ` · IE: ${company.state_registration.trim()}`
                    : ""}
                </div>
                {company?.phone?.trim() ? (
                  <div className="val-sm muted">Tel: {company.phone.trim()}</div>
                ) : null}
              </td>
              <td className="center" style={{ width: "24%" }}>
                <p className="danfe-title">DANFE</p>
                <p className="danfe-sub">
                  Documento Auxiliar da Nota Fiscal Eletrônica
                </p>
                <p className="danfe-sub">
                  0 — Entrada &nbsp;&nbsp; 1 — Saída
                  <br />
                  <strong>1</strong>
                </p>
                <p className="danfe-sub">Folha 1/1</p>
              </td>
              <td className="center" style={{ width: "30%" }}>
                <span className="lbl">NF-e</span>
                <div className="val">N.º {nfeNum}</div>
                <div className="val-sm muted">Série {serie}</div>
                <div className="val-sm muted">
                  {invoiceTypeLabel(review.invoice_document_type)}
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <span className="lbl">Chave de acesso</span>
                <div className="val-sm muted">
                  {review.nfe?.nfe_key?.trim() ||
                    "Pré-visualização — chave após autorização SEFAZ"}
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <span className="lbl">Protocolo de autorização</span>
                <div className="val-sm muted">
                  {review.nfe?.status === "authorized"
                    ? review.nfe.status
                    : "Ainda não emitida"}
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <span className="lbl">Natureza da operação</span>
                <div className="val">{payload.naturezaOperacao}</div>
              </td>
              <td>
                <span className="lbl">Data da emissão / operação</span>
                <div className="val">{fmtDate(payload.data)}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="danfe" style={{ marginTop: "-1px" }}>
          <tbody>
            <tr>
              <td colSpan={6}>
                <span className="lbl">Destinatário / remetente</span>
              </td>
            </tr>
            <tr>
              <td colSpan={3}>
                <span className="lbl">Nome / razão social</span>
                <div className="val">{review.client_name?.trim() || "—"}</div>
              </td>
              <td colSpan={2}>
                <span className="lbl">CNPJ / CPF</span>
                <div className="val">
                  {review.client_document?.trim() || "—"}
                </div>
              </td>
              <td>
                <span className="lbl">Data saída</span>
                <div className="val">
                  {fmtDate(review.actual_delivery || review.expected_delivery)}
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={4}>
                <span className="lbl">Endereço de faturamento</span>
                <div className="val-sm">
                  {review.client_address?.trim() || "—"}
                </div>
              </td>
              <td>
                <span className="lbl">UF</span>
                <div className="val">{review.destination_uf ?? "—"}</div>
              </td>
              <td>
                <span className="lbl">Fone / e-mail</span>
                <div className="val-sm">
                  {[review.client_phone, review.client_email]
                    .filter((v) => v?.trim())
                    .join(" · ") || "—"}
                </div>
              </td>
            </tr>
            {review.delivery_address_formatted ? (
              <tr>
                <td colSpan={6}>
                  <span className="lbl">Local de entrega (observações da NF)</span>
                  <div className="val">{review.delivery_address_formatted}</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <table className="danfe" style={{ marginTop: "-1px" }}>
          <tbody>
            <tr>
              <td colSpan={4}>
                <span className="lbl">Fatura / duplicata</span>
                <div className="val-sm muted">
                  Campo estruturado <code>parcelas</code> do POST /nfe
                </div>
              </td>
            </tr>
            <tr>
              {payload.parcelas.length ? (
                payload.parcelas.map((p, i) => (
                  <td key={`${p.data}-${i}`}>
                    <span className="lbl">
                      {payload.parcelas.length > 1
                        ? `Duplicata ${i + 1}/${payload.parcelas.length}`
                        : "Duplicata"}
                    </span>
                    <div className="val">{fmtDate(p.data)}</div>
                    <div className="val">{fmtBRL(p.valor)}</div>
                    {p.observacoes ? (
                      <div className="val-sm muted">{p.observacoes}</div>
                    ) : null}
                  </td>
                ))
              ) : (
                <td>—</td>
              )}
              {payload.parcelas.length < 4
                ? Array.from({ length: 4 - payload.parcelas.length }).map(
                    (_, i) => <td key={`empty-${i}`} />
                  )
                : null}
            </tr>
          </tbody>
        </table>

        <table className="danfe" style={{ marginTop: "-1px" }}>
          <tbody>
            <tr>
              <td colSpan={6}>
                <span className="lbl">Cálculo do imposto</span>
                <div className="val-sm muted">
                  Totais da conferência no ERP (alíquotas do pedido). CSOSN no
                  DANFE autorizado sai do produto no Bling.
                </div>
              </td>
            </tr>
            <tr>
              <td>
                <span className="lbl">Base ICMS</span>
                <div className="val right">{money(review.total_tax_base)}</div>
              </td>
              <td>
                <span className="lbl">Valor ICMS</span>
                <div className="val right">{money(review.total_icms)}</div>
              </td>
              <td>
                <span className="lbl">Valor IPI</span>
                <div className="val right">{money(review.total_ipi)}</div>
              </td>
              <td>
                <span className="lbl">PIS</span>
                <div className="val right">{money(pis)}</div>
              </td>
              <td>
                <span className="lbl">COFINS</span>
                <div className="val right">{money(cofins)}</div>
              </td>
              <td>
                <span className="lbl">Valor produtos</span>
                <div className="val right">{money(productsTotal)}</div>
              </td>
            </tr>
            <tr>
              <td>
                <span className="lbl">Frete</span>
                <div className="val right">0,00</div>
              </td>
              <td>
                <span className="lbl">Seguro</span>
                <div className="val right">0,00</div>
              </td>
              <td>
                <span className="lbl">Desconto</span>
                <div className="val right">{money(payload.desconto ?? 0)}</div>
              </td>
              <td>
                <span className="lbl">Outras despesas</span>
                <div className="val right">0,00</div>
              </td>
              <td colSpan={2}>
                <span className="lbl">Valor total da nota</span>
                <div className="val right">{fmtBRL(review.total)}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="danfe" style={{ marginTop: "-1px" }}>
          <tbody>
            <tr>
              <td colSpan={5}>
                <span className="lbl">Transportador / volumes</span>
                <div className="val-sm muted">
                  Não enviado no POST /nfe (sem grupo transporte).
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <span className="lbl">Razão social</span>
                <div className="val muted">—</div>
              </td>
              <td>
                <span className="lbl">Frete por conta</span>
                <div className="val muted">—</div>
              </td>
              <td>
                <span className="lbl">ANTT / placa</span>
                <div className="val muted">—</div>
              </td>
              <td>
                <span className="lbl">CNPJ / CPF</span>
                <div className="val muted">—</div>
              </td>
            </tr>
            <tr>
              <td>
                <span className="lbl">Quantidade</span>
                <div className="val muted">—</div>
              </td>
              <td>
                <span className="lbl">Espécie</span>
                <div className="val muted">—</div>
              </td>
              <td>
                <span className="lbl">Marca</span>
                <div className="val muted">—</div>
              </td>
              <td>
                <span className="lbl">Numeração</span>
                <div className="val muted">—</div>
              </td>
              <td>
                <span className="lbl">Peso líq. / bruto</span>
                <div className="val muted">—</div>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="danfe-items" style={{ marginTop: "-1px" }}>
          <thead>
            <tr>
              <th>Cód.</th>
              <th>Descrição dos produtos / serviços</th>
              <th>NCM</th>
              <th>CST/CSOSN</th>
              <th>CFOP</th>
              <th>Un</th>
              <th className="num">Qtd</th>
              <th className="num">V. unit.</th>
              <th className="num">Desc.</th>
              <th className="num">V. total</th>
              <th className="num">BC ICMS</th>
              <th className="num">V. ICMS</th>
              <th className="num">V. IPI</th>
              <th className="num">Alíq. ICMS</th>
              <th className="num">Alíq. IPI</th>
            </tr>
          </thead>
          <tbody>
            {review.items.map((item, idx) => {
              const line = payload.itens[idx];
              const lineTotal = line
                ? Math.max(
                    0,
                    line.quantidade * line.valor - (line.desconto ?? 0)
                  )
                : Number(item.total_price ?? 0);
              const unmapped =
                showBlingActions && item.product_id && !item.bling_product_id;
              return (
                <tr key={item.id}>
                  <td>{line?.codigo || "—"}</td>
                  <td>
                    <div>{line?.descricao || "—"}</div>
                    {unmapped ? (
                      <div className="danfe-warn print:hidden">
                        Sem produto correspondente no Bling
                        {item.product_code ? ` (SKU ${item.product_code})` : ""}
                        <div className="mt-1">
                          <CreateBlingProductButton
                            orderId={review.id}
                            productId={item.product_id!}
                            sku={item.product_code}
                          />
                        </div>
                      </div>
                    ) : null}
                  </td>
                  <td>{item.ncm?.trim() || "—"}</td>
                  <td>—</td>
                  <td>{item.cfop?.trim() || "—"}</td>
                  <td>{line?.unidade || item.unit || "UN"}</td>
                  <td className="num">{line?.quantidade ?? item.quantity}</td>
                  <td className="num">{money(line?.valor ?? item.unit_price)}</td>
                  <td className="num">{money(line?.desconto ?? 0)}</td>
                  <td className="num">{money(lineTotal)}</td>
                  <td className="num">{money(item.tax_base)}</td>
                  <td className="num">{money(item.icms_value)}</td>
                  <td className="num">{money(item.ipi_value)}</td>
                  <td className="num">
                    {item.icms_rate != null ? `${item.icms_rate}%` : "—"}
                  </td>
                  <td className="num">
                    {item.ipi_rate != null ? `${item.ipi_rate}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <table className="danfe" style={{ marginTop: "-1px" }}>
          <tbody>
            <tr>
              <td style={{ width: "70%" }}>
                <span className="lbl">Dados adicionais — informações complementares</span>
                <div className="val-sm muted">
                  Campo <code>observacoes</code> do POST /nfe (infCpl)
                </div>
                <pre
                  className="val-sm"
                  style={{
                    whiteSpace: "pre-wrap",
                    margin: "4px 0 0",
                    fontFamily: "inherit",
                  }}
                >
                  {payload.observacoes || "—"}
                </pre>
              </td>
              <td>
                <span className="lbl">Reservado ao fisco</span>
                <div className="val-sm muted">—</div>
              </td>
            </tr>
          </tbody>
        </table>

        {review.notes?.trim() ? (
          <div className="print:hidden danfe-banner" style={{ marginTop: 8 }}>
            <strong>Observações do pedido (interno)</strong> — não entram na
            NF-e.
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
              {review.notes.trim()}
            </div>
          </div>
        ) : null}

        {review.warnings.length > 0 ? (
          <div className="print:hidden danfe-banner" style={{ marginTop: 8 }}>
            <strong>Avisos da conferência</strong>
            <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
              {review.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>
    </>
  );
}
