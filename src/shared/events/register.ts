/**
 * Registo central de handlers do bus interno.
 * Importar uma vez no arranque do servidor (ex.: rotas API que publicam eventos).
 */
import { subscribe } from "@/shared/events/bus";

let registered = false;

export function registerEventHandlers(): void {
  if (registered) return;
  registered = true;

  subscribe("faturamento.credit.approved", async (payload) => {
    console.info("[events] credit approved", payload.sales_order_ref ?? payload);
  });

  subscribe("faturamento.credit.rejected", async (payload) => {
    console.info("[events] credit rejected", payload.sales_order_ref ?? payload);
  });
}
