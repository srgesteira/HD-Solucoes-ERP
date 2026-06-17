import Link from "next/link";
import { ModulePlaceholder } from "@/components/placeholders/module-placeholder";
import { PieChart } from "lucide-react";
import { AppPage } from "@/shared/ui/app-page";

export default function HrTurnoverPage() {
  return (
    <AppPage title="Turnover" width="narrow" density="comfortable">
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
    </AppPage>
  );
}
