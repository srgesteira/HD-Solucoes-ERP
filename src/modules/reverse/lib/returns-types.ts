/**
 * §10 do documento funcional: tipos do fluxo reverso.
 */

export const SALES_RETURN_REASONS = [
  "defect",
  "customer_request",
  "wrong_item",
  "damaged_in_transit",
  "commercial_dispute",
  "other",
] as const;
export type SalesReturnReason = (typeof SALES_RETURN_REASONS)[number];

export const SALES_RETURN_STATUSES = [
  "draft",
  "authorized",
  "received",
  "cancelled",
] as const;
export type SalesReturnStatus = (typeof SALES_RETURN_STATUSES)[number];

export const RETURN_FINANCIAL_ACTIONS = [
  "refund",
  "credit_note",
  "replacement",
] as const;
export type ReturnFinancialAction =
  (typeof RETURN_FINANCIAL_ACTIONS)[number];

export const SALES_RETURN_ITEM_CONDITIONS = [
  "a_grade",
  "b_grade",
  "scrap",
] as const;
export type SalesReturnItemCondition =
  (typeof SALES_RETURN_ITEM_CONDITIONS)[number];

export const PURCHASE_RETURN_REASONS = [
  "defect",
  "wrong_item",
  "damaged_in_transit",
  "over_received",
  "commercial_dispute",
  "other",
] as const;
export type PurchaseReturnReason = (typeof PURCHASE_RETURN_REASONS)[number];

export const PURCHASE_RETURN_STATUSES = [
  "draft",
  "authorized",
  "sent",
  "cancelled",
] as const;
export type PurchaseReturnStatus = (typeof PURCHASE_RETURN_STATUSES)[number];

export const PRODUCTION_CANCELLATION_REASONS = [
  "customer_cancelled",
  "engineering_change",
  "material_unavailable",
  "quality_issue",
  "rework_required",
  "other",
] as const;
export type ProductionCancellationReason =
  (typeof PRODUCTION_CANCELLATION_REASONS)[number];

export const SALES_RETURN_REASON_LABELS: Record<SalesReturnReason, string> = {
  defect: "Defeito",
  customer_request: "Solicitação do cliente",
  wrong_item: "Item errado",
  damaged_in_transit: "Avariado em transporte",
  commercial_dispute: "Disputa comercial",
  other: "Outro",
};

export const PURCHASE_RETURN_REASON_LABELS: Record<
  PurchaseReturnReason,
  string
> = {
  defect: "Defeito",
  wrong_item: "Item errado",
  damaged_in_transit: "Avariado em transporte",
  over_received: "Recebido a mais",
  commercial_dispute: "Disputa comercial",
  other: "Outro",
};

export const PRODUCTION_CANCELLATION_REASON_LABELS: Record<
  ProductionCancellationReason,
  string
> = {
  customer_cancelled: "Cliente cancelou pedido",
  engineering_change: "Alteração de engenharia",
  material_unavailable: "Material indisponível",
  quality_issue: "Problema de qualidade",
  rework_required: "Rework necessário",
  other: "Outro",
};

export const FINANCIAL_ACTION_LABELS: Record<
  ReturnFinancialAction,
  string
> = {
  refund: "Reembolso (devolver dinheiro)",
  credit_note: "Crédito (saldo a usar)",
  replacement: "Troca (sem mexer financeiro)",
};
