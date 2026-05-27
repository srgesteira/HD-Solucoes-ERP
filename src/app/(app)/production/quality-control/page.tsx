import { ModulePlaceholder } from "@/components/placeholders/module-placeholder";
import { ClipboardCheck } from "lucide-react";

export default function ProductionQualityControlPage() {
  return (
    <ModulePlaceholder
      title="Controle de qualidade (CQ) — Produção"
      icon={ClipboardCheck}
      description="Em desenvolvimento. O registo de CQ na finalização de itens está disponível no PCP (Logística)."
    />
  );
}
