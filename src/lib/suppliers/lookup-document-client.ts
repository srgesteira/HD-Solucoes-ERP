import type { DocumentLookupResult } from "@/lib/external/document-lookup";

export async function lookupDocumentClient(
  digits: string,
  kind: "cpf" | "cnpj"
): Promise<DocumentLookupResult> {
  const path =
    kind === "cnpj"
      ? `/api/external/cnpj/${digits}`
      : `/api/external/cpf/${digits}`;
  const res = await fetch(path, { credentials: "include", cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    data?: DocumentLookupResult;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro na consulta do documento");
  }
  if (!json.data?.name) throw new Error("Resposta inválida da consulta");
  return json.data;
}
