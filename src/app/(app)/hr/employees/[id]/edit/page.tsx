"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { BrDateInput } from "@/shared/ui/br-date-input";
import { Label } from "@/shared/ui/label";
import { AppPage } from "@/shared/ui/app-page";
import { LoadingState } from "@/shared/ui/page-helpers";
import { usePermissions } from "@/hooks/use-permissions";

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
};

type Allocation = {
  id: string;
  work_center_id: string | null;
  department_id: string | null;
  allocation_percentage: number;
  start_date: string;
  end_date: string | null;
};

type WorkCenter = { id: string; name: string; code: string };
type Department = { id: string; name: string; code: string };

const emptyAlloc = {
  work_center_id: "",
  department_id: "",
  allocation_percentage: "100",
  start_date: "",
  end_date: "",
};

export default function EditEmployeePage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();

  const [loading, setLoading] = useState(true);
  const [centers, setCenters] = useState<WorkCenter[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [showAllocForm, setShowAllocForm] = useState(false);
  const [allocForm, setAllocForm] = useState(emptyAlloc);
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
    if (!id) return;
    setLoading(true);
    try {
      const [empRes, allocRes, wcRes, deptRes] = await Promise.all([
        fetch(`/api/employees/${id}`, { credentials: "include", cache: "no-store" }),
        fetch(`/api/employees/${id}/allocations`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/work-centers", { credentials: "include", cache: "no-store" }),
        fetch("/api/departments", { credentials: "include", cache: "no-store" }),
      ]);
      const empJ = (await empRes.json()) as { data?: Employee; error?: string };
      const allocJ = (await allocRes.json()) as {
        data?: Allocation[];
        error?: string;
      };
      const wcJ = (await wcRes.json()) as { data?: WorkCenter[] };
      const deptJ = (await deptRes.json()) as { data?: Department[] };

      if (!empRes.ok) throw new Error(empJ.error ?? "Erro");
      const e = empJ.data!;
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
          e.allocation_percentage != null
            ? String(e.allocation_percentage)
            : "100",
        admission_date: e.admission_date ?? "",
        status: e.status,
        notes: e.notes ?? "",
      });
      if (!allocRes.ok) throw new Error(allocJ.error ?? "Erro alocações");
      setAllocations(allocJ.data ?? []);
      if (wcRes.ok) setCenters(wcJ.data ?? []);
      if (deptRes.ok) setDepartments(deptJ.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!permLoading && !can("hr")) {
      toast.error("Sem acesso ao módulo RH.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, router]);

  useEffect(() => {
    if (permLoading || !can("hr")) return;
    void load();
  }, [permLoading, can, load]);

  async function saveEmployee() {
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
      status: form.status,
      notes: form.notes.trim() || null,
    };
    const res = await fetch(`/api/employees/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro");
      return;
    }
    toast.success("Dados guardados.");
  }

  async function addAllocation() {
    if (!allocForm.start_date) {
      toast.error("Data início é obrigatória.");
      return;
    }
    const res = await fetch(`/api/employees/${id}/allocations`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        work_center_id: allocForm.work_center_id || null,
        department_id: allocForm.department_id || null,
        allocation_percentage: parseFloat(allocForm.allocation_percentage),
        start_date: allocForm.start_date,
        end_date: allocForm.end_date || null,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro");
      return;
    }
    toast.success("Alocação adicionada.");
    setShowAllocForm(false);
    setAllocForm(emptyAlloc);
    void load();
  }

  async function removeAllocation(allocId: string) {
    if (!confirm("Remover esta alocação temporária?")) return;
    const res = await fetch(`/api/employees/${id}/allocations/${allocId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro");
      return;
    }
    toast.success("Removida.");
    void load();
  }

  const wcName = (wcId: string | null) =>
    wcId ? centers.find((c) => c.id === wcId)?.name ?? wcId : "—";
  const deptName = (dId: string | null) =>
    dId ? departments.find((d) => d.id === dId)?.name ?? dId : "—";

  if (permLoading || loading) {
    return <LoadingState label="A carregar…" />;
  }

  return (
    <AppPage
      title="Editar colaborador"
      description={form.name}
      backHref="/hr/employees"
      width="narrow"
      density="comfortable"
    >

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados principais</CardTitle>
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
            <Label>Departamento (padrão)</Label>
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
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Linha padrão</Label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
              value={form.work_center_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, work_center_id: e.target.value }))
              }
            >
              <option value="">—</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>% alocação padrão</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.allocation_percentage}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  allocation_percentage: e.target.value,
                }))
              }
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="button" onClick={() => void saveEmployee()}>
              Salvar dados
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Alocações por período
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Usadas no cálculo de MO com prorrateio por dias no mês. Sem
              registos, aplica-se a alocação padrão acima.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowAllocForm(true)}
          >
            <Plus className="h-4 w-4" />
            <span className="ml-1">Nova</span>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAllocForm ? (
            <div className="grid sm:grid-cols-2 gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
              <div className="space-y-1">
                <Label>Início *</Label>
                <BrDateInput
                  value={allocForm.start_date || null}
                  onChange={(iso) =>
                    setAllocForm((f) => ({ ...f, start_date: iso ?? "" }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Fim</Label>
                <BrDateInput
                  value={allocForm.end_date || null}
                  onChange={(iso) =>
                    setAllocForm((f) => ({ ...f, end_date: iso ?? "" }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Linha</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                  value={allocForm.work_center_id}
                  onChange={(e) =>
                    setAllocForm((f) => ({
                      ...f,
                      work_center_id: e.target.value,
                    }))
                  }
                >
                  <option value="">—</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Departamento</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                  value={allocForm.department_id}
                  onChange={(e) =>
                    setAllocForm((f) => ({
                      ...f,
                      department_id: e.target.value,
                    }))
                  }
                >
                  <option value="">—</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>%</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={allocForm.allocation_percentage}
                  onChange={(e) =>
                    setAllocForm((f) => ({
                      ...f,
                      allocation_percentage: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex items-end gap-2">
                <Button type="button" onClick={() => void addAllocation()}>
                  Guardar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAllocForm(false);
                    setAllocForm(emptyAlloc);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}

          {allocations.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              Nenhuma alocação temporária.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2">Período</th>
                    <th className="text-left px-3 py-2">Linha</th>
                    <th className="text-left px-3 py-2">Depto</th>
                    <th className="text-right px-3 py-2">%</th>
                    <th className="text-right px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">
                        {a.start_date}
                        {a.end_date ? ` → ${a.end_date}` : " → …"}
                      </td>
                      <td className="px-3 py-2">{wcName(a.work_center_id)}</td>
                      <td className="px-3 py-2">{deptName(a.department_id)}</td>
                      <td className="px-3 py-2 text-right">
                        {a.allocation_percentage}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-red-700"
                          onClick={() => void removeAllocation(a.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppPage>
  );
}
