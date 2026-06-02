"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/shared/ui/button";

function ActivateForm() {
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash")?.trim() ?? "";
  const type = searchParams.get("type")?.trim() || "invite";

  if (!tokenHash) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-600">
          Link inválido ou incompleto. Peça ao administrador um novo link de ativação.
        </p>
        <Link href="/login" className="text-sm text-brand-700 hover:underline">
          Voltar ao login
        </Link>
      </div>
    );
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
      <form action="/activate" method="POST" className="space-y-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <Button type="submit" className="w-full">
          Continuar para definir senha
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
