"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function stripCredentialsFromUrlOnce(router: ReturnType<typeof useRouter>) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const hasPassword = params.has("password");
  const hasEmail = params.has("email");
  if (!hasPassword && !hasEmail) return;
  params.delete("email");
  params.delete("password");
  const qs = params.toString();
  router.replace(qs ? `/login?${qs}` : "/login", { scroll: false });
  if (hasPassword) {
    toast.error(
      "A senha não deve ir no endereço do browser. Faça login de novo apenas pelo formulário."
    );
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  /** Erro vindo de redirect (?error=credenciais) — lido uma vez. */
  useEffect(() => {
    if (searchParams.get("error") === "credenciais") {
      setErrorMsg("Email ou senha incorretos.");
    }
  }, [searchParams]);

  /**
   * GET com email/senha na URL: limpar sem depender de `searchParams` a cada render
   * (evita re-execuções com Next 15/16 que poderiam atrapalhar).
   */
  useEffect(() => {
    stripCredentialsFromUrlOnce(router);
  }, [router]);

  function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void runLogin(e.currentTarget);
  }

  async function runLogin(form: HTMLFormElement) {
    const fd = new FormData(form);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");

    if (!email || !password) {
      setErrorMsg("Preencha email e senha.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const supabase = createClient();
      if (!supabase) {
        setErrorMsg(
          "Supabase ainda não foi configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local."
        );
        return;
      }

      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signErr) {
        setErrorMsg(
          signErr.message === "Invalid login credentials"
            ? "Email ou senha incorretos."
            : signErr.message
        );
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setErrorMsg(
          "Sessão não foi criada. Actualize a página, confirme o Supabase Auth e tente de novo."
        );
        return;
      }

      toast.success("Bem-vindo!");
      /**
       * Navegação completa garante que o middleware vê os cookies `sb-*` no próximo pedido.
       * Só `router.push` em cliente por vezes chega antes da persistência visível ao servidor.
       */
      window.location.assign("/boards");
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Não foi possível entrar. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form method="post" onSubmit={onFormSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div>
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {errorMsg ? (
        <p className="text-sm text-red-600" role="alert">
          {errorMsg}
        </p>
      ) : null}

      <Button type="submit" disabled={loading} className="w-full" size="lg">
        {loading ? "Entrando…" : "Entrar"}
      </Button>

      <p className="text-xs text-slate-500 text-center pt-2">
        Use a conta criada no Supabase Auth do projeto{" "}
        <code className="font-mono">erp-hd-solucoes</code>.
      </p>
    </form>
  );
}
