"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      toast.error("Supabase não configurado.");
      return;
    }
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        toast.error("Sessão inválida ou link expirado. Solicite um novo e-mail.");
        router.replace("/reset-password");
        return;
      }
      setReady(true);
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("A confirmação não coincide com a nova senha.");
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Senha actualizada. Já pode entrar.");
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-sm py-12 text-center text-sm text-slate-600">
        A validar link…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-6 py-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Nova senha</h1>
        <p className="text-sm text-slate-600 mt-1">
          Defina uma senha forte para a sua conta.
        </p>
      </div>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Nova senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "A gravar…" : "Guardar nova senha"}
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
