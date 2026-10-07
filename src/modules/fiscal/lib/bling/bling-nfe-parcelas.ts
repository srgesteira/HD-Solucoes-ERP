import { resolveInstallmentAmounts } from "@/shared/utils/payment-installment-amounts";
import type { NfeComplementaryInfoSource } from "@/modules/faturamento/lib/nfe-complementary-info";
import { todayIsoSaoPaulo } from "@/shared/utils/date";
import {
  parsePaymentDueMode,
  resolvePaymentDueDates,
} from "@/shared/utils/payment-due";
import { formatPaymentTermsSummary } from "@/shared/utils/payment-terms-format";

/**
 * Parcela de cobrança no POST /nfe (grupo fatura/duplicata da NF-e).
 * Schema oficial v3: `parcelas[].data`, `valor`, `observacoes?`, `formaPagamento?`.
 * @see https://developer.bling.com.br/referencia#/Notas%20Fiscais%20Eletr%C3%B4nicas/post_nfe
 */
export type BlingNfeParcela = {
  data: string;
  valor: number;
  observacoes?: string;
  formaPagamento?: { id: number };
};

export function buildBlingNfeParcelas(
  source: NfeComplementaryInfoSource & {
    total: number;
    semCobranca?: boolean;
    formaPagamentoId?: number | null;
  }
): BlingNfeParcela[] {
  const semCobranca = source.semCobranca === true;
  const n = semCobranca
    ? 1
    : Math.max(1, Math.min(999, Math.floor(source.payment_installments) || 1));
  const total = Math.max(0, Number(source.total ?? 0));
  const amounts = resolveInstallmentAmounts(
    total,
    n,
    semCobranca ? null : source.payment_installment_amounts
  );
  const emission = todayIsoSaoPaulo();
  const dates = resolvePaymentDueDates(source, emission);
  const mode = parsePaymentDueMode(source.payment_due_mode);
  const terms = semCobranca
    ? "Sem cobrança — simples remessa"
    : mode === "fixed_dates"
      ? "Vencimentos conforme datas acordadas com o cliente."
      : formatPaymentTermsSummary({
          payment_installments: source.payment_installments,
          payment_days_to_first_due: source.payment_days_to_first_due,
          payment_days_between_installments:
            source.payment_days_between_installments,
        });
  const fallbackDate =
    dates[0] ?? source.order_date.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const formaId = Number(source.formaPagamentoId);
  const formaPagamento =
    Number.isFinite(formaId) && formaId > 0 ? { id: formaId } : undefined;

  return amounts.map((valor, i) => {
    const label =
      semCobranca
        ? terms
        : n === 1
          ? terms
          : i === 0
            ? `Parcela 1/${n} - ${terms}`
            : `Parcela ${i + 1}/${n}`;
    return {
      data: dates[i] ?? fallbackDate,
      valor,
      observacoes: label,
      ...(formaPagamento ? { formaPagamento } : {}),
    };
  });
}
