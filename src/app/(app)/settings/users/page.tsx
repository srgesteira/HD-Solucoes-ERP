"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { useMe } from "@/hooks/use-me";
import { APP_MODULE_KEYS } from "@/shared/auth/menu-modules";

type TenantUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  enabled_modules?: string[] | null;
  role_keys?: string[] | null;
};

type RoleRow = {
  role_key: string;
  role_name: string;
  module_keys: string[] | null;
};

const MODULE_LABELS: Record<string, string> = {
  core: "Núcleo",
  engenharia: "Engenharia",
  vendas: "Vendas",
  faturamento: "Faturamento",
  compras: "Compras",
  pcp: "PCP",
  almoxarifado: "Almoxarifado",
  expedicao: "Expedição",
  producao: "Produção",
  qualidade: "Qualidade",
  rh: "RH",
  boards: "Quadros / Tarefas",
};

export default function SettingsUsersPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<
    Record<string, { modules: string[]; adminAll: boolean }>
  >({});
  const [rolePick, setRolePick] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (meLoading) return;
    if (me && me.role !== "admin") {
      toast.error("Apenas administradores.");
      router.replace("/settings/profile");
    }
  }, [me, meLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        fetch("/api/tenant/users", { credentials: "include", cache: "no-store" }),
        fetch("/api/role-permissions", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const uJson = (await uRes.json().catch(() => ({}))) as {
        users?: TenantUser[];
        error?: string;
      };
      const rJson = (await rRes.json().catch(() => ({}))) as {
        roles?: RoleRow[];
        error?: string;
      };
      if (!uRes.ok) throw new Error(uJson.error ?? "Erro ao listar utilizadores");
      if (!rRes.ok) throw new Error(rJson.error ?? "Erro ao listar cargos");

      const list = (uJson.users ?? []).filter((u) => u.role !== "admin");
      setUsers(list);
      setRoles(rJson.roles ?? []);

      const d: Record<string, { modules: string[]; adminAll: boolean }> = {};
      for (const u of list) {
        const mods = u.enabled_modules ?? [];
        d[u.id] = {
          adminAll: mods.includes("*"),
          modules: mods.includes("*") ? [...APP_MODULE_KEYS] : [...mods],
        };
      }
      setDraft(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!meLoading && me?.role === "admin") void load();
  }, [meLoading, me?.role, load]);

  function toggleModule(userId: string, key: string, checked: boolean) {
    setDraft((prev) => {
      const cur = prev[userId] ?? { modules: [], adminAll: false };
      const set = new Set(cur.modules);
      if (checked) set.add(key);
      else set.delete(key);
      return {
        ...prev,
        [userId]: { adminAll: false, modules: [...set] },
      };
    });
  }

  function setAdminAll(userId: string, checked: boolean) {
    setDraft((prev) => ({
      ...prev,
      [userId]: {
        adminAll: checked,
        modules: checked ? [...APP_MODULE_KEYS] : [],
      },
    }));
  }

  async function saveModules(userId: string) {
    const d = draft[userId];
    if (!d) return;
    setSavingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}/module-access`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          d.adminAll
            ? { admin_all: true }
            : { enabled_modules: d.modules }
        ),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao gravar");
      toast.success("Acesso ao menu actualizado.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingId(null);
    }
  }

  async function applyRole(userId: string) {
    const roleKey = rolePick[userId];
    if (!roleKey) {
      toast.error("Seleccione um cargo R2.");
      return;
    }
    setSavingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}/module-access`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_key: roleKey }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao aplicar cargo");
      toast.success("Perfil R2 aplicado — módulos actualizados.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingId(null);
    }
  }

  if (meLoading || (me && me.role !== "admin")) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar permissões…</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/settings/profile"
          className="text-sm text-brand-700 hover:underline"
        >
          Configurações
        </Link>
        <span className="text-slate-400">/</span>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Users className="h-7 w-7 text-brand-700" aria-hidden />
          Utilizadores e módulos
        </h1>
      </div>

      <p className="text-sm text-slate-600">
        Defina quais blocos do ERP aparecem no menu lateral de cada utilizador.
        Administradores do sistema têm sempre acesso total.
      </p>

      {loading ? (
        <div className="flex justify-center py-12 text-slate-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-slate-600">
            Nenhum utilizador membro encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {users.map((u) => (
            <Card key={u.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {u.full_name?.trim() || u.email}
                </CardTitle>
                <p className="text-xs text-slate-500">{u.email}</p>
                {u.role_keys?.length ? (
                  <p className="text-xs text-slate-400 mt-1">
                    Cargos: {u.role_keys.join(", ")}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor={`role-${u.id}`}>Aplicar perfil R2</Label>
                    <select
                      id={`role-${u.id}`}
                      className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                      value={rolePick[u.id] ?? ""}
                      onChange={(e) =>
                        setRolePick((p) => ({
                          ...p,
                          [u.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">— Seleccionar cargo —</option>
                      {roles.map((r) => (
                        <option key={r.role_key} value={r.role_key}>
                          {r.role_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingId === u.id}
                    onClick={() => void applyRole(u.id)}
                  >
                    Aplicar cargo
                  </Button>
                </div>

                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-brand-700"
                    checked={draft[u.id]?.adminAll ?? false}
                    onChange={(e) => setAdminAll(u.id, e.target.checked)}
                  />
                  Admin (acesso a todos os módulos)
                </label>

                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {APP_MODULE_KEYS.map((key) => (
                    <label
                      key={key}
                      className={`flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 ${
                        draft[u.id]?.adminAll ? "opacity-60 pointer-events-none" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-brand-700"
                        checked={
                          draft[u.id]?.adminAll ||
                          (draft[u.id]?.modules.includes(key) ?? false)
                        }
                        disabled={draft[u.id]?.adminAll}
                        onChange={(e) =>
                          toggleModule(u.id, key, e.target.checked)
                        }
                      />
                      <span>{MODULE_LABELS[key] ?? key}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingId === u.id}
                    onClick={() => void saveModules(u.id)}
                  >
                    {savingId === u.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span className="ml-1">Guardar módulos</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
