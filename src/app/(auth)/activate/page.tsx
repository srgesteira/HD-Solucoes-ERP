"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { toast } from "sonner";
import { createClient } from "@/shared/db/supabase/client";
import { Button } from "@/shared/ui/button";

function ActivateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash")?.trim() ?? "";
  const type = (searchParams.get("type")?.trim() || "invite") as EmailOtpType;
  const [loading, setLoading] = useState(false);

  if (!tokenHash) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-600">
          Link inválido ou incompleto. Peça ao administrador um novo link de
          ativação.
        </p>
        <Link href="/login" className="text-sm text-brand-700 hover:underline">
          Voltar ao login
        </Link>
      </div>
    );
  }

  async function onActivate() {
    const supabase = createClient();
    if (!supabase) {
      toast.error("Supabase não configurado.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (error) {
        toast.error(
          "Link inválido ou expirado. Peça um novo link e abra-o directamente no browser (evite pré-visualizações em WhatsApp/Slack)."
        );
        return;
      }

      await fetch("/api/auth/sync-profile", {
        method: "POST",
        credentials: "include",
      }).catch(() => null);

      router.replace("/set-password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Ativar acesso</h1>
        <p className="text-sm text-slate-600 mt-1">
          Clique no botão abaixo para validar o convite e definir a sua senha.
          Não partilhe este link em chats — pré-visualizações podem invalidá-lo.
        </p>
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={loading}
        onClick={() => void onActivate()}
      >
        {loading ? "A validar…" : "Continuar para definir senha"}
      </Button>
      <p className="text-center text-sm text-slate-600">
        <Link href="/login" className="text-brand-700 hover:underline">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <div className="mx-auto w-full max-w-sm py-8">
      <Suspense
        fallback={
          <p className="text-sm text-slate-600 text-center">A carregar…</p>
        }
      >
        <ActivateForm />
      </Suspense>
    </div>
  );
}
