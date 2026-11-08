"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/shared/ui/app-page";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge, type StatusTone } from "@/shared/ui/page-helpers";

/* ------------------------------------------------------------------ tipos */
type Customer = Record<string, unknown> & { id: string; name: string };
type Tax = {
  uf: string | null;
  ind_ie_dest: number;
  interestadual: boolean;
  consumidor_final: boolean;
  difal: string;
  cfop_venda_sugerido: string;
  faltando: string[];
};
type Contact = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  is_primary: boolean;
  is_decision_maker: boolean;
};
type Opportunity = {
  id: string;
  title: string;
  stage: string;
  amount: number | null;
  expected_close: string | null;
  next_action: string | null;
  next_action_at: string | null;
};
type Activity = {
  id: string;
  type: string;
  summary: string;
  outcome: string | null;
  occurred_at: string;
  due_at: string | null;
  done: boolean;
  created_by: string | null;
};
type Order = { id: string; order_number: string; order_date: string; status: string; total: number };
type Profile = {
  customer: Customer;
  tax: Tax | null;
  contacts: Contact[];
  opportunities: Opportunity[];
  activities: Activity[];
  orders: Order[];
};
type Rep = { id: string; name: string };

/* ------------------------------------------------------------- constantes */
const CRM_STAGES: { v: string; label: string; tone: StatusTone }[] = [
  { v: "lead", label: "Lead", tone: "info" },
  { v: "contato", label: "Em contato", tone: "info" },
  { v: "qualificado", label: "Qualificado", tone: "brand" },
  { v: "cliente", label: "Cliente", tone: "success" },
  { v: "inativo", label: "Inativo", tone: "muted" },
  { v: "perdido", label: "Perdido", tone: "danger" },
];
const OPP_STAGES: Record<string, { label: string; tone: StatusTone }> = {
  novo: { label: "Novo", tone: "info" },
  qualificado: { label: "Qualificado", tone: "brand" },
  proposta: { label: "Proposta", tone: "warning" },
  negociacao: { label: "Negociação", tone: "warning" },
  ganho: { label: "Ganho", tone: "success" },
  perdido: { label: "Perdido", tone: "danger" },
};
const ACT_TYPES: Record<string, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  linkedin: "LinkedIn",
  visita: "Visita",
  reuniao: "Reunião",
  proposta: "Proposta",
  nota: "Nota",
  tarefa: "Tarefa",
};
const REGIMES: Record<string, string> = {
  simples: "Simples Nacional",
  mei: "MEI",
  presumido: "Lucro Presumido",
  real: "Lucro Real",
  pf: "Pessoa física",
  publico: "Órgão público",
  outro: "Outro (não Simples)",
};
const IND_IE: Record<number, string> = {
  1: "Contribuinte de ICMS",
  2: "Contribuinte isento de IE",
  9: "Não contribuinte",
};
const DIFAL: Record<string, { label: string; tone: StatusTone }> = {
  nao_se_aplica: { label: "Sem DIFAL (venda dentro de SP)", tone: "success" },
  emitente_recolhe: { label: "DIFAL por conta da HD (guia antes de emitir)", tone: "warning" },
  destinatario_recolhe_se_uso_consumo: { label: "DIFAL do cliente, se for uso e consumo", tone: "info" },
  definir_uf: { label: "Defina a UF", tone: "danger" },
};
const FALTANDO: Record<string, string> = {
  cnpj_cpf: "CNPJ/CPF",
  uf: "UF",
  cidade: "Cidade",
  cep: "CEP",
  ie_ou_isento: "IE (ou marcar não contribuinte)",
  regime: "Regime tributário",
};

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBr = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR") : "—";
const todayIso = () => new Date().toISOString().slice(0, 10);

/* ----------------------------------------------------------- componentes */
function Field({
  label,
  k,
  form,
  set,
  type = "text",
  placeholder,
  className,
}: {
  label: string;
  k: string;
  form: Record<string, unknown>;
  set: (k: string, v: unknown) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-slate-600">{label}</Label>
      <Input
        type={type}
        value={form[k] == null ? "" : String(form[k])}
        placeholder={placeholder}
        onChange={(e) => set(k, e.target.value)}
        className="mt-1"
      />
    </div>
  );
}

