import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

export const dynamic = "force-dynamic";

function LoginFormFallback() {
  return (
    <p className="text-sm text-slate-500 text-center py-4">Carregando…</p>
  );
}

export default function LoginPage() {
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
      <div className="text-center mb-6">
        <p className="text-xs font-semibold tracking-widest text-brand-700 uppercase">
          HD Soluções Industriais
        </p>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">ERP HD</h1>
        <p className="text-sm text-slate-500 mt-1">
          Acesso à plataforma corporativa
        </p>
      </div>

      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>

      <p className="text-center mt-4">
        <Link
          href="/reset-password"
          className="text-sm text-slate-500 hover:text-brand-700"
        >
          Esqueceu sua senha?
        </Link>
      </p>

      <p className="text-center text-xs text-slate-500 mt-4">
        <Link href="/privacy" className="text-brand-700 hover:underline">
          Política de privacidade (LGPD)
        </Link>
      </p>
    </div>
  );
}
