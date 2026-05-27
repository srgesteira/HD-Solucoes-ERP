export const SUPPLIERS_QUERY_KEY = ["purchasing-suppliers"] as const;

export function suppliersListQueryKey(filters: {
  isActive: string;
  search: string;
  page: number;
  limit: number;
}) {
  return [...SUPPLIERS_QUERY_KEY, filters] as const;
}

export const SUPPLIERS_ACTIVE_QUERY_KEY = [
  "purchasing-suppliers-active",
] as const;
