"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { useMe } from "@/hooks/use-me";
import { APP_MODULE_KEYS } from "@/shared/auth/menu-modules";

type TenantUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active?: boolean | null;
  enabled_modules?: string[] | null;
  role_keys?: string[] | null;
  status?: "active" | "invite_pending" | "suspended";
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRoleKey, setInviteRoleKey] = useState("");
  const [inviteAdminAll, setInviteAdminAll] = useState(false);
  const [inviteModules, setInviteModules] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [activationLink, setActivationLink] = useState<string | null>(null);
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

  async function sendInvite() {
    const email = inviteEmail.trim();
    if (!email) {
      toast.error("Informe o e-mail.");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/tenant/users/invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          inviteAdminAll
            ? {
                email,
                admin_all: true,
                role_key: inviteRoleKey || undefined,
                full_name: inviteName || undefined,
              }
            : {
                email,
                enabled_modules: inviteModules,
                role_key: inviteRoleKey || undefined,
                full_name: inviteName || undefined,
              }
        ),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        activation_link?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao convidar");
      if (!j.activation_link) throw new Error("Link de ativação não gerado.");
      setActivationLink(j.activation_link);
      toast.success("Link de ativação gerado.");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRoleKey("");
      setInviteAdminAll(false);
      setInviteModules([]);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setInviting(false);
    }
  }

  async function resendInvite(userId: string) {
    try {
      const res = await fetch("/api/tenant/users/resend-invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        activation_link?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao reenviar");
      if (!j.activation_link) throw new Error("Link não gerado.");
      setActivationLink(j.activation_link);
      toast.success("Novo link gerado.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function setSuspended(userId: string, active: boolean) {
    try {
      const res = await fetch(`/api/tenant/users/${userId}/ban`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro");
      toast.success(active ? "Utilizador reativado." : "Utilizador suspenso.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
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
        <Button
          type="button"
          className="ml-auto"
          onClick={() => setInviteOpen((v) => !v)}
        >
          Convidar usuário
        </Button>
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
          {activationLink ? (
            <Card>
              <CardHeader>
                <CardTitle>Link de ativação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">
                  Copie e envie para o usuário (WhatsApp, etc.). O link expira; se
                  expirar, gere um novo.
                </p>
                <Input value={activationLink} readOnly />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(activationLink)
                        .then(() => toast.success("Link copiado."))
                        .catch(() => toast.error("Falha ao copiar."));
                    }}
                  >
                    Copiar link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActivationLink(null)}
                  >
                    Fechar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {inviteOpen ? (
            <Card>
              <CardHeader>
                <CardTitle>Convidar usuário</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="invite_email">E-mail</Label>
                    <Input
                      id="invite_email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="nome@empresa.com.br"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite_name">Nome (opcional)</Label>
                    <Input
                      id="invite_name"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Nome completo"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="invite_role">Cargo R2 (opcional)</Label>
                    <select
                      id="invite_role"
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                      value={inviteRoleKey}
                      onChange={(e) => setInviteRoleKey(e.target.value)}
                    >
                      <option value="">(sem cargo)</option>
                      {roles.map((r) => (
                        <option key={r.role_key} value={r.role_key}>
                          {r.role_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Modo</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="invite_admin_all"
                        type="checkbox"
                        checked={inviteAdminAll}
                        onChange={(e) => setInviteAdminAll(e.target.checked)}
                      />
                      <Label htmlFor="invite_admin_all">Acesso total (*)</Label>
                    </div>
                  </div>
                </div>

                {!inviteAdminAll ? (
                  <div className="space-y-2">
                    <Label>Módulos</Label>
                    <div className="grid gap-2 md:grid-cols-3">
                      {APP_MODULE_KEYS.map((k) => (
                        <label
                          key={k}
                          className="flex items-center gap-2 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={inviteModules.includes(k)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setInviteModules((prev) => {
                                const set = new Set(prev);
                                if (checked) set.add(k);
                                else set.delete(k);
                                return [...set];
                              });
                            }}
                          />
                          <span>{MODULE_LABELS[k] ?? k}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void sendInvite()}
                    disabled={inviting}
                  >
                    {inviting ? "A enviar…" : "Enviar convite"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setInviteOpen(false)}
                    disabled={inviting}
                  >
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {users.map((u) => (
            <Card key={u.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {u.full_name?.trim() || u.email}
                </CardTitle>
                <p className="text-xs text-slate-500">{u.email}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Estado:{" "}
                  <span className="font-medium">
                    {u.status === "invite_pending"
                      ? "Convite pendente"
                      : u.status === "suspended"
                        ? "Suspenso"
                        : "Ativo"}
                  </span>
                </p>
                {u.role_keys?.length ? (
                  <p className="text-xs text-slate-400 mt-1">
                    Cargos: {u.role_keys.join(", ")}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {u.status === "invite_pending" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void resendInvite(u.id)}
                    >
                      Gerar novo link
                    </Button>
                  ) : null}
                  {u.status === "suspended" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void setSuspended(u.id, true)}
                    >
                      Reativar
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void setSuspended(u.id, false)}
                    >
                      Suspender
                    </Button>
                  )}
                </div>

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
