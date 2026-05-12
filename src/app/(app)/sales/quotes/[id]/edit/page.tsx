"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/hooks/use-me";

async function fetchQuoteStatus(
  id: string
): Promise<{ data: { status: string } }> {
  const res = await fetch(`/api/sales/quotes/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { status: string };
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro");
  if (!json.data) throw new Error("Resposta inválida");
  return { data: json.data };
}

export default function EditQuotePlaceholderPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const { data: me } = useMe();

  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-quote-status", id],
    queryFn: () => fetchQuoteStatus(id),
    enabled: Boolean(id),
  });

  if (me?.role !== "admin") {
    return (
      <div className="max-w-xl mx-auto py-12">
        <p className="text-sm text-slate-600">Apenas administradores podem editar.</p>
        <Link href="/sales/quotes">
          <Button type="button" variant="outline" size="sm" className="mt-4">
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-slate-600">A carregar…</p>;
  }
  if (error) {
    return <p className="text-red-700 text-sm">{error.message}</p>;
  }
  if (data?.data.status !== "draft") {
    return (
      <div className="max-w-xl mx-auto space-y-4">
        <p className="text-sm text-slate-600">
          Só é possível editar orçamentos em rascunho.
        </p>
        <Button type="button" size="sm" onClick={() => router.push(`/sales/quotes/${id}`)}>
          Ver detalhes
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link href={`/sales/quotes/${id}`}>
        <Button type="button" variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4" />
          Detalhes
        </Button>
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Editar orçamento
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          <p>
            Formulário de edição em desenvolvimento. Use{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              PUT /api/sales/quotes/{id}
            </code>{" "}
            para alterar campos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
