"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useMe } from "@/hooks/use-me";
import type { FiscalRuleRow } from "@/modules/fiscal/lib/fiscal-rules-types";
import { resolveFiscalRule } from "@/modules/fiscal/lib/fiscal-rules-engine";

async function fetchRules(): Promise<FiscalRuleRow[]> {
  const res = await fetch("/api/fiscal/rules", { credentials: "include" });
  const json = (await res.json().catch(() => ({}))) as {
    rules?: FiscalRuleRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar regras");
  return json.rules ?? [];
}

async function saveRule(payload: Record<string, unknown>) {
  const res = await fetch("/api/fiscal/rules", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao gravar");
}

async function deleteRule(id: string) {
  const res = await fetch(`/api/fiscal/rules/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao remover");
}

const emptyForm = {
  name: "",
  operation_type: "",
  origin_uf: "",
  destination_uf: "",
  ncm_pattern: "",
  product_prefix_code: "",
  priority: "100",
  cfop: "",
  icms_rate: "",
  ipi_rate: "",
  pis_rate: "",
  cofins_rate: "",
};

export default function FiscalRulesSettingsPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const isAdmin = me?.role === "admin";
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [previewNcm, setPreviewNcm] = useState("84213990");
  const [previewDestUf, setPreviewDestUf] = useState("MG");

  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: ["fiscal-rules"],
    queryFn: fetchRules,
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: saveRule,
    onSuccess: () => {
      toast.success("Regra criada.");
      setForm(emptyForm);
      void queryClient.invalidateQueries({ queryKey: ["fiscal-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      toast.success("Regra removida.");
      void queryClient.invalidateQueries({ queryKey: ["fiscal-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = useMemo(() => {
    if (!rules.length) return null;
    return resolveFiscalRule(rules, {
      operationType: "sale",
      originUf: "SP",
      destinationUf: previewDestUf || null,
      taxRegimeId: null,
      companyTaxRegime: null,
      ncm: previewNcm || null,
      productPrefixCode: "HD1",
      productNature: null,
    });
  }, [rules, previewDestUf, previewNcm]);

  if (meLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <p className="text-sm text-slate-600">
        Apenas administradores podem gerir regras fiscais.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Scale className="h-6 w-6" />
          Regras fiscais
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Cadastre condições e resultados tributários. Alíquotas ficam vazias até
          a contadora preencher — o sistema não inventa valores.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova regra (estrutura)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex.: Venda interestadual MG"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Operação</Label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={form.operation_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, operation_type: e.target.value }))
              }
            >
              <option value="">Qualquer</option>
              <option value="sale">Venda</option>
              <option value="purchase">Compra</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade (menor = ganha empate)</Label>
            <Input
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({ ...f, priority: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>UF origem</Label>
            <Input
              maxLength={2}
              value={form.origin_uf}
              onChange={(e) =>
                setForm((f) => ({ ...f, origin_uf: e.target.value.toUpperCase() }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>UF destino</Label>
            <Input
              maxLength={2}
              value={form.destination_uf}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  destination_uf: e.target.value.toUpperCase(),
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>NCM (ou prefixo%)</Label>
            <Input
              value={form.ncm_pattern}
              onChange={(e) =>
                setForm((f) => ({ ...f, ncm_pattern: e.target.value }))
              }
              placeholder="8421%"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prefixo produto</Label>
            <Input
              value={form.product_prefix_code}
              onChange={(e) =>
                setForm((f) => ({ ...f, product_prefix_code: e.target.value }))
              }
              placeholder="HD1"
            />
          </div>
          <div className="space-y-1.5">
            <Label>CFOP (resultado)</Label>
            <Input
              value={form.cfop}
              onChange={(e) => setForm((f) => ({ ...f, cfop: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>ICMS % (resultado)</Label>
            <Input
              value={form.icms_rate}
              onChange={(e) =>
                setForm((f) => ({ ...f, icms_rate: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>IPI % (resultado)</Label>
            <Input
              value={form.ipi_rate}
              onChange={(e) =>
                setForm((f) => ({ ...f, ipi_rate: e.target.value }))
              }
            />
          </div>
          <div className="md:col-span-2">
            <Button
              type="button"
              disabled={createMutation.isPending || !form.name.trim()}
              onClick={() =>
                createMutation.mutate({
                  name: form.name.trim(),
                  operation_type: form.operation_type || null,
                  origin_uf: form.origin_uf || null,
                  destination_uf: form.destination_uf || null,
                  ncm_pattern: form.ncm_pattern || null,
                  product_prefix_code: form.product_prefix_code || null,
                  priority: Number(form.priority) || 100,
                  cfop: form.cfop || null,
                  icms_rate: form.icms_rate ? Number(form.icms_rate) : null,
                  ipi_rate: form.ipi_rate ? Number(form.ipi_rate) : null,
                  pis_rate: form.pis_rate ? Number(form.pis_rate) : null,
                  cofins_rate: form.cofins_rate
                    ? Number(form.cofins_rate)
                    : null,
                })
              }
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-2">Criar regra</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview do motor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label>NCM teste</Label>
              <Input
                value={previewNcm}
                onChange={(e) => setPreviewNcm(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label>UF destino teste</Label>
              <Input
                value={previewDestUf}
                onChange={(e) => setPreviewDestUf(e.target.value.toUpperCase())}
                className="w-24"
                maxLength={2}
              />
            </div>
          </div>
          {preview ? (
            <p className="text-sm text-slate-700">
              {preview.rule
                ? `Casaria: "${preview.rule.name}" (score ${preview.matchScore}) — ${preview.fiscalStatus}`
                : "Nenhuma regra casaria (no_rules)."}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Cadastre regras para testar.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Regras cadastradas ({rules.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          ) : error ? (
            <p className="text-sm text-red-600">{(error as Error).message}</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhuma regra — comportamento manual preservado (no_rules).
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rules.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-500">
                      {r.operation_type ?? "qualquer"} · prio {r.priority}
                      {r.destination_uf ? ` · dest ${r.destination_uf}` : ""}
                      {r.ncm_pattern ? ` · NCM ${r.ncm_pattern}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(r.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
