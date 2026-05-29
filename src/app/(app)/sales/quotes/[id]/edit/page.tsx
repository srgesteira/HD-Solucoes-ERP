"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** Redireciona para a página única do orçamento (edição + acções no mesmo ecrã). */
export default function QuoteEditRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  useEffect(() => {
    if (id) router.replace(`/sales/quotes/${id}`);
  }, [id, router]);

  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
      <Loader2 className="h-5 w-5 animate-spin" />
      A redireccionar…
    </div>
  );
}
