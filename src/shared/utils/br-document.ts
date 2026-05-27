/** Apenas dígitos. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export type DocumentKind = "cpf" | "cnpj";

export function documentKindFromDigits(digits: string): DocumentKind | null {
  if (digits.length === 11) return "cpf";
  if (digits.length === 14) return "cnpj";
  return null;
}

/** Máscara CPF ou CNPJ conforme quantidade de dígitos. */
export function formatDocumentMask(raw: string): string {
  const d = onlyDigits(raw).slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length <= 12) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function allSameDigits(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

function cpfCheckDigits(digits: string): boolean {
  if (digits.length !== 11 || allSameDigits(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]!, 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(digits[9]!, 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]!, 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(digits[10]!, 10);
}

function cnpjCheckDigits(digits: string): boolean {
  if (digits.length !== 14 || allSameDigits(digits)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i]!, 10) * w1[i]!;
  let d1 = sum % 11;
  d1 = d1 < 2 ? 0 : 11 - d1;
  if (d1 !== parseInt(digits[12]!, 10)) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(digits[i]!, 10) * w2[i]!;
  let d2 = sum % 11;
  d2 = d2 < 2 ? 0 : 11 - d2;
  return d2 === parseInt(digits[13]!, 10);
}

export function isValidCpf(digits: string): boolean {
  return digits.length === 11 && cpfCheckDigits(digits);
}

export function isValidCnpj(digits: string): boolean {
  return digits.length === 14 && cnpjCheckDigits(digits);
}

export function validateDocumentDigits(digits: string): {
  ok: true;
  kind: DocumentKind;
} | { ok: false; error: string } {
  const kind = documentKindFromDigits(digits);
  if (!kind) {
    return {
      ok: false,
      error: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) completo.",
    };
  }
  if (kind === "cpf" && !isValidCpf(digits)) {
    return { ok: false, error: "CPF inválido." };
  }
  if (kind === "cnpj" && !isValidCnpj(digits)) {
    return { ok: false, error: "CNPJ inválido." };
  }
  return { ok: true, kind };
}
