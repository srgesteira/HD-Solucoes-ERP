/** Prefixo para invalidar todas as queries de clientes (lista, formulário de orçamento, etc.). */
export const CUSTOMERS_QUERY_KEY = ["customers"] as const;

export function customersQuoteFormQueryKey(search: string) {
  return [...CUSTOMERS_QUERY_KEY, "quote-form", search] as const;
}

export function customersListQueryKey(filters: {
  isActive: string;
  search: string;
  page: number;
  limit: number;
}) {
  return [...CUSTOMERS_QUERY_KEY, "list", filters] as const;
}
