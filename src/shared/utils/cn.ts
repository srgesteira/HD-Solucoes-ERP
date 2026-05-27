/**
 * Concatenador de classes utilitário leve (sem dependência de clsx/tailwind-merge
 * neste estágio). Aceita strings, condicionais e ignora valores falsy.
 */
export function cn(
  ...inputs: Array<string | number | false | null | undefined>
): string {
  return inputs.filter(Boolean).join(" ");
}
