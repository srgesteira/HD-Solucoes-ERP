import { XMLParser } from "fast-xml-parser";
import {
  normalizePurchaseNFJson,
  type PurchaseNFExtraction,
  type PurchaseNFItem,
} from "@/modules/compras/lib/purchasing/purchase-nf-types";

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v).trim();
  }
  if (typeof v === "object" && v !== null && "#text" in v) {
    return String((v as { "#text": unknown })["#text"] ?? "").trim();
  }
  return "";
}

function numOf(v: unknown): number | undefined {
  const s = textOf(v).replace(",", ".");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function deepFindNumber(obj: unknown, keys: string[]): number | undefined {
  if (obj == null || typeof obj !== "object") return undefined;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    if (key in record) {
      const n = numOf(record[key]);
      if (n !== undefined) return n;
    }
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === "object") {
      const n = deepFindNumber(child, keys);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

function findInfNFe(root: Record<string, unknown>): Record<string, unknown> | null {
  const nfeProc = (root.nfeProc ?? root.NfeProc) as
    | Record<string, unknown>
    | undefined;
  const nfe =
    (nfeProc?.NFe as Record<string, unknown> | undefined) ??
    (root.NFe as Record<string, unknown> | undefined) ??
    (root.nfe as Record<string, unknown> | undefined);
  if (!nfe || typeof nfe !== "object") return null;
  const inf =
    (nfe.infNFe as Record<string, unknown> | undefined) ??
    (nfe.infNfe as Record<string, unknown> | undefined);
  if (!inf || typeof inf !== "object") return null;
  return inf;
}

function findAccessKey(
  root: Record<string, unknown>,
  inf: Record<string, unknown>
): string | undefined {
  const idAttr = textOf(inf["@_Id"] ?? inf["@_id"]);
  if (idAttr) {
    const digits = idAttr.replace(/\D/g, "");
    if (digits.length >= 44) return digits.slice(-44);
  }
  const nfeProc = (root.nfeProc ?? root.NfeProc) as
    | Record<string, unknown>
    | undefined;
  const prot =
    (nfeProc?.protNFe as Record<string, unknown> | undefined) ??
    (root.protNFe as Record<string, unknown> | undefined);
  const infProt = prot?.infProt as Record<string, unknown> | undefined;
  const ch = textOf(infProt?.chNFe);
  if (ch) return ch.replace(/\D/g, "").slice(0, 44);
  return undefined;
}

function mapDetToItem(det: Record<string, unknown>, index: number): PurchaseNFItem {
  const prod = (det.prod ?? {}) as Record<string, unknown>;
  const imposto = det.imposto as Record<string, unknown> | undefined;
  const nItem = textOf(det["@_nItem"] ?? det["@_nitem"]);
  const lineNumber = nItem ? Number(nItem) : index + 1;

  return {
    lineNumber: Number.isFinite(lineNumber) ? lineNumber : index + 1,
    productCode: textOf(prod.cProd) || undefined,
    description: textOf(prod.xProd),
    quantity: numOf(prod.qCom) ?? numOf(prod.qTrib) ?? 0,
    unit: textOf(prod.uCom) || textOf(prod.uTrib) || undefined,
    unitPrice: numOf(prod.vUnCom) ?? numOf(prod.vUnTrib),
    totalPrice: numOf(prod.vProd),
    ncm: textOf(prod.NCM) || undefined,
    icmsValue: imposto ? deepFindNumber(imposto, ["vICMS"]) : undefined,
    ipiValue: imposto ? deepFindNumber(imposto, ["vIPI"]) : undefined,
  };
}

/**
 * Parser determinístico de XML NF-e (modelo 55) → PurchaseNFExtraction.
 * Aceita nfeProc ou NFe solta; remove prefixos de namespace.
 */
export function parsePurchaseNfeXml(xmlBuffer: Buffer): PurchaseNFExtraction {
  const xml = xmlBuffer.toString("utf8").replace(/^\uFEFF/, "").trim();
  if (!xml) throw new Error("XML vazio.");
  if (!xml.includes("<") || !/nfe|NFe|infNFe/i.test(xml)) {
    throw new Error("Ficheiro não parece XML de NF-e.");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    trimValues: true,
    parseTagValue: false,
  });

  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch (e) {
    throw new Error(
      e instanceof Error ? `XML inválido: ${e.message}` : "XML inválido."
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Não foi possível interpretar o XML da NF-e.");
  }

  const root = parsed as Record<string, unknown>;
  const inf = findInfNFe(root);
  if (!inf) {
    throw new Error(
      "XML sem infNFe — envie o XML completo da NF-e (nfeProc ou NFe)."
    );
  }

  const ide = (inf.ide ?? {}) as Record<string, unknown>;
  const emit = (inf.emit ?? {}) as Record<string, unknown>;
  const total = (inf.total ?? {}) as Record<string, unknown>;
  const icmsTot = (total.ICMSTot ?? total.icmsTot ?? {}) as Record<
    string,
    unknown
  >;

  const dhEmi = textOf(ide.dhEmi) || textOf(ide.dEmi);
  let issueDate: string | undefined;
  if (dhEmi) {
    const m = dhEmi.match(/^(\d{4}-\d{2}-\d{2})/);
    issueDate = m?.[1];
  }

  const dets = asArray(
    inf.det as Record<string, unknown> | Record<string, unknown>[] | undefined
  );
  const items = dets.map((det, i) =>
    mapDetToItem(det as Record<string, unknown>, i)
  );

  const raw: PurchaseNFExtraction = {
    supplierName: textOf(emit.xNome) || textOf(emit.xFant) || undefined,
    supplierDocument:
      textOf(emit.CNPJ) || textOf(emit.CPF) || undefined,
    invoiceNumber: textOf(ide.nNF) || undefined,
    invoiceSeries: textOf(ide.serie) || undefined,
    accessKey: findAccessKey(root, inf),
    issueDate,
    totalAmount: numOf(icmsTot.vNF) ?? numOf(icmsTot.vProd),
    items,
  };

  const out = normalizePurchaseNFJson(raw);
  if (!out.items.length) {
    throw new Error(
      "XML sem itens de produto válidos (det/prod com descrição e quantidade)."
    );
  }
  return out;
}

export function isLikelyNfeXml(fileName: string, mime: string, buf: Buffer): boolean {
  const name = fileName.toLowerCase();
  const mimeL = mime.toLowerCase();
  if (name.endsWith(".xml")) return true;
  if (
    mimeL.includes("xml") ||
    mimeL === "text/xml" ||
    mimeL === "application/xml"
  ) {
    return true;
  }
  // Alguns browsers mandam octet-stream; peek no conteúdo
  const head = buf.subarray(0, 200).toString("utf8");
  return /<\?xml|<(nfeProc|NFe|infNFe)\b/i.test(head);
}

export function isLikelyPdf(fileName: string, mime: string, buf: Buffer): boolean {
  const name = fileName.toLowerCase();
  const mimeL = mime.toLowerCase();
  if (name.endsWith(".pdf") || mimeL === "application/pdf") return true;
  return buf.subarray(0, 5).toString("utf8") === "%PDF-";
}
