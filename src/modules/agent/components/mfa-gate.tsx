"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/shared/db/supabase/client";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { LoadingState } from "@/shared/ui/page-helpers";

/** Mesma janela do servidor (src/modules/agent/lib/mfa.ts). */
const JANELA_MIN = 30;

type Estado =
  | { fase: "carregando" }
  | { fase: "ok"; expiraEm: number }
  | { fase: "cadastrar"; factorId: string; qr: string; secret: string }
  | { fase: "codigo"; factorId: string; motivo: string }
  | { fase: "erro"; msg: string };

type Amr = { method?: string; timestamp?: number };

/**
 * Portão de MFA (Google Authenticator / TOTP nativo do Supabase).
 * Primeiro acesso: mostra o QR para cadastrar. Depois: pede o código de 6 dígitos.
 * A sessão de aprovação vale JANELA_MIN minutos; passou disso, pede o código de novo.
 */
export function MfaGate({ children }: { children: (fimDaSessao: Date) => ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const avaliar = useCallback(async () => {
    const sb = createClient();
    if (!sb) return setEstado({ fase: "erro", msg: "Supabase não configurado." });
    const { data: aal, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !aal) return setEstado({ fase: "erro", msg: error?.message ?? "Não foi possível conferir o MFA." });

    const totp = ((aal.currentAuthenticationMethods ?? []) as Array<Amr | string>)
      .filter((m): m is Amr => typeof m === "object" && m !== null && m.method === "totp")
      .map((m) => Number(m.timestamp ?? 0))
      .sort((a, b) => b - a)[0];
    const expiraEm = totp ? (totp + JANELA_MIN * 60) * 1000 : 0;
    if (aal.currentLevel === "aal2" && expiraEm > Date.now() + 15_000) {
      return setEstado({ fase: "ok", expiraEm });
    }

    const { data: fatores, error: e2 } = await sb.auth.mfa.listFactors();
    if (e2) return setEstado({ fase: "erro", msg: e2.message });
    const verificado = fatores?.totp?.find((f) => f.status === "verified");
    if (verificado) {
      return setEstado({
        fase: "codigo",
        factorId: verificado.id,
        motivo: aal.currentLevel === "aal2" ? "A sessão de aprovação passou de 30 minutos." : "Confirme que é você.",
      });
    }

    // Sem autenticador cadastrado: limpa tentativa antiga não confirmada e gera o QR.
    for (const f of fatores?.all ?? []) {
      if (f.factor_type === "totp" && f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: novo, error: e3 } = await sb.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Google Authenticator ${new Date().toISOString().slice(0, 10)}`,
    });
    if (e3 || !novo) return setEstado({ fase: "erro", msg: e3?.message ?? "Não foi possível cadastrar o MFA." });
    setEstado({ fase: "cadastrar", factorId: novo.id, qr: novo.totp.qr_code, secret: novo.totp.secret });
  }, []);

  useEffect(() => {
    void avaliar();
  }, [avaliar]);

  // Quando a janela vence, volta a pedir o código.
  useEffect(() => {
    if (estado.fase !== "ok") return;
    const t = setTimeout(() => void avaliar(), Math.max(1000, estado.expiraEm - Date.now()));
    return () => clearTimeout(t);
  }, [estado, avaliar]);

  async function confirmar() {
    if (estado.fase !== "cadastrar" && estado.fase !== "codigo") return;
    const sb = createClient();
    if (!sb) return;
    setEnviando(true);
    setErro(null);
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: estado.factorId, code: codigo.trim() });
    setEnviando(false);
    if (error) {
      setErro("Código não confere. Confira no app e tente de novo.");
      return;
    }
    setCodigo("");
    await avaliar();
  }

  if (estado.fase === "carregando") return <LoadingState label="Conferindo o acesso…" />;
  if (estado.fase === "erro") {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-red-700">{estado.msg}</CardContent>
      </Card>
    );
  }
  if (estado.fase === "ok") return <>{children(new Date(estado.expiraEm))}</>;

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-brand-700" />
          {estado.fase === "cadastrar" ? "Cadastrar o Google Authenticator" : "Código do autenticador"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {estado.fase === "cadastrar" ? (
          <>
            <p className="text-sm text-slate-600">
              Abra o Google Authenticator, toque em <b>+</b> → <b>Ler código QR</b> e aponte para a imagem abaixo.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={estado.qr} alt="QR do autenticador" className="mx-auto h-48 w-48 rounded border bg-white p-2" />
            <p className="text-center text-xs text-slate-500">
              Sem câmera? Use a chave: <span className="select-all font-mono">{estado.secret}</span>
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-600">{estado.motivo} Digite o código de 6 dígitos do Google Authenticator.</p>
        )}
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && codigo.length === 6) void confirmar();
          }}
          className="w-full rounded-md border border-slate-300 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em]"
          placeholder="000000"
          aria-label="Código de 6 dígitos"
        />
        {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
        <Button className="w-full" size="lg" disabled={codigo.length !== 6 || enviando} onClick={() => void confirmar()}>
          {enviando ? "Conferindo…" : "Confirmar"}
        </Button>
      </CardContent>
    </Card>
  );
}
