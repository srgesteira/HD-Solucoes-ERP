"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";

export default function SalesOrderNewPlaceholderPage() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();

  useEffect(() => {
    if (isLoading) return;
    if (me?.role !== "admin") {
      toast.error("Apenas administradores podem criar pedidos de venda.");
      router.replace("/sales/orders");
    }
  }, [isLoading, me?.role, router]);

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
        onClick={() => router.push("/sales/orders")}
      >
        <ArrowLeft className="h-4 w-4" />
        Lista de pedidos
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Novo pedido de venda
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>
            A criação directa pelo formulário ainda não está disponível nesta
            versão. Pode criar pedidos através da conversão de um orçamento
            aprovado.
          </p>
          <Link
            href="/sales/quotes"
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium",
              "bg-brand-700 text-white hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
            )}
          >
            Ir para orçamentos
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
