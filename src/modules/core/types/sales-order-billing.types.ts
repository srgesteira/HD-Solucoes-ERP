/** Campos adicionados por migração antes de regenerar database.ts */
export type SalesOrderBillingClosure = "nfe" | "without_invoice" | null;

export type SalesOrderBillingFields = {
  billing_closure?: SalesOrderBillingClosure;
};
