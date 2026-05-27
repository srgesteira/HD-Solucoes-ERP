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
    redirect("/dashboard");
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Centros de trabalho
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Cadastro de linhas, horas padrão e custo de mão de obra (directo +
          rateio dos departamentos de apoio).
        </p>
      </div>
      <WorkCentersAdmin />
    </div>
  );
}
