"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";

export default function SalesOrderEditPlaceholderPage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { data: me, isLoading } = useMe();

  useEffect(() => {
    if (isLoading) return;
    if (me?.role !== "admin") {
      toast.error("Apenas administradores podem editar pedidos de venda.");
      router.replace(id ? `/sales/orders/${id}` : "/sales/orders");
    }
  }, [id, isLoading, me?.role, router]);

  if (isLoading || !me || me.role !== "admin") {
    return (
      <div className="max-w-lg mx-auto py-16 flex items-center justify-center gap-2 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A verificar permissões…</span>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => router.push(`/sales/orders/${id}`)}
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao pedido
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Editar pedido de venda
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>
            O formulário de edição completo será disponibilizado numa próxima
            iteração. Por agora pode consultar o pedido na página de detalhes.
          </p>
          <Link
            href={`/sales/orders/${id}`}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium",
              "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 dark:bg-slate-950 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-900"
            )}
          >
            Ver detalhes
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
