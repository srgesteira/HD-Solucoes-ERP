import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { WorkCentersAdmin } from "@/components/settings/work-centers-admin";
import { AppPage } from "@/shared/ui/app-page";

export const metadata: Metadata = {
  title: "Centros de trabalho",
};

export const dynamic = "force-dynamic";

export default async function WorkCentersSettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <AppPage
      title="Centros de trabalho"
      description="Cadastro de linhas, horas padrão e custo de mão de obra (directo + rateio dos departamentos de apoio)."
      density="comfortable"
    >
      <WorkCentersAdmin />
    </AppPage>
  );
}
