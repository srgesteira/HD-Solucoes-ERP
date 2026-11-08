"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Target, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/shared/ui/app-page";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { KpiCard, StatusBadge } from "@/shared/ui/page-helpers";

type Today = {
  data: string;
  contatos_hoje: { id: string; cliente: string; etapa: string; quando: string; acao: string | null; tel: string | null }[];
  tarefas: { id: string; cliente: string | null; tipo: string; resumo: string; quando: string }[];
  oportunidades_paradas: { id: string; cliente: string; titulo: string; etapa: string; valor: number | null; dias_sem_contato: number }[];
  funil: Record<string, { n: number; valor: number }>;
  leads_novos_7d: number;
  cadastro_fiscal_incompleto: number;
};
type Opp = {
  id: string;
  title: string;
  stage: string;
  amount: number | null;
  customer_id: string;
  next_action: string | null;
  next_action_at: string | null;
  customers: { name: string; trade_name: string | null } | null;
};
type CustomerLite = { id: string; name: string; trade_name?: string | null };

const STAGES: { v: string; label: string }[] = [
  { v: "novo", label: "Novo" },
  { v: "qualificado", label: "Qualificado" },
  { v: "proposta", label: "Proposta" },
  { v: "negociacao", label: "Negociação" },
];
const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dateBr = (iso: string | null | undefined) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "—");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? "Erro");
  return j;
}

