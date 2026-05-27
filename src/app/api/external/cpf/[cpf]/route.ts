import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertSalesOrPurchasingAccess } from "@/modules/core/lib/module-access";
import { lookupCpf } from "@/shared/utils/external/document-lookup";
import { onlyDigits } from "@/shared/utils/br-document";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ cpf: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const access = await assertSalesOrPurchasingAccess();
  if (!access.ok) return access.response;

  const { cpf } = await params;
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) {
    return apiError("CPF inválido. Informe 11 dígitos.", 400);
  }

  try {
    const data = await lookupCpf(digits);
    return apiOk({ data });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Não foi possível consultar o CPF.";
    const lower = msg.toLowerCase();
    const status =
      lower.includes("inválido") ||
      lower.includes("não encontrado") ||
      lower.includes("não disponível")
        ? 404
        : 502;
    return apiError(msg, status);
  }
}
