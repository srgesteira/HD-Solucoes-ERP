import Link from "next/link";
import { Tags } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";

export const metadata = {
  title: "Classificação técnica | ERP HD",
};

export default function ProductFamiliesHubPage() {
  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-brand-700" />
          Classificação técnica
        </span>
      }
      description="Famílias, sub-famílias, prefixos e acabamentos são usados no cadastro de produtos."
      width="narrow"
      density="comfortable"
    >
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
    </AppPage>
  );
}
