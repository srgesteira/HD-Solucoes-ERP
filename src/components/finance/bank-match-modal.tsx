"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { formatBrl } from "@/shared/utils/format-brl";
import { cn } from "@/shared/utils/cn";

type MatchCandidate = {
  id: string;
  kind: "receivable" | "payable";
  label: string;
  amount: number;
  due_date: string;
  score: number;
};

type CandidatesResponse = {
  line: {
    id: string;
    amount: number;
    transaction_date: string;
    description: string | null;
  };
  candidates: MatchCandidate[];
};

type Props = {
  open: boolean;
  lineId: string | null;
  busy: boolean;
  onClose: () => void;
  onMatch: (candidate: MatchCandidate) => void;
};

async function fetchCandidates(lineId: string): Promise<CandidatesResponse> {
  const res = await fetch(
    `/api/finance/bank-statement-lines/${lineId}/candidates`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as CandidatesResponse & {
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar candidatos");
  return json;
}

function fmtDay(iso: string): string {
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function BankMatchModal({
  open,
  lineId,
  busy,
  onClose,
  onMatch,
}: Props) {
  const query = useQuery({
    queryKey: ["bank-match-candidates", lineId],
    queryFn: () => fetchCandidates(lineId!),
    enabled: open && Boolean(lineId),
  });

  if (!open || !lineId) return null;

  const line = query.data?.line;
  const candidates = query.data?.candidates ?? [];
  const kindLabel =
    line && line.amount > 0
      ? "conta a receber"
      : line && line.amount < 0
        ? "conta a pagar"
        : "título";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Fechar"
        onClick={onClose}
      />
      <Card className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-hidden shadow-lg flex flex-col">
        <CardHeader className="border-b border-slate-100 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Conciliar manualmente</CardTitle>
              {line ? (
                <p className="text-sm text-slate-600 mt-1">
                  {fmtDay(line.transaction_date)} ·{" "}
                  <span className="tabular-nums font-medium">
                    {formatBrl(line.amount)}
                  </span>
                  {line.description ? ` · ${line.description}` : null}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-y-auto pt-4 flex-1">
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              A carregar candidatos…
            </div>
          ) : query.isError ? (
            <p className="text-sm text-red-600 text-center py-6">
              {query.error instanceof Error
                ? query.error.message
                : "Erro ao carregar."}
            </p>
          ) : line && line.amount === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Linha com valor zero — não há título para associar.
            </p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Nenhum {kindLabel} em aberto encontrado.
            </p>
          ) : (
            <ul className="space-y-2">
              {candidates.map((c, idx) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={busy}
                    className={cn(
                      "w-full rounded-lg border border-slate-200 p-3 text-left text-sm",
                      "hover:border-brand-600 hover:bg-brand-50/40 transition-colors",
                      idx === 0 && "border-brand-300 bg-brand-50/30"
                    )}
                    onClick={() => onMatch(c)}
                  >
                    <div className="flex justify-between gap-3">
                      <span className="font-medium text-slate-900 truncate">
                        {c.label}
                      </span>
                      <span className="tabular-nums shrink-0">
                        {formatBrl(c.amount)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex justify-between">
                      <span>
                        Venc. {fmtDay(c.due_date)} ·{" "}
                        {c.kind === "receivable" ? "Receber" : "Pagar"}
                      </span>
                      {idx === 0 ? (
                        <span className="text-brand-700 font-medium">
                          Melhor candidato
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
