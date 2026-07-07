import { redirect } from "next/navigation";

export default function FinanceReceivablesPage() {
  redirect("/finance/contas?tab=receber");
}
