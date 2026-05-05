import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Layout do app autenticado.
 *
 * No Passo 0 ainda não existe a tabela `user_profiles` (será criada no Passo 2).
 * Por isso, derivamos o nome a exibir do `user_metadata` quando presente, ou
 * caímos no email. A partir do Passo 2 este layout passará a buscar o profile
 * completo na tabela `user_profiles`.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "";

  return (
    <AppShell
      user={{
        id: user.id,
        email: user.email ?? "",
        fullName: metadataName,
      }}
    >
      {children}
    </AppShell>
  );
}
