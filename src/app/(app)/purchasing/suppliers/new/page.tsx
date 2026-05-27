"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Truck } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  SupplierFormFields,
  buildSupplierPayload,
  emptySupplierForm,
  type SupplierFormShape,
} from "@/components/purchasing/supplier-form-fields";
import { useMe } from "@/hooks/use-me";

async function createSupplier(payload: ReturnType<typeof buildSupplierPayload>) {
  const res = await fetch("/api/purchasing/suppliers", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao criar fornecedor");
  }

  return json;
}

export default function NewSupplierPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();

  const [formData, setFormData] = useState<SupplierFormShape>(emptySupplierForm);

  useEffect(() => {
    if (meLoading) return;
    if (me && me.role !== "admin") {
      toast.error("Apenas administradores podem criar fornecedores.");
      router.replace("/purchasing/suppliers");
    }
  }, [me, meLoading, router]);

  const mutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: async () => {
      toast.success("Fornecedor criado.");
      await queryClient.invalidateQueries({ queryKey: ["purchasing-suppliers"] });
      router.push("/purchasing/suppliers");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (me?.role !== "admin") return;

    if (!formData.code.trim()) {
      toast.error("Código é obrigatório.");
      return;
    }
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }

    try {
      await mutation.mutateAsync(buildSupplierPayload(formData));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao criar fornecedor."
      );
    }
  };

  function handleChange<K extends keyof SupplierFormShape>(
    field: K,
    value: SupplierFormShape[K]
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  if (meLoading || (me && me.role !== "admin")) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">A validar permissões…</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/purchasing/suppliers">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          Novo fornecedor
        </h1>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Truck className="h-5 w-5 text-slate-600" aria-hidden />
              Dados do fornecedor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SupplierFormFields
              formData={formData}
              onChange={handleChange}
              onBulkChange={setFormData}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-6">
          <Link href="/purchasing/suppliers">
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </Link>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                A gravar…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden />
                Guardar
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
