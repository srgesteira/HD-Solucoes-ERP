"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SupplierFormFields,
  buildSupplierPayload,
  supplierRowToForm,
  type SupplierFormShape,
} from "@/components/purchasing/supplier-form-fields";
import { useMe } from "@/hooks/use-me";
import type { Supplier } from "@/lib/types/purchasing.types";

async function fetchSupplier(id: string): Promise<Supplier> {
  const res = await fetch(`/api/purchasing/suppliers/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: Supplier | null;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar fornecedor");
  }
  if (!json.data) throw new Error("Resposta sem dados.");
  return json.data;
}

async function updateSupplier(
  id: string,
  payload: ReturnType<typeof buildSupplierPayload>
) {
  const res = await fetch(`/api/purchasing/suppliers/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao atualizar fornecedor");
  }
  return json;
}

export default function EditSupplierPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params.id;
  const supplierId =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : null;

  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();

  const [formData, setFormData] = useState<SupplierFormShape | null>(null);

  const { data: supplierRow, isLoading, error } = useQuery({
    queryKey: ["purchasing-supplier", supplierId],
    queryFn: () => fetchSupplier(supplierId!),
    enabled: !!supplierId,
  });

  useEffect(() => {
    if (meLoading) return;
    if (me && me.role !== "admin") {
      toast.error("Apenas administradores podem editar fornecedores.");
      router.replace("/purchasing/suppliers");
    }
  }, [me, meLoading, router]);

  useEffect(() => {
    if (supplierRow) {
      setFormData(supplierRowToForm(supplierRow));
    }
  }, [supplierRow]);

  const mutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildSupplierPayload>) => {
      if (!supplierId) throw new Error("ID inválido");
      return updateSupplier(supplierId, payload);
    },
    onSuccess: async () => {
      toast.success("Fornecedor atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["purchasing-suppliers"] });
      if (supplierId) {
        await queryClient.invalidateQueries({
          queryKey: ["purchasing-supplier", supplierId],
        });
      }
      router.push("/purchasing/suppliers");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData || !supplierId || me?.role !== "admin") return;

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
        err instanceof Error ? err.message : "Erro ao atualizar fornecedor."
      );
    }
  };

  function handleChange<K extends keyof SupplierFormShape>(
    field: K,
    value: SupplierFormShape[K]
  ) {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  if (meLoading || (me && me.role !== "admin")) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">A validar permissões…</span>
      </div>
    );
  }

  if (!supplierId) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-slate-600">
        <p className="text-sm">Identificador inválido.</p>
        <Link
          href="/purchasing/suppliers"
          className="mt-4 inline-block text-brand-700 underline text-sm"
        >
          Voltar à listagem
        </Link>
      </div>
    );
  }

  if (isLoading || (!formData && !error)) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">A carregar fornecedor…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-12 space-y-4 text-center">
        <p className="text-sm text-red-700">
          {error instanceof Error ? error.message : "Erro ao carregar."}
        </p>
        <Link href="/purchasing/suppliers">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar à listagem
          </Button>
        </Link>
      </div>
    );
  }

  if (!formData) {
    return null;
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
          Editar fornecedor — {supplierRow?.code ?? "…"}
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
                Guardar alterações
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
