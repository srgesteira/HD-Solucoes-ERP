"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { HVAC_INTEGRITY_TEST_METHODS } from "@/modules/hvac/lib/hvac-domain";

type Props = {
  open: boolean;
  itemLabel: string;
  defaultMethod: string | null;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    test_method: string;
    test_date: string;
    result: "pass" | "fail";
    leakage_rate: number | null;
    notes: string;
  }) => void;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function HvacIntegrityTestDialog({
  open,
  itemLabel,
  defaultMethod,
  pending = false,
  onClose,
  onConfirm,
}: Props) {
  const [testMethod, setTestMethod] = useState(
    defaultMethod ?? HVAC_INTEGRITY_TEST_METHODS[0]
  );
  const [testDate, setTestDate] = useState(todayIsoDate());
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [leakageRate, setLeakageRate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setTestMethod(defaultMethod ?? HVAC_INTEGRITY_TEST_METHODS[0]);
      setTestDate(todayIsoDate());
      setResult("pass");
      setLeakageRate("");
      setNotes("");
    }
  }, [open, defaultMethod]);

  if (!open) return null;

  const leakageParsed =
    leakageRate.trim() === "" ? null : Number(leakageRate.replace(",", "."));
  const leakageInvalid =
    leakageRate.trim() !== "" &&
    (leakageParsed == null || !Number.isFinite(leakageParsed) || leakageParsed < 0);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">
          Teste de integridade HVAC
        </h3>
        <p className="text-sm text-slate-600 truncate" title={itemLabel}>
          {itemLabel}
        </p>

        <label className="block text-xs text-slate-600">
          Método
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
            value={testMethod}
            disabled={pending}
            onChange={(e) => setTestMethod(e.target.value)}
          >
            {HVAC_INTEGRITY_TEST_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-slate-600">
          Data do teste
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
            value={testDate}
            disabled={pending}
            onChange={(e) => setTestDate(e.target.value)}
          />
        </label>

        <fieldset className="space-y-1">
          <legend className="text-xs text-slate-600">Resultado</legend>
          <div className="flex gap-3 text-sm">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                name="hvac-result"
                checked={result === "pass"}
                disabled={pending}
                onChange={() => setResult("pass")}
              />
              Aprovado
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                name="hvac-result"
                checked={result === "fail"}
                disabled={pending}
                onChange={() => setResult("fail")}
              />
              Reprovado
            </label>
          </div>
        </fieldset>

        <label className="block text-xs text-slate-600">
          Taxa de fuga / valor medido (opcional)
          <input
            type="text"
            inputMode="decimal"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
            value={leakageRate}
            disabled={pending}
            placeholder="Ex.: 0.01"
            onChange={(e) => setLeakageRate(e.target.value)}
          />
          {leakageInvalid ? (
            <span className="text-[11px] text-red-600">Valor numérico inválido.</span>
          ) : null}
        </label>

        <label className="block text-xs text-slate-600">
          Observações (opcional)
          <Textarea
            className="mt-1 text-sm"
            rows={2}
            value={notes}
            disabled={pending}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Registo PAO/DOP, lote, equipamento…"
          />
        </label>

        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !testDate || leakageInvalid}
            onClick={() =>
              onConfirm({
                test_method: testMethod,
                test_date: testDate,
                result,
                leakage_rate: leakageParsed,
                notes: notes.trim(),
              })
            }
          >
            Registar teste
          </Button>
        </div>
      </div>
    </div>
  );
}
