"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/shared/db/supabase/client";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

export default function SetPasswordPage() {
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
        toast.error("Sessão inválida ou link expirado. Solicite um novo convite.");
        router.replace("/login");
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
      toast.error("A confirmação não coincide com a senha.");
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
      toast.success("Senha definida. Bem-vindo!");
      router.replace("/home");
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
        <h1 className="text-xl font-semibold text-slate-900">Definir senha</h1>
        <p className="text-sm text-slate-600 mt-1">
          Crie uma senha para ativar seu acesso ao ERP.
        </p>
      </div>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
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
          {loading ? "A gravar…" : "Guardar senha"}
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

