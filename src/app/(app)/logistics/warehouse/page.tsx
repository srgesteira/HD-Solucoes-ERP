import Link from "next/link";
import { ModulePlaceholder } from "@/components/placeholders/module-placeholder";
import { Warehouse } from "lucide-react";

export default function LogisticsWarehousePage() {
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <ModulePlaceholder
        title="Almoxarifado"
        icon={Warehouse}
        description="Em desenvolvimento. Enquanto isso, consulte o inventário de produtos."
      />
      <p className="text-center">
        <Link
          href="/inventory"
          className="text-sm font-medium text-brand-700 underline dark:text-brand-400"
        >
          Abrir estoque (inventário)
        </Link>
      </p>
    </div>
  );
}
