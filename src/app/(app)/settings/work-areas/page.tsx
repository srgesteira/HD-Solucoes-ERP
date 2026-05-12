import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WorkAreasAdmin } from "@/components/settings/work-areas-admin";

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
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">
        Áreas / centros de custo
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        Catálogo por empresa: classifique tarefas para futuros levantamentos de esforço ou horas por
        área.
      </p>
      <WorkAreasAdmin />
    </div>
  );
}
