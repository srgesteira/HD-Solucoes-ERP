export const PRODUCT_DOCUMENT_BUCKET = "product-documents";

export const PRODUCT_DOCUMENT_KINDS = [
  "drawing",
  "manual",
  "work_instruction",
  "pop",
] as const;

export type ProductDocumentKind = (typeof PRODUCT_DOCUMENT_KINDS)[number];

export const PRODUCT_DOCUMENT_KIND_LABELS: Record<ProductDocumentKind, string> = {
  drawing: "Desenho",
  manual: "Manual",
  work_instruction: "Instrução de trabalho",
  pop: "POP",
};

export const PRODUCT_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
]);

export function isProductDocumentKind(value: string): value is ProductDocumentKind {
  return (PRODUCT_DOCUMENT_KINDS as readonly string[]).includes(value);
}

export function sanitizeStorageFileName(fileName: string): string {
  const base = fileName.trim().replace(/[/\\]/g, "_");
  const safe = base.replace(/[^\w.\-() ]+/g, "_").replace(/\s+/g, "_");
  return safe.slice(0, 180) || "documento";
}

export function buildProductDocumentStoragePath(
  tenantId: string,
  productId: string,
  fileName: string
): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeName = sanitizeStorageFileName(fileName);
  return `${tenantId}/products/${productId}/${id}-${safeName}`;
}

export function assertProductDocumentMime(mime: string): boolean {
  const m = mime.trim().toLowerCase();
  if (!m) return false;
  return ALLOWED_MIME.has(m);
}

export function storagePathBelongsToTenant(
  storagePath: string,
  tenantId: string
): boolean {
  const parts = storagePath.split("/");
  return parts.length >= 4 && parts[0] === tenantId && parts[1] === "products";
}
