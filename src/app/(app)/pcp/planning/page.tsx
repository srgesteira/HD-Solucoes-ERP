import { redirect } from "next/navigation";

/** Rota legada — planeamento PCP passou para Logística. */
export default function LegacyPcpPlanningRedirect() {
  redirect("/logistics/pcp");
}
