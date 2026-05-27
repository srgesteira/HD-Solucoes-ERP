import Link from "next/link";
import { ModulePlaceholder } from "@/components/placeholders/module-placeholder";
import { PieChart } from "lucide-react";

export default function HrTurnoverPage() {
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <ModulePlaceholder
        title="Turnover"
        icon={PieChart}
        description="Indicador de turnover disponível no dashboard de RH. Relatório dedicado em desenvolvimento."
      />
      <p className="text-center">
        <Link
          href="/hr/dashboard"
          className="text-sm font-medium text-brand-700 underline dark:text-brand-400"
        >
          Abrir dashboard RH
        </Link>
      </p>
    </div>
  );
}