function SelectField({
  label,
  k,
  form,
  set,
  options,
  className,
}: {
  label: string;
  k: string;
  form: Record<string, unknown>;
  set: (k: string, v: unknown) => void;
  options: { v: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-slate-600">{label}</Label>
      <select
        className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
        value={form[k] == null ? "" : String(form[k])}
        onChange={(e) => set(k, e.target.value === "" ? null : e.target.value)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ página */
export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Profile | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [reps, setReps] = useState<Rep[]>([]);
  const [tab, setTab] = useState("dados");

  const load = useCallback(async () => {
    const res = await fetch(`/api/customers/${id}/profile`, { cache: "no-store", credentials: "include" });
    const j = (await res.json().catch(() => ({}))) as Profile & { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro ao carregar cliente");
      return;
    }
    setData(j);
    setForm(j.customer);
    setDirty(false);
  }, [id]);

  useEffect(() => {
    void load();
    void fetch("/api/crm/reps", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { data?: Rep[] }) => setReps(j.data ?? []))
      .catch(() => undefined);
  }, [load]);

  const set = useCallback((k: string, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  }, []);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const changed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        if (JSON.stringify(v ?? null) !== JSON.stringify(data.customer[k] ?? null)) changed[k] = v;
      }
      if (typeof changed.icms_taxpayer === "string") changed.icms_taxpayer = Number(changed.icms_taxpayer);
      if (typeof changed.final_consumer === "string") changed.final_consumer = changed.final_consumer === "true";
      if (!Object.keys(changed).length) {
        setDirty(false);
        return;
      }
      const res = await fetch(`/api/customers/${id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(changed),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao salvar");
      toast.success("Cliente salvo.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  const enrich = async () => {
    setEnriching(true);
    try {
      const res = await fetch("/api/customers/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [id] }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        resultado?: { ok: boolean; campos?: string[]; erro?: string }[];
      };
      const r = j.resultado?.[0];
      if (r?.ok) toast.success(r.campos?.length ? `Completado: ${r.campos.length} campo(s).` : "Nada a completar.");
      else toast.error(r?.erro ?? "Não foi possível consultar o CNPJ.");
      await load();
    } finally {
      setEnriching(false);
    }
  };

  const stage = CRM_STAGES.find((s) => s.v === form.crm_stage);
  const tax = data?.tax;

  if (!data) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A carregar…</span>
      </div>
    );
  }

  return (
    <AppPage
      title={
        <span className="flex flex-wrap items-center gap-2">
          <Link href="/customers" className="text-slate-400 hover:text-slate-700" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {String(form.trade_name || form.name)}
          {stage ? <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge> : null}
        </span>
      }
      description={[form.name, form.document, [form.address_city, form.address_state].filter(Boolean).join("/")]
        .filter(Boolean)
        .join(" · ")}
      density="comfortable"
      width="wide"
      actions={
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void enrich()} disabled={enriching}>
            {enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Completar pelo CNPJ
          </Button>
          <Button type="button" size="sm" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      }
    >
      {/* Resumo fiscal sempre visível */}
      {tax ? (
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="neutral">{IND_IE[tax.ind_ie_dest] ?? "—"}</StatusBadge>
          <StatusBadge tone={DIFAL[tax.difal]?.tone ?? "neutral"}>{DIFAL[tax.difal]?.label ?? tax.difal}</StatusBadge>
          <StatusBadge tone="neutral">CFOP sugerido {tax.cfop_venda_sugerido}</StatusBadge>
          {tax.consumidor_final ? <StatusBadge tone="muted">Consumidor final</StatusBadge> : null}
          {tax.faltando.length ? (
            <StatusBadge tone="danger">Falta: {tax.faltando.map((f) => FALTANDO[f] ?? f).join(", ")}</StatusBadge>
          ) : (
            <StatusBadge tone="success">Cadastro fiscal completo</StatusBadge>
          )}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
          <TabsTrigger value="comercial">Comercial e CRM</TabsTrigger>
          <TabsTrigger value="contatos">Contatos ({data.contacts.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico ({data.activities.length})</TabsTrigger>
          <TabsTrigger value="negocios">
            Negócios ({data.opportunities.length + data.orders.length})
          </TabsTrigger>
        </TabsList>

        {/* ---------------- DADOS ---------------- */}
        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Razão social" k="name" form={form} set={set} className="sm:col-span-2" />
              <Field label="Nome fantasia" k="trade_name" form={form} set={set} />
              <SelectField
                label="Tipo"
                k="person_type"
                form={form}
                set={set}
                options={[
                  { v: "PJ", label: "Pessoa jurídica" },
                  { v: "PF", label: "Pessoa física" },
                ]}
              />
              <Field label="CNPJ / CPF" k="document" form={form} set={set} />
              <Field label="Telefone" k="phone" form={form} set={set} />
              <Field label="E-mail" k="email" form={form} set={set} type="email" className="sm:col-span-2" />
              <Field label="Logradouro" k="address_street" form={form} set={set} className="sm:col-span-2" />
              <Field label="Número" k="address_number" form={form} set={set} />
              <Field label="Complemento" k="address_complement" form={form} set={set} />
              <Field label="Bairro" k="address_neighborhood" form={form} set={set} />
              <Field label="Cidade" k="address_city" form={form} set={set} />
              <Field label="UF" k="address_state" form={form} set={set} placeholder="SP" />
              <Field label="CEP" k="address_zip" form={form} set={set} />
              <div className="sm:col-span-2 lg:col-span-4">
                <Label className="text-xs text-slate-600">Observações</Label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={form.notes == null ? "" : String(form.notes)}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- FISCAL ---------------- */}
        <TabsContent value="fiscal" className="mt-4">
          <Card>
            <CardContent className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Inscrição estadual" k="state_registration" form={form} set={set} placeholder="ou ISENTO" />
              <Field label="Inscrição municipal" k="municipal_registration" form={form} set={set} />
              <SelectField
                label="Regime tributário"
                k="tax_regime"
                form={form}
                set={set}
                options={Object.entries(REGIMES).map(([v, label]) => ({ v, label }))}
              />
              <SelectField
                label="Contribuinte de ICMS (NF-e)"
                k="icms_taxpayer"
                form={form}
                set={set}
                options={[
                  { v: "1", label: "1 · Contribuinte" },
                  { v: "2", label: "2 · Isento de IE" },
                  { v: "9", label: "9 · Não contribuinte" },
                ]}
              />
              <SelectField
                label="Consumidor final"
                k="final_consumer"
                form={form}
                set={set}
                options={[
                  { v: "true", label: "Sim (uso e consumo)" },
                  { v: "false", label: "Não (revenda/industrialização)" },
                ]}
              />
              <Field label="Código IBGE da cidade" k="ibge_city_code" form={form} set={set} />
              <Field label="SUFRAMA" k="suframa" form={form} set={set} />
              <Field label="E-mail para NF" k="invoice_email" form={form} set={set} type="email" />
              <div className="sm:col-span-2 lg:col-span-4">
                <Label className="text-xs text-slate-600">Observações fiscais (vão para o faturamento)</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={form.fiscal_notes == null ? "" : String(form.fiscal_notes)}
                  onChange={(e) => set("fiscal_notes", e.target.value)}
                />
              </div>
              <p className="sm:col-span-2 lg:col-span-4 text-xs text-slate-500">
                Campos vazios são calculados: sem IE → não contribuinte; IE &quot;ISENTO&quot; → isento; com IE → contribuinte.
                Preencha só para forçar outro tratamento.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- COMERCIAL / CRM ---------------- */}
        <TabsContent value="comercial" className="mt-4">
          <Card>
            <CardContent className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                label="Etapa no CRM"
                k="crm_stage"
                form={form}
                set={set}
                options={CRM_STAGES.map((s) => ({ v: s.v, label: s.label }))}
              />
              <SelectField
                label="Vendedor"
                k="sales_rep_id"
                form={form}
                set={set}
                options={reps.map((r) => ({ v: r.id, label: r.name }))}
              />
              <Field label="Segmento" k="segment" form={form} set={set} placeholder="Farmacêutico, hospitalar…" />
              <Field label="Origem do lead" k="lead_source" form={form} set={set} placeholder="Site, LinkedIn, indicação…" />
              <Field label="Próximo contato" k="next_contact_at" form={form} set={set} type="date" />
              <Field label="Próxima ação" k="next_action" form={form} set={set} className="sm:col-span-2" />
              <Field label="Último contato" k="last_contact_at" form={form} set={set} type="date" />
              <Field label="Condição de pagamento padrão" k="default_payment_terms" form={form} set={set} />
              <Field label="Limite de crédito (R$)" k="credit_limit" form={form} set={set} type="number" />
              <Field label="Site" k="website" form={form} set={set} />
              <Field label="LinkedIn" k="linkedin_url" form={form} set={set} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- CONTATOS ---------------- */}
        <TabsContent value="contatos" className="mt-4 space-y-3">
          <ContactsTab customerId={id} contacts={data.contacts} onChange={load} />
        </TabsContent>

        {/* ---------------- HISTÓRICO ---------------- */}
        <TabsContent value="historico" className="mt-4 space-y-3">
          <ActivitiesTab customerId={id} activities={data.activities} onChange={load} />
        </TabsContent>

        {/* ---------------- NEGÓCIOS ---------------- */}
        <TabsContent value="negocios" className="mt-4 space-y-3">
          <OpportunitiesTab customerId={id} opportunities={data.opportunities} onChange={load} />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Pedidos de venda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {data.orders.length === 0 ? <p className="text-slate-500">Nenhum pedido.</p> : null}
              {data.orders.map((o) => (
                <Link
                  key={o.id}
                  href={`/sales/orders/${o.id}`}
                  className="flex justify-between rounded px-2 py-1 hover:bg-slate-50"
                >
                  <span>
                    {o.order_number} · {dateBr(o.order_date)} · {o.status}
                  </span>
                  <span className="font-medium">{brl(o.total)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppPage>
  );
}

/* ------------------------------------------------------- sub-abas (CRUD) */
async function crm(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown) {
  const res = await fetch(`/api/crm/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error ?? "Erro");
  return j;
}

function ContactsTab({
  customerId,
  contacts,
  onChange,
}: {
  customerId: string;
  contacts: Contact[];
  onChange: () => Promise<void>;
}) {
  const empty = { name: "", role: "", email: "", phone: "", whatsapp: "" };
  const [n, setN] = useState(empty);
  const add = async () => {
    if (!n.name.trim()) return toast.error("Informe o nome.");
    try {
      await crm("POST", "contacts", { ...n, customer_id: customerId, is_primary: contacts.length === 0 });
      setN(empty);
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };
  return (
    <>
      <Card>
        <CardContent className="grid gap-2 py-4 sm:grid-cols-6">
          <Input placeholder="Nome" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
          <Input placeholder="Cargo" value={n.role} onChange={(e) => setN({ ...n, role: e.target.value })} />
          <Input placeholder="E-mail" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} />
          <Input placeholder="Telefone" value={n.phone} onChange={(e) => setN({ ...n, phone: e.target.value })} />
          <Input placeholder="WhatsApp" value={n.whatsapp} onChange={(e) => setN({ ...n, whatsapp: e.target.value })} />
          <Button type="button" size="md" onClick={() => void add()}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </CardContent>
      </Card>
      {contacts.map((c) => (
        <Card key={c.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div>
              <p className="font-medium text-slate-900">
                {c.name} {c.role ? <span className="text-slate-500">· {c.role}</span> : null}
              </p>
              <p className="text-slate-600">{[c.email, c.phone, c.whatsapp].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              {c.is_primary ? <StatusBadge tone="brand">Principal</StatusBadge> : null}
              <Button
                type="button"
                size="sm"
                variant={c.is_decision_maker ? "secondary" : "outline"}
                onClick={() => void crm("PATCH", `contacts/${c.id}`, { is_decision_maker: !c.is_decision_maker }).then(onChange)}
              >
                {c.is_decision_maker ? "Decisor ✓" : "Marcar decisor"}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Excluir contato"
                onClick={() => void crm("DELETE", `contacts/${c.id}`).then(onChange)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function ActivitiesTab({
  customerId,
  activities,
  onChange,
}: {
  customerId: string;
  activities: Activity[];
  onChange: () => Promise<void>;
}) {
  const [type, setType] = useState("ligacao");
  const [summary, setSummary] = useState("");
  const [dueAt, setDueAt] = useState("");
  const pending = useMemo(() => activities.filter((a) => !a.done), [activities]);
  const done = useMemo(() => activities.filter((a) => a.done), [activities]);

  const add = async () => {
    if (!summary.trim()) return toast.error("Escreva o resumo.");
    try {
      const isTask = type === "tarefa" || (dueAt && dueAt > todayIso());
      await crm("POST", "activities", {
        customer_id: customerId,
        type,
        summary,
        due_at: dueAt || null,
        done: !isTask,
        created_by: "helder",
      });
      setSummary("");
      setDueAt("");
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <>
      <Card>
        <CardContent className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr_10rem_auto]">
          <select
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {Object.entries(ACT_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <Input placeholder="O que aconteceu / o que fazer" value={summary} onChange={(e) => setSummary(e.target.value)} />
          <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} title="Data (para tarefa futura)" />
          <Button type="button" onClick={() => void add()}>
            <Plus className="h-4 w-4" /> Registrar
          </Button>
        </CardContent>
      </Card>

      {pending.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">A fazer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {pending.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <span>
                  <StatusBadge tone={a.due_at && a.due_at < todayIso() ? "danger" : "warning"}>{dateBr(a.due_at)}</StatusBadge>{" "}
                  {ACT_TYPES[a.type] ?? a.type}: {a.summary}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void crm("PATCH", `activities/${a.id}`, { done: true }).then(onChange)}
                >
                  Concluir
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="py-3">
          {done.length === 0 ? <p className="text-sm text-slate-500">Nenhuma atividade registrada.</p> : null}
          <ol className="relative border-l border-slate-200 ml-2">
            {done.map((a) => (
              <li key={a.id} className="mb-3 ml-4">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-brand-700" />
                <p className="text-xs text-slate-500">
                  {dateBr(a.occurred_at)} · {ACT_TYPES[a.type] ?? a.type}
                  {a.created_by ? ` · ${a.created_by}` : ""}
                </p>
                <p className="text-sm text-slate-800">{a.summary}</p>
                {a.outcome ? <p className="text-xs text-slate-600">{a.outcome}</p> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}

function OpportunitiesTab({
  customerId,
  opportunities,
  onChange,
}: {
  customerId: string;
  opportunities: Opportunity[];
  onChange: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const add = async () => {
    if (!title.trim()) return toast.error("Informe o título.");
    try {
      await crm("POST", "opportunities", {
        customer_id: customerId,
        title,
        amount: amount ? Number(amount.replace(/\./g, "").replace(",", ".")) : null,
      });
      setTitle("");
      setAmount("");
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Oportunidades</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
          <Input placeholder="Ex.: 4 caixas terminais H14 — ampliação sala B" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Valor (R$)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Button type="button" onClick={() => void add()}>
            <Plus className="h-4 w-4" /> Nova
          </Button>
        </div>
        {opportunities.length === 0 ? <p className="text-sm text-slate-500">Nenhuma oportunidade.</p> : null}
        {opportunities.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm">
            <span className="font-medium">{o.title}</span>
            <span className="flex items-center gap-2">
              <span>{brl(o.amount)}</span>
              <select
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
                value={o.stage}
                onChange={(e) => void crm("PATCH", `opportunities/${o.id}`, { stage: e.target.value }).then(onChange)}
              >
                {Object.entries(OPP_STAGES).map(([v, s]) => (
                  <option key={v} value={v}>
                    {s.label}
                  </option>
                ))}
              </select>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
