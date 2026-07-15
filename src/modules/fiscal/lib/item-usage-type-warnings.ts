/**
 * Avisos de conferência fiscal ligados a usage_type.
 * Pedidos antigos (null) não travam — só sinalizam para o humano.
 */
export function usageTypeConferenceWarning(
  usageType: string | null | undefined
): string | null {
  if (usageType == null || String(usageType).trim() === "") {
    return "Utilização não informada — defina antes de conferir.";
  }
  return null;
}
