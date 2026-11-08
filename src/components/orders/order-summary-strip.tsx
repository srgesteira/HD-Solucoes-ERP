"use client";

import Link from "next/link";
import { AlertTriangle, Check, CalendarClock } from "lucide-react";
import { cn } from "@/shared/utils/cn";

/**
 * Faixa de resumo do pedido (venda ou compra): etapa atual, quem é a outra parte, valor,
 * prazo com contagem de dias, financeiro e alertas de inconsistência. Fica no topo, para
 * o essencial caber numa olhada (inclusive no celular).
 */
export type SummaryStep = { key: string; label: string };
export type SummaryAlert = { tone: "danger" | "warning" | "info"; text: string };

type Props = {
  steps: SummaryStep[];
  currentKey: string;
  cancelled?: boolean;
  partyLabel: string;
  partyName: string;
  partyHref?: string | null;
  total: number;
  deadline?: string | null;
  deadlineLabel?: string;
  done?: boolean;
  finance?: { label: string; planned: number; settled: number; next?: { date: string; amount: number } | null };
  alerts?: SummaryAlert[];
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBr = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");

function daysUntil(iso: string): number {
  const today = new Date();
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - t) / 86400000);
}

export function OrderSummaryStrip({
  steps,
  currentKey,
  cancelled,
  partyLabel,
  partyName,
  partyHref,
  total,
  deadline,
  deadlineLabel = "Prazo",
  done,
  finance,
  alerts = [],
}: Props) {
  const idx = Math.max(0, steps.findIndex((s) => s.key === currentKey));
  const dd = deadline ? daysUntil(deadline) : null;
  const deadlineTone =
    done || dd == null ? "text-slate-700" : dd < 0 ? "text-rose-700" : dd <= 3 ? "text-amber-700" : "text-emerald-700";
  const deadlineHint =
    done || dd == null ? "" : dd < 0 ? `${-dd} dia(s) atrasado` : dd === 0 ? "vence hoje" : `faltam ${dd} dia(s)`;

  return (
    <div className="space-y-3 print:hidden">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {/* Etapas */}
        <ol className="flex flex-wrap items-center gap-y-2 text-xs">
          {steps.map((s, i) => {
            const state = cancelled ? "off" : i < idx ? "done" : i === idx ? "now" : "next";
            return (
              <li key={s.key} className="flex items-center">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium",
                    state === "done" && "bg-emerald-50 text-emerald-800",
                    state === "now" && "bg-brand-700 text-white",
                    state === "next" && "bg-slate-100 text-slate-500",
                    state === "off" && "bg-slate-100 text-slate-400 line-through"
                  )}
                >
                  {state === "done" ? <Check className="h-3 w-3" /> : null}
                  {s.label}
                </span>
                {i < steps.length - 1 ? <span className="mx-1 h-px w-4 bg-slate-300" /> : null}
              </li>
            );
          })}
          {cancelled ? (
            <li className="ml-2 rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">Cancelado</li>
          ) : null}
        </ol>

        {/* Números-chave */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">{partyLabel}</p>
            {partyHref ? (
              <Link href={partyHref} className="font-semibold text-brand-700 hover:underline">
                {partyName}
              </Link>
            ) : (
              <p className="font-semibold text-slate-900 dark:text-slate-100">{partyName}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500">Valor total</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{brl(total)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{deadlineLabel}</p>
            {deadline ? (
              <p className={cn("font-semibold tabular-nums", deadlineTone)}>
                <CalendarClock className="mr-1 inline h-4 w-4" />
                {dateBr(deadline)} {deadlineHint ? <span className="text-xs font-normal">· {deadlineHint}</span> : null}
              </p>
            ) : (
              <p className="text-slate-400">—</p>
            )}
          </div>
          {finance ? (
            <div>
              <p className="text-xs text-slate-500">{finance.label}</p>
              <p className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {brl(finance.settled)} <span className="text-xs font-normal text-slate-500">de {brl(finance.planned)}</span>
              </p>
              {finance.next ? (
                <p className="text-xs text-slate-500">
                  Próxima: {dateBr(finance.next.date)} · {brl(finance.next.amount)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {alerts.length ? (
        <div className="space-y-1">
          {alerts.map((a, i) => (
            <p
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
                a.tone === "danger" && "bg-rose-50 text-rose-800",
                a.tone === "warning" && "bg-amber-50 text-amber-900",
                a.tone === "info" && "bg-sky-50 text-sky-900"
              )}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {a.text}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
