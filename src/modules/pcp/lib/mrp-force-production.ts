/**
 * Regra "forçar OP" do MRP por prefixo do código técnico (products.technical_code,
 * ex.: "HD1-A10A10-001"). Pura — usada no servidor (MRP) e na UI (pré-marcação).
 *
 *  - HD1 / HD2: fabricados pela HD → sempre geram OP (mesmo sem BOM ou com kit em estoque).
 *  - HD3: revenda → nunca gera OP forçada (segue para compra).
 */

function productCodePrefix(
  technicalCode: string | null | undefined,
  code?: string | null
): string {
  const tech = String(technicalCode ?? "").trim().toUpperCase();
  if (tech.startsWith("HD")) return tech;
  // Legado (ex.: "LEG-…") ou vazio: tenta o código manual.
  const manual = String(code ?? "").trim().toUpperCase();
  return manual || tech;
}

export function isHdManufacturedCode(
  technicalCode: string | null | undefined,
  code?: string | null
): boolean {
  const c = productCodePrefix(technicalCode, code);
  return c.startsWith("HD1") || c.startsWith("HD2");
}

export function isHdResaleCode(
  technicalCode: string | null | undefined,
  code?: string | null
): boolean {
  return productCodePrefix(technicalCode, code).startsWith("HD3");
}

/**
 * Decide se a linha do PV deve ser forçada a gerar OP.
 * Ordem: HD3 nunca; desmarcação explícita do usuário vence a regra automática;
 * marcação explícita; HD1/HD2 automático.
 */
export function shouldForceProductionForLine(args: {
  salesOrderItemId: string;
  technicalCode: string | null | undefined;
  code?: string | null;
  forcedIds: ReadonlySet<string>;
  unforcedIds: ReadonlySet<string>;
}): boolean {
  if (isHdResaleCode(args.technicalCode, args.code)) return false;
  if (args.unforcedIds.has(args.salesOrderItemId)) return false;
  if (args.forcedIds.has(args.salesOrderItemId)) return true;
  return isHdManufacturedCode(args.technicalCode, args.code);
}
