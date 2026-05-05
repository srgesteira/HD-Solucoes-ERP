import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
   * O profile pode ainda não existir no Passo 0 (schema só será criado no Passo 2).
   * O shell tolera fullName vazio.
   */
  let fullName = "";
  try {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    fullName = profile?.full_name ?? "";
  } catch {
    /** Tabela user_profiles ainda não criada (Módulo 1, Passo 2). */
  }

  return (
    <AppShell
      user={{
        id: user.id,
        email: user.email ?? "",
        fullName,
      }}
    >
      {children}
    </AppShell>
  );
}
