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
import {
  DEFAULT_MODULE_PERMISSIONS,
  mergeModulePermissions,
  type ModuleKey,
  type ModulePermissions,
} from "@/shared/auth/permissions";
import type { Json } from "@/modules/core/types/database";

type TenantUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  permissions?: Json | null;
};

const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  boards: "Tarefas",
  logistics: "Logística",
  production: "Produção",
  quality: "Qualidade",
  engineering: "Engenharia",
  purchasing: "Compras",
  sales: "Vendas",
  products: "Produtos",
  inventory: "Estoque",
  mrp: "MRP",
  settings: "Configurações",
  reports: "Relatórios",
  finance: "Financeiro",
  hr: "RH",
};

export default function SettingsUsersPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, ModulePermissions>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (meLoading) return;
    if (me && me.role !== "admin") {
      toast.error("Apenas administradores.");
      router.replace("/settings/profile");
    }
  }, [me, meLoading, router]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/users", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        users?: TenantUser[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao listar");
      const list = (j.users ?? []).filter((u) => u.role !== "admin");
      setUsers(list);
      const d: Record<string, ModulePermissions> = {};
      for (const u of list) {
        d[u.id] = mergeModulePermissions(u.permissions);
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
    if (!meLoading && me?.role === "admin") void loadUsers();
  }, [meLoading, me?.role, loadUsers]);

  function setMod(userId: string, key: ModuleKey, value: boolean) {
    setDraft((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? { ...DEFAULT_MODULE_PERMISSIONS }),
        [key]: value,
      },
    }));
  }

  async function saveUser(userId: string) {
    const perms = draft[userId];
    if (!perms) return;
    setSavingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}/permissions`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: perms }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao gravar");
      toast.success("Permissões actualizadas.");
      await loadUsers();
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
          Utilizadores e permissões
        </h1>
      </div>

      <p className="text-sm text-slate-600">
        Defina o acesso por módulo para cada utilizador do tenant. Administradores não
        aparecem nesta lista; têm sempre acesso total.
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
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(Object.keys(MODULE_LABELS) as ModuleKey[]).map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-brand-700"
                        checked={draft[u.id]?.[key] ?? true}
                        onChange={(e) => setMod(u.id, key, e.target.checked)}
                      />
                      <span>{MODULE_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingId === u.id}
                    onClick={() => void saveUser(u.id)}
                  >
                    {savingId === u.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span className="ml-1">Guardar</span>
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
