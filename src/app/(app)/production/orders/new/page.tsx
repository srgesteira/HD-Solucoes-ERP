"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewProductionOrderPage() {
  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/production/orders">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Voltar
          </Button>
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">
          Novo pedido de produção
        </h1>
      </div>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Em desenvolvimento</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            O formulário de criação de pedidos será implementado em seguida.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
