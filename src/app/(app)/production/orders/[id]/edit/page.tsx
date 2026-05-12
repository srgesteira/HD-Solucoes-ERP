"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EditProductionOrderPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : params.id?.[0];

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href={id ? `/production/orders/${id}` : "/production/orders"}>
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Voltar
          </Button>
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">
          Editar pedido
          {id ? (
            <span className="ml-2 font-mono text-slate-600 text-base">
              {id.slice(0, 8)}…
            </span>
          ) : null}
        </h1>
      </div>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Em desenvolvimento</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            O formulário de edição será implementado em seguida.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
