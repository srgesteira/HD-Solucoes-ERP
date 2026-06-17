/**
 * Vertical HVAC — domínio de filtros, salas limpas e testes de integridade.
 * §18 do documento funcional: ERP especializado em quem fabrica filtro e HVAC.
 */

export const VERTICAL_ID = "hvac" as const;

export const VERTICAL_TAGLINE =
  "ERP de quem faz filtro e HVAC";

export const HVAC_FILTER_CLASSES = [
  "G4",
  "F7",
  "F9",
  "HEPA H13",
  "HEPA H14",
  "ULPA U15",
  "ULPA U16",
  "Carvão ativo",
  "Outro",
] as const;

export type HvacFilterClass = (typeof HVAC_FILTER_CLASSES)[number];

export const HVAC_CLEANROOM_CLASSES = [
  "ISO 5",
  "ISO 6",
  "ISO 7",
  "ISO 8",
  "ISO 9",
  "Não aplicável",
] as const;

export type HvacCleanroomClass = (typeof HVAC_CLEANROOM_CLASSES)[number];

export const HVAC_INTEGRITY_TEST_METHODS = [
  "PAO (fotômetro)",
  "DOP (scan)",
  "Pressão estática",
  "Outro",
] as const;

export type HvacIntegrityTestMethod =
  (typeof HVAC_INTEGRITY_TEST_METHODS)[number];

export type HvacProductSpecs = {
  hvac_filter_class: string | null;
  hvac_airflow_m3h: number | null;
  hvac_pressure_drop_pa: number | null;
  hvac_cleanroom_class: string | null;
  hvac_requires_integrity_test: boolean;
  hvac_integrity_test_method: string | null;
};

/** Prefixos / naturezas que recebem ficha técnica HVAC. */
export function isHvacSpecProduct(args: {
  product_nature: string | null;
  prefix_code?: string | null;
}): boolean {
  const nature = args.product_nature?.trim().toUpperCase();
  if (nature === "AC") return true;
  const prefix = args.prefix_code?.trim().toUpperCase();
  return prefix === "AC" || prefix === "HD1" || prefix === "HD2" || prefix === "HD3";
}

export function emptyHvacSpecs(): HvacProductSpecs {
  return {
    hvac_filter_class: null,
    hvac_airflow_m3h: null,
    hvac_pressure_drop_pa: null,
    hvac_cleanroom_class: null,
    hvac_requires_integrity_test: false,
    hvac_integrity_test_method: null,
  };
}
