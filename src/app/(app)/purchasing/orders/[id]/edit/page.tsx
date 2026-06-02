"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** Redireciona para a página única do pedido (visualização + edição inline). */
export default function EditPurchaseOrderRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.id;
  const id =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

  useEffect(() => {
    if (id) router.replace(`/purchasing/orders/${id}`);
    else router.replace("/purchasing/orders");
  }, [id, router]);

  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      A redireccionar…
    </div>
  );
}
