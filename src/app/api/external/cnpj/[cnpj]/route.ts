import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertSalesOrPurchasingAccess } from "@/modules/core/lib/module-access";
import { lookupCnpj } from "@/shared/utils/external/document-lookup";
import { onlyDigits } from "@/shared/utils/br-document";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ cnpj: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const access = await assertSalesOrPurchasingAccess();
  if (!access.ok) return access.response;

  const { cnpj } = await params;
  const digits = onlyDigits(cnpj);
  if (digits.length !== 14) {
    return apiError("CNPJ inválido. Informe 14 dígitos.", 400);
  }

  try {
    const data = await lookupCnpj(digits);
    return apiOk({ data });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Não foi possível consultar o CNPJ.";
    const lower = msg.toLowerCase();
    const status =
      lower.includes("inválido") || lower.includes("não encontrado") ? 404 : 502;
    return apiError(msg, status);
  }
}
