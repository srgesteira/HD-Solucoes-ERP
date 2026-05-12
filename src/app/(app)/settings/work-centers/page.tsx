import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WorkCentersAdmin } from "@/components/settings/work-centers-admin";

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
    redirect("/boards");
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">
        Centros de trabalho
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        Cadastre máquinas, linhas ou equipas com custo-hora e eficiência — usados nas
        listas de materiais com mão-de-obra.
      </p>
      <WorkCentersAdmin />
    </div>
  );
}
