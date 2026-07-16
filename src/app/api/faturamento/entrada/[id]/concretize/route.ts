import { NextRequest } from "next/server";
import { apiError } from "@/modules/core/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Desactivado: o recebimento (estoque + AP) é feito só em Compras
 * via POST /api/purchasing/orders/[id]/receive.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  await params;
  return apiError(
    "Concretizar no Faturamento foi desactivado. Use «Conferido / finalizar recebimento» no pedido de compra (módulo Compras).",
    410
  );
}
