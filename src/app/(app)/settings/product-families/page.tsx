import Link from "next/link";
import { Tags } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Classificação técnica | ERP HD",
};

export default function ProductFamiliesHubPage() {
  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Tags className="h-8 w-8 text-brand-700" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Classificação técnica
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Famílias, sub-famílias, prefixos e acabamentos são usados no cadastro de
            produtos.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Onde gerir</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>
            No formulário de{" "}
            <Link href="/products/new" className="text-brand-700 font-medium hover:underline">
              novo produto
            </Link>{" "}
            ou edição de produto existente, utilize os campos de classificação e NCM.
          </p>
          <p>
            <Link href="/products" className="text-brand-700 font-medium hover:underline">
              Abrir listagem de produtos
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
