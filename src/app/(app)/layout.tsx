import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { MeBootstrapProvider } from "@/contexts/me-bootstrap";
import type { MeResponse } from "@/hooks/use-me";
import { effectivePermissions } from "@/shared/auth/permissions";
import { normalizeEnabledModules } from "@/shared/auth/menu-modules";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  /**
   * Buscar o profile (criado pelo trigger handle_new_user no signup).
   * Tolera profile ausente: o user logado é convidado a refazer login para
   * disparar o trigger.
   */
  const { loadProfileAccess } = await import("@/modules/core/lib/profile-access");
  const profile = await loadProfileAccess(user.id);

  const fallbackName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "";

  const tenantRole =
    profile?.role === "admin" || profile?.role === "member"
      ? profile.role
      : "member";

  const initialMe: MeResponse = {
    id: user.id,
    email: profile?.email ?? user.email ?? "",
    full_name: profile?.full_name ?? fallbackName,
    role: tenantRole,
    permissions: effectivePermissions(tenantRole, profile?.permissions),
    enabled_modules: normalizeEnabledModules(
      profile?.enabled_modules ?? null,
      tenantRole
    ),
    role_keys: profile?.role_keys ?? [],
  };

  return (
    <QueryProvider>
      <MeBootstrapProvider value={initialMe}>
        <AppShell
          user={{
            id: user.id,
            email: user.email ?? "",
            fullName: profile?.full_name ?? fallbackName,
            tenantRole,
          }}
        >
          {children}
        </AppShell>
      </MeBootstrapProvider>
    </QueryProvider>
  );
}
