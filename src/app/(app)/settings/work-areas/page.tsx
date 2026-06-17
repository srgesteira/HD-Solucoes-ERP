import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { WorkAreasAdmin } from "@/components/settings/work-areas-admin";
import { AppPage } from "@/shared/ui/app-page";

export const metadata: Metadata = {
  title: "Áreas / centros de custo",
};

export const dynamic = "force-dynamic";

export default async function WorkAreasSettingsPage() {
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
    redirect("/boards");
  }

  return (
    <AppPage
      title="Áreas / centros de custo"
      description="Catálogo por empresa: classifique tarefas para futuros levantamentos de esforço ou horas por área."
      width="narrow"
      density="comfortable"
    >
      <WorkAreasAdmin />
    </AppPage>
  );
}
