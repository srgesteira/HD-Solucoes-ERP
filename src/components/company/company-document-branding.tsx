"use client";

import type { Tables } from "@/modules/core/types/database";

export type CompanySettingsRow = Tables<"company_settings">;

const taxRegimeLabel: Record<string, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

export function getTaxRegimeLabel(
  taxRegime: string | null | undefined,
): string | null {
  if (!taxRegime?.trim()) return null;
  return taxRegimeLabel[taxRegime] ?? null;
}

function formatAddress(s: CompanySettingsRow): string | null {
  const parts = [
    [s.address_street, s.address_number].filter(Boolean).join(", "),
    s.address_complement,
    s.address_neighborhood,
    [s.address_city, s.address_state].filter(Boolean).join(" — "),
    s.address_zip ? `CEP ${s.address_zip}` : null,
  ].filter((p) => p && String(p).trim());
  return parts.length ? parts.join(" · ") : null;
}

type Props = {
  settings: CompanySettingsRow | null | undefined;
  /** Título curto do documento (ex.: impressão de orçamento) */
  documentLabel?: string;
};

/**
 * Cabeçalho e rodapé reutilizáveis em orçamentos, pedidos de venda e compra (visualização / impressão).
 */
export function CompanyDocumentBranding({
  settings,
  documentLabel,
}: Props) {
  if (!settings) return null;

  const title =
    settings.trade_name?.trim() || settings.company_name || "Empresa";
  const addr = formatAddress(settings);
  const regime = getTaxRegimeLabel(settings.tax_regime);

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-950 dark:border-slate-800 overflow-hidden print:border print:border-slate-300 print:shadow-none print:break-inside-avoid">
      <div className="p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-start min-w-0">
          {settings.logo_url?.trim() ? (
            <div className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={settings.logo_url.trim()}
                alt=""
                className="max-h-16 sm:max-h-20 w-auto object-contain object-left"
              />
            </div>
          ) : null}
          <div className="space-y-1 min-w-0">
            {documentLabel ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {documentLabel}
              </p>
            ) : null}
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight">
              {title}
            </h2>
            {settings.company_name &&
            settings.trade_name &&
            settings.company_name.trim() !== settings.trade_name.trim() ? (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Razão social: {settings.company_name}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              {settings.cnpj?.trim() ? (
                <span>CNPJ {settings.cnpj.trim()}</span>
              ) : null}
              {settings.state_registration?.trim() ? (
                <span>IE {settings.state_registration.trim()}</span>
              ) : null}
              {regime ? <span>{regime}</span> : null}
            </div>
            {addr ? (
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl">
                {addr}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              {settings.phone?.trim() ? (
                <span>Tel. {settings.phone.trim()}</span>
              ) : null}
              {settings.email?.trim() ? (
                <span>{settings.email.trim()}</span>
              ) : null}
              {settings.website?.trim() ? (
                <span className="truncate max-w-[14rem]">
                  {settings.website.trim()}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {settings.document_header?.trim() ? (
        <div className="px-4 sm:px-5 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap border-b border-slate-100 dark:border-slate-800">
          {settings.document_header.trim()}
        </div>
      ) : null}

      {settings.document_footer?.trim() ? (
        <div className="px-4 sm:px-5 py-3 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap bg-slate-50/80 dark:bg-slate-900/40">
          {settings.document_footer.trim()}
        </div>
      ) : null}
    </div>
  );
}
