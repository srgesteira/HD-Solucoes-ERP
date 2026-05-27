"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { usePermissions } from "@/hooks/use-permissions";
import { useMe } from "@/hooks/use-me";

type Employee = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  monthly_salary: number | null;
  work_center_id: string | null;
  department_id: string | null;
  allocation_percentage: number | null;
  admission_date: string | null;
  status: string;
  notes: string | null;
  has_period_allocations?: boolean;
};

type WorkCenter = { id: string; name: string; code: string };
type Department = { id: string; name: string; code: string; is_support: boolean };

function fmtBrl(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export default function HrEmployeesPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const [rows, setRows] = useState<Employee[]>([]);
  const [centers, setCenters] = useState<WorkCenter[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    name: "",
    document: "",
    email: "",
    phone: "",
    position: "",
    monthly_salary: "",
    work_center_id: "",
    department_id: "",
    allocation_percentage: "100",
    admission_date: "",
    status: "active",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employees", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as { data?: Employee[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro");
      setRows(j.data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCenters = useCallback(async () => {
    try {
      const res = await fetch("/api/work-centers", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as { data?: WorkCenter[] };
      if (res.ok) setCenters(j.data ?? []);
    } catch {
      setCenters([]);
    }
  }, []);

  const loadDepartments = useCallback(async () => {
    try {
      const res = await fetch("/api/departments", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as { data?: Department[] };
      if (res.ok) setDepartments(j.data ?? []);
    } catch {
      setDepartments([]);
    }
  }, []);

  useEffect(() => {
    if (!permLoading && !can("hr")) {
      toast.error("Sem acesso ao módulo RH.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, router]);

  useEffect(() => {
    if (permLoading || !can("hr")) return;
    void load();
    void loadCenters();
    void loadDepartments();
  }, [permLoading, can, load, loadCenters, loadDepartments]);

  function openEdit(e: Employee) {
    setEditing(e);
    setForm({
      name: e.name,
      document: e.document ?? "",
      email: e.email ?? "",
      phone: e.phone ?? "",
      position: e.position ?? "",
      monthly_salary:
        e.monthly_salary != null ? String(e.monthly_salary) : "",
      work_center_id: e.work_center_id ?? "",
      department_id: e.department_id ?? "",
      allocation_percentage:
        e.allocation_percentage != null ? String(e.allocation_percentage) : "100",
      admission_date: e.admission_date ?? "",
      status: e.status,
      notes: e.notes ?? "",
    });
  }

  async function save() {
    const body = {
      name: form.name.trim(),
      document: form.document.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      position: form.position.trim() || null,
      monthly_salary:
        form.monthly_salary === "" ? null : parseFloat(form.monthly_salary),
      work_center_id: form.work_center_id || null,
      department_id: form.department_id || null,
      allocation_percentage:
        form.allocation_percentage === ""
          ? 100
          : parseFloat(form.allocation_percentage),
      admission_date: form.admission_date || null,
      status: form.status as "active" | "inactive" | "vacation" | "terminated",
      notes: form.notes.trim() || null,
    };
    if (!body.name) {
      toast.error("Nome é obrigatório.");
      return;
    }
    const url = editing ? `/api/employees/${editing.id}` : "/api/employees";
    const res = await fetch(url, {
      method: editing ? "PUT" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro");
      return;
    }
    toast.success(editing ? "Atualizado." : "Criado.");
    setEditing(null);
    setShowNew(false);
    void load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir colaborador?")) return;
    const res = await fetch(`/api/employees/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro");
      return;
    }
    toast.success("Excluído.");
    void load();
  }

  const centerName = (id: string | null) => {
    if (!id) return "—";
    return centers.find((c) => c.id === id)?.name ?? id;
  };

  const deptName = (id: string | null) => {
    if (!id) return "—";
    return departments.find((d) => d.id === id)?.name ?? id;
  };

  if (permLoading || (!permLoading && !can("hr"))) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Users className="h-7 w-7 text-brand-700" />
            Colaboradores
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Departamento, linha de produção e % de alocação para rateio de MO.
          </p>
        </div>
        <Button type="button" onClick={() => { setShowNew(true); setEditing(null); setForm({
          name: "",
          document: "",
          email: "",
          phone: "",
          position: "",
          monthly_salary: "",
          work_center_id: "",
          department_id: "",
          allocation_percentage: "100",
          admission_date: "",
          status: "active",
          notes: "",
        }); }}>
          <Plus className="h-4 w-4" />
          <span className="ml-1">Novo</span>
        </Button>
      </div>

      {(showNew || editing) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editing ? "Editar colaborador" : "Novo colaborador"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Documento</Label>
              <Input
                value={form.document}
                onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Cargo</Label>
              <Input
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Salário mensal (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.monthly_salary}
                onChange={(e) =>
                  setForm((f) => ({ ...f, monthly_salary: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Departamento</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                value={form.department_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, department_id: e.target.value }))
                }
              >
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                    {d.is_support ? " (apoio)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Linha de produção</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                value={form.work_center_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, work_center_id: e.target.value }))
                }
              >
                <option value="">— (só departamento apoio)</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>% alocação</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.allocation_percentage}
                onChange={(e) =>
                  setForm((f) => ({ ...f, allocation_percentage: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Admissão</Label>
              <Input
                type="date"
                value={form.admission_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, admission_date: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Situação</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="vacation">Férias</option>
                <option value="terminated">Desligado</option>
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>Notas</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowNew(false);
                  setEditing(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={() => void save()}>
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listagem</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2">Nome</th>
                    <th className="text-left px-3 py-2">Cargo</th>
                    <th className="text-left px-3 py-2">Departamento</th>
                    <th className="text-left px-3 py-2">Linha</th>
                    <th className="text-right px-3 py-2">% aloc.</th>
                    <th className="text-left px-3 py-2">Salário</th>
                    <th className="text-left px-3 py-2">Situação</th>
                    <th className="text-right px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {r.name}
                          {r.has_period_allocations ? (
                            <span title="Alocações temporárias por período">
                              <CalendarClock className="h-4 w-4 text-amber-600 shrink-0" />
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2">{r.position ?? "—"}</td>
                      <td className="px-3 py-2">{deptName(r.department_id)}</td>
                      <td className="px-3 py-2">{centerName(r.work_center_id)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.allocation_percentage != null
                          ? `${r.allocation_percentage}%`
                          : "100%"}
                      </td>
                      <td className="px-3 py-2">{fmtBrl(r.monthly_salary)}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2 text-right space-x-2">
                        <Link href={`/hr/employees/${r.id}/edit`}>
                          <Button type="button" size="sm" variant="outline">
                            Editar
                          </Button>
                        </Link>
                        {isAdmin ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-700"
                            onClick={() => void remove(r.id)}
                          >
                            Excluir
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
