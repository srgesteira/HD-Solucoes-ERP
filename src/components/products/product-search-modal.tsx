"use client";

/**
 * Compatibilidade: todas as pesquisas de produto usam o catálogo em ecrã grande.
 * Prefira importar `ProductCatalogPickerModal` directamente em código novo.
 */
export type { ProductSearchHit } from "@/components/products/product-search-types";
export { ProductCatalogPickerModal as ProductSearchModal } from "@/components/products/product-catalog-picker-modal";
