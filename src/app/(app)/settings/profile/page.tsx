import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";
import { StatusBadge } from "@/shared/ui/page-helpers";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export const metadata: Metadata = {
  title: "Perfil",
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("email, full_name, role, tenant_id, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AppPage title="Meu perfil" width="narrow" density="comfortable">
      <Card>
        <CardHeader>
          <CardTitle>Conta</CardTitle>
          <CardDescription>
            Edição do perfil será adicionada em um sprint posterior.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-y-3 text-sm">
            <dt className="text-slate-500">Email</dt>
            <dd className="sm:col-span-2 text-slate-900">{user.email}</dd>

            <dt className="text-slate-500">Nome</dt>
            <dd className="sm:col-span-2 text-slate-900">
              {profile?.full_name ?? "—"}
            </dd>

            <dt className="text-slate-500">Papel</dt>
            <dd className="sm:col-span-2">
              <StatusBadge tone="brand">{profile?.role ?? "—"}</StatusBadge>
            </dd>

            <dt className="text-slate-500">Tenant ID</dt>
            <dd className="sm:col-span-2 text-slate-700 font-mono text-xs">
              {profile?.tenant_id ?? "—"}
            </dd>

            <dt className="text-slate-500">User ID</dt>
            <dd className="sm:col-span-2 text-slate-700 font-mono text-xs">
              {user.id}
            </dd>
          </dl>
        </CardContent>
      </Card>
    </AppPage>
  );
}
