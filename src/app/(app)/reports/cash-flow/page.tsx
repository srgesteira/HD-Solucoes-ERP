import { redirect } from "next/navigation";

export default function CashFlowReportPage() {
  redirect("/finance/contas?tab=fluxo");
}