export default function CrmPage() {
  const [today, setToday] = useState<Today | null>(null);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, o] = await Promise.all([
        api<Today>("/api/crm/today"),
        api<{ data: Opp[] }>("/api/crm/opportunities?open=1&limit=200"),
      ]);
      setToday(t);
      setOpps(o.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar o CRM");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byStage = useMemo(() => {
    const m: Record<string, Opp[]> = {};
    for (const s of STAGES) m[s.v] = [];
    for (const o of opps) (m[o.stage] ??= []).push(o);
    return m;
  }, [opps]);

  const pipeline = opps.reduce((a, o) => a + (o.amount ?? 0), 0);

  const moveStage = async (o: Opp, stage: string) => {
    try {
      await api(`/api/crm/opportunities/${o.id}`, { method: "PATCH", body: JSON.stringify({ stage }) });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const doneTask = async (id: string) => {
    await api(`/api/crm/activities/${id}`, { method: "PATCH", body: JSON.stringify({ done: true }) }).catch(() => undefined);
    await load();
  };

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <Target className="h-5 w-5 text-brand-700" />
          CRM
        </span>
      }
      description="Agenda do dia, funil de oportunidades e novos leads. Oportunidade ligada a orçamento avança sozinha."
      density="comfortable"
      width="wide"
    >
      {loading && !today ? (
        <div className="flex justify-center items-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : null}

      {today ? (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Funil aberto" value={brl(pipeline)} hint={`${opps.length} oportunidade(s)`} tone="brand" />
            <KpiCard
              label="Para hoje"
              value={today.contatos_hoje.length + today.tarefas.length}
              hint="contatos e tarefas"
              tone={today.contatos_hoje.length + today.tarefas.length ? "warning" : "success"}
            />
            <KpiCard
              label="Paradas há 7+ dias"
              value={today.oportunidades_paradas.length}
              tone={today.oportunidades_paradas.length ? "danger" : "success"}
            />
            <KpiCard label="Leads novos (7 dias)" value={today.leads_novos_7d} tone="info" />
          </div>

          <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Agenda de hoje</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {today.contatos_hoje.length + today.tarefas.length + today.oportunidades_paradas.length === 0 ? (
                  <p className="text-slate-500">Nada pendente hoje.</p>
                ) : null}
                {today.contatos_hoje.map((c) => (
                  <Link key={c.id} href={`/customers/${c.id}`} className="flex justify-between gap-2 rounded px-2 py-1 hover:bg-slate-50">
                    <span>
                      <StatusBadge tone="warning">Contato {dateBr(c.quando)}</StatusBadge> <b>{c.cliente}</b>
                      {c.acao ? ` — ${c.acao}` : ""}
                    </span>
                    <span className="text-slate-500">{c.tel ?? ""}</span>
                  </Link>
                ))}
                {today.tarefas.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 px-2 py-1">
                    <span>
                      <StatusBadge tone="info">Tarefa {dateBr(t.quando)}</StatusBadge> {t.cliente ? <b>{t.cliente}: </b> : null}
                      {t.resumo}
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void doneTask(t.id)}>
                      Concluir
                    </Button>
                  </div>
                ))}
                {today.oportunidades_paradas.map((o) => (
                  <div key={o.id} className="flex justify-between gap-2 px-2 py-1">
                    <span>
                      <StatusBadge tone="danger">{o.dias_sem_contato} dias</StatusBadge> <b>{o.cliente}</b> — {o.titulo}
                    </span>
                    <span>{brl(o.valor)}</span>
                  </div>
                ))}
                {today.cadastro_fiscal_incompleto ? (
                  <p className="pt-2 text-xs text-amber-700">
                    {today.cadastro_fiscal_incompleto} cliente(s) com cadastro fiscal incompleto.
                  </p>
                ) : null}
              </CardContent>
            </Card>
            <QuickLead onCreated={load} />
          </div>

          <NewOpportunity onCreated={load} />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {STAGES.map((s) => (
              <div key={s.v} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-sm font-semibold text-slate-800">{s.label}</span>
                  <span className="text-xs text-slate-500">
                    {byStage[s.v]?.length ?? 0} · {brl((byStage[s.v] ?? []).reduce((a, o) => a + (o.amount ?? 0), 0))}
                  </span>
                </div>
                <div className="space-y-2">
                  {(byStage[s.v] ?? []).map((o) => (
                    <div key={o.id} className="rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm">
                      <Link href={`/customers/${o.customer_id}`} className="font-medium text-brand-700 hover:underline">
                        {o.customers?.trade_name || o.customers?.name || "Cliente"}
                      </Link>
                      <p className="text-slate-700">{o.title}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-semibold">{brl(o.amount)}</span>
                        <select
                          className="h-7 rounded border border-slate-300 bg-white px-1 text-xs"
                          value={o.stage}
                          onChange={(e) => void moveStage(o, e.target.value)}
                        >
                          {[...STAGES, { v: "ganho", label: "Ganho" }, { v: "perdido", label: "Perdido" }].map((x) => (
                            <option key={x.v} value={x.v}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </AppPage>
  );
}

function useCustomerSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerLite[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void api<{ data: CustomerLite[] }>(`/api/customers?search=${encodeURIComponent(q)}&limit=8`)
        .then((j) => setResults(j.data))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return { q, setQ, results };
}

function NewOpportunity({ onCreated }: { onCreated: () => Promise<void> }) {
  const { q, setQ, results } = useCustomerSearch();
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const add = async () => {
    if (!customer) return toast.error("Escolha o cliente.");
    if (!title.trim()) return toast.error("Informe o título.");
    try {
      await api("/api/crm/opportunities", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customer.id,
          title,
          amount: amount ? Number(amount.replace(/\./g, "").replace(",", ".")) : null,
        }),
      });
      setCustomer(null);
      setQ("");
      setTitle("");
      setAmount("");
      await onCreated();
      toast.success("Oportunidade criada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };
  return (
    <Card>
      <CardContent className="grid gap-2 py-3 sm:grid-cols-[1fr_1.5fr_9rem_auto]">
        <div className="relative">
          <Input
            placeholder="Cliente…"
            value={customer ? customer.trade_name || customer.name : q}
            onChange={(e) => {
              setCustomer(null);
              setQ(e.target.value);
            }}
          />
          {!customer && results.length ? (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="block w-full px-2 py-1 text-left text-sm hover:bg-slate-50"
                  onClick={() => setCustomer(r)}
                >
                  {r.trade_name || r.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Input placeholder="Nova oportunidade (ex.: 2 FFU 600x600)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="Valor (R$)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Button type="button" onClick={() => void add()}>
          <Plus className="h-4 w-4" /> Oportunidade
        </Button>
      </CardContent>
    </Card>
  );
}

function QuickLead({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!name.trim()) return toast.error("Informe o nome.");
    setBusy(true);
    try {
      const j = await api<{ data: { id: string } }>("/api/customers", {
        method: "POST",
        body: JSON.stringify({ name, document: doc || null }),
      });
      await api(`/api/customers/${j.data.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({ crm_stage: "lead", lead_source: source || null }),
      });
      setName("");
      setDoc("");
      setSource("");
      toast.success("Lead criado — cadastro completado pelo CNPJ.");
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Novo lead</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input placeholder="Empresa" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="CNPJ (completa o resto sozinho)" value={doc} onChange={(e) => setDoc(e.target.value)} />
        <Input placeholder="Origem (LinkedIn, site, indicação…)" value={source} onChange={(e) => setSource(e.target.value)} />
        <Button type="button" className="w-full" onClick={() => void add()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Criar lead
        </Button>
      </CardContent>
    </Card>
  );
}
