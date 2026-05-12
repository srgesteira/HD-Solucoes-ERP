"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Indique o e-mail da conta.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      toast.error("Supabase não configurado neste ambiente.");
      return;
    }
    setLoading(true);
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${origin}/auth/callback?next=/update-password`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(
        "Se existir uma conta com este e-mail, receberá um link para redefinir a senha."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-6 py-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Recuperar senha
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Enviaremos um link seguro para o seu e-mail (válido por tempo limitado).
        </p>
      </div>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@empresa.com.br"
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "A enviar…" : "Enviar link de recuperação"}
        </Button>
      </form>
      <p className="text-center text-sm text-slate-600">
        <Link href="/login" className="text-brand-700 hover:underline">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
