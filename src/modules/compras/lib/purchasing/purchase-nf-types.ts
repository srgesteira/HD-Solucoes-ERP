/**
 * Contrato partilhado: extração de NF-e de compra (PDF/IA ou XML determinístico).
 */

export type PurchaseNFItem = {
  lineNumber?: number;
  productCode?: string;
  description: string;
  quantity: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
  icmsValue?: number;
  ipiValue?: number;
  ncm?: string;
};

export type PurchaseNFExtraction = {
  supplierName?: string;
  /** CNPJ/CPF do emitente (fornecedor) */
  supplierDocument?: string;
  invoiceNumber?: string;
  invoiceSeries?: string;
  /** Chave de acesso NF-e (44 dígitos) */
  accessKey?: string;
  /** AAAA-MM-DD */
  issueDate?: string;
  totalAmount?: number;
  items: PurchaseNFItem[];
};

function parseOptionalNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Normaliza e filtra linhas inválidas (sem descrição ou qty ≤ 0). */
export function normalizePurchaseNFJson(
  raw: PurchaseNFExtraction
): PurchaseNFExtraction {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const normalized = items
    .map((it, idx) => {
      const description =
        typeof it.description === "string" ? it.description.trim() : "";
      const q = Number(it.quantity);
      const quantity = Number.isFinite(q) && q > 0 ? q : 0;
      const unit =
        typeof it.unit === "string" && it.unit.trim()
          ? it.unit.trim().slice(0, 16)
          : undefined;
      const lineNumber =
        it.lineNumber !== undefined && it.lineNumber !== null
          ? Number(it.lineNumber)
          : idx + 1;
      return {
        lineNumber: Number.isFinite(lineNumber) ? lineNumber : idx + 1,
        productCode:
          typeof it.productCode === "string"
            ? it.productCode.trim().slice(0, 64)
            : undefined,
        description,
        quantity,
        unit,
        unitPrice: parseOptionalNumber(it.unitPrice),
        totalPrice: parseOptionalNumber(it.totalPrice),
        icmsValue: parseOptionalNumber(it.icmsValue),
        ipiValue: parseOptionalNumber(it.ipiValue),
        ncm:
          typeof it.ncm === "string" ? it.ncm.trim().slice(0, 16) : undefined,
      };
    })
    .filter((it) => it.description.length > 0 && it.quantity > 0);

  let issueDate =
    typeof raw.issueDate === "string" ? raw.issueDate.trim().slice(0, 10) : "";
  if (issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    const d = new Date(issueDate);
    if (!Number.isNaN(d.getTime())) {
      issueDate = d.toISOString().slice(0, 10);
    } else {
      issueDate = "";
    }
  }

  return {
    supplierName:
      typeof raw.supplierName === "string"
        ? raw.supplierName.trim()
        : undefined,
    supplierDocument:
      typeof raw.supplierDocument === "string"
        ? raw.supplierDocument.trim()
        : undefined,
    invoiceNumber:
      typeof raw.invoiceNumber === "string"
        ? raw.invoiceNumber.trim()
        : undefined,
    invoiceSeries:
      typeof raw.invoiceSeries === "string"
        ? raw.invoiceSeries.trim()
        : undefined,
    accessKey:
      typeof raw.accessKey === "string"
        ? raw.accessKey.replace(/\D/g, "").slice(0, 44)
        : undefined,
    issueDate: issueDate || undefined,
    totalAmount: parseOptionalNumber(raw.totalAmount),
    items: normalized,
  };
}
