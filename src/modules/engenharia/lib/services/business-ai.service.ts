import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import {
  getAnthropicClient,
  getAnthropicModelId,
  parseAnthropicJson,
} from "@/modules/engenharia/lib/services/ai.service";

export interface BusinessInsight {
  type: string;
  title: string;
  description: string;
  recommendation: string;
  priority: "low" | "medium" | "high" | "critical";
  metrics?: {
    current_value: number;
    target_value?: number;
    percentage?: number;
    trend?: "up" | "down" | "stable";
  };
}

interface ProfitInsightsPayload {
  insights: Array<{
    title: string;
    description: string;
    recommendation: string;
    priority?: string;
    metrics?: BusinessInsight["metrics"];
  }>;
}

const PROFIT_ANALYSIS_TYPE = "profit_analysis" as const;
const PAYMENT_RISK_TYPE = "payment_risk" as const;
const PRODUCTION_TYPE = "production_efficiency" as const;

export async function analyzeProductProfitability(
  tenantId: string
): Promise<BusinessInsight[]> {
  const supabase = await createServerSupabaseClient();

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const cutoffDate = threeMonthsAgo.toISOString().split("T")[0] ?? "";

  const { data: salesOrdersInPeriod, error: ordersErr } = await supabase
    .from("sales_orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .gte("order_date", cutoffDate);

  if (ordersErr) {
    console.error("analyzeProductProfitability sales_orders:", ordersErr);
    return [];
  }

  const orderIds =
    salesOrdersInPeriod?.map((o) => o.id).filter(Boolean) ?? [];
  if (orderIds.length === 0) return [];

  const { data: salesItems, error: itemsErr } = await supabase
    .from("sales_order_items")
    .select(
      `
      id,
      product_id,
      quantity,
      total_price,
      total_cost,
      product:products ( id, name )
    `
    )
    .eq("tenant_id", tenantId)
    .in("sales_order_id", orderIds);

  if (itemsErr) {
    console.error("analyzeProductProfitability items:", itemsErr);
    return [];
  }

  if (!salesItems?.length) return [];

  const productProfit: Record<
    string,
    {
      name: string;
      total_revenue: number;
      total_cost: number;
      total_profit: number;
      quantity: number;
    }
  > = {};

  for (const item of salesItems) {
    const productId = item.product_id;
    if (!productId) continue;

    const row = Array.isArray(item.product)
      ? item.product[0]
      : item.product;
    const name = row?.name ?? "Desconhecido";
    const cost = Number(item.total_cost ?? 0);
    const revenue = Number(item.total_price);
    const qty = Number(item.quantity);

    if (!productProfit[productId]) {
      productProfit[productId] = {
        name,
        total_revenue: 0,
        total_cost: 0,
        total_profit: 0,
        quantity: 0,
      };
    }

    productProfit[productId].total_revenue += revenue;
    productProfit[productId].total_cost += cost;
    productProfit[productId].total_profit += revenue - cost;
    productProfit[productId].quantity += qty;
  }

  const client = getAnthropicClient();

  const lines = Object.entries(productProfit).map(([, p]) => {
    const marginPct =
      p.total_revenue > 0
        ? ((p.total_profit / p.total_revenue) * 100).toFixed(1)
        : "0";
    return (
      `Produto: ${p.name}\n` +
      `   - Receita Total: R$ ${p.total_revenue.toFixed(2)}\n` +
      `   - Custo Total: R$ ${p.total_cost.toFixed(2)}\n` +
      `   - Lucro Total: R$ ${p.total_profit.toFixed(2)}\n` +
      `   - Margem: ${marginPct}%\n` +
      `   - Quantidade Vendida: ${p.quantity}`
    );
  });

  const prompt =
    `Analise os seguintes dados de lucratividade por produto e gere recomendações de negócio.\n\n` +
    `Dados:\n${lines.join("\n\n")}\n\n` +
    `Responde APENAS com um único objeto JSON (sem texto fora do JSON):\n` +
    `{\n` +
    `  "insights": [\n` +
    `    {\n` +
    `      "title": "título do insight",\n` +
    `      "description": "descrição detalhada",\n` +
    `      "recommendation": "ação recomendada",\n` +
    `      "priority": "low|medium|high|critical",\n` +
    `      "metrics": {\n` +
    `        "current_value": 0,\n` +
    `        "target_value": 0,\n` +
    `        "percentage": 0,\n` +
    `        "trend": "up|down|stable"\n` +
    `      }\n` +
    `    }\n` +
    `  ]\n` +
    `}`;

  try {
    const message = await client.messages.create({
      model: getAnthropicModelId(),
      max_tokens: 1500,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (!block || block.type !== "text") return [];

    const result = parseAnthropicJson<ProfitInsightsPayload>(block.text);
    if (!Array.isArray(result.insights)) return [];

    return result.insights.map((i) => ({
      type: PROFIT_ANALYSIS_TYPE,
      title: i.title,
      description: i.description,
      recommendation: i.recommendation,
      priority: normalizePriority(i.priority),
      metrics: sanitizeMetrics(i.metrics),
    }));
  } catch (e) {
    console.error("analyzeProductProfitability IA:", e);
    return [];
  }
}

export async function analyzePaymentRisk(
  tenantId: string
): Promise<BusinessInsight[]> {
  const supabase = await createServerSupabaseClient();

  const today = new Date().toISOString().split("T")[0] ?? "";

  const { data: receivables, error } = await supabase
    .from("receivables")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "partial", "overdue"])
    .lt("due_date", today);

  if (error) {
    console.error("analyzePaymentRisk:", error);
    return [];
  }

  if (!receivables?.length) return [];

  const totalOverdue = receivables.reduce(
    (sum, r) => sum + Number(r.current_amount ?? 0),
    0
  );
  const maxTitle = Math.max(
    ...receivables.map((r) => Number(r.current_amount ?? 0))
  );

  const client = getAnthropicClient();

  const prompt =
    `Analise o risco de inadimplência com base nos seguintes dados:\n\n` +
    `Total em atraso: R$ ${totalOverdue.toFixed(2)}\n` +
    `Número de títulos vencidos: ${receivables.length}\n` +
    `Maior título vencido: R$ ${maxTitle.toFixed(2)}\n\n` +
    `Gera uma recomendação para mitigar este risco.\n\n` +
    `Responde em texto corrido objetivo em pt-BR (sem JSON).`;

  try {
    const message = await client.messages.create({
      model: getAnthropicModelId(),
      max_tokens: 500,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    const recommendation =
      block?.type === "text" ? block.text.trim() : "";

    const priority =
      totalOverdue > 10_000
        ? ("critical" as const)
        : totalOverdue > 5_000
          ? ("high" as const)
          : ("medium" as const);

    return [
      {
        type: PAYMENT_RISK_TYPE,
        title: "Atenção: títulos vencidos",
        description: `Tem ${receivables.length} título(s) vencido(s) totalizando R$ ${totalOverdue.toFixed(2)}.`,
        recommendation:
          recommendation || "Revise carteira de recebíveis e plano de cobrança.",
        priority,
        metrics: {
          current_value: totalOverdue,
          target_value: 0,
          percentage: 0,
          trend: "down",
        },
      },
    ];
  } catch (e) {
    console.error("analyzePaymentRisk IA:", e);
    return [
      {
        type: PAYMENT_RISK_TYPE,
        title: "Atenção: títulos vencidos",
        description: `Tem ${receivables.length} título(s) vencido(s) totalizando R$ ${totalOverdue.toFixed(2)}.`,
        recommendation:
          "Revise carteira de recebíveis, negocie prazos e formalize cobrança.",
        priority:
          totalOverdue > 10_000
            ? "critical"
            : totalOverdue > 5_000
              ? "high"
              : "medium",
        metrics: {
          current_value: totalOverdue,
          target_value: 0,
          percentage: 0,
          trend: "down",
        },
      },
    ];
  }
}

export async function analyzeProductionEfficiency(
  tenantId: string
): Promise<BusinessInsight[]> {
  const supabase = await createServerSupabaseClient();

  const { data: orders, error } = await supabase
    .from("production_orders")
    .select("delivery_deadline, finished_at")
    .eq("tenant_id", tenantId)
    .eq("status", "finished")
    .limit(50);

  if (error) {
    console.error("analyzeProductionEfficiency:", error);
    return [];
  }

  if (!orders?.length) return [];

  let delayedCount = 0;
  for (const order of orders) {
    const dl = order.delivery_deadline;
    const fi = order.finished_at;
    if (!dl || !fi) continue;
    const finishedDay = fi.slice(0, 10);
    if (finishedDay > dl) delayedCount++;
  }

  const onTimeRate = ((orders.length - delayedCount) / orders.length) * 100;

  const client = getAnthropicClient();

  const prompt =
    `Analise a eficiência da produção com base nos dados:\n\n` +
    `Total de ordens finalizadas: ${orders.length}\n` +
    `Taxa de entrega no prazo: ${onTimeRate.toFixed(1)}%\n` +
    `Pedidos atrasados em relação à data comprometida: ${delayedCount}\n\n` +
    `Gera recomendações para melhorar a pontualidade.\n\n` +
    `Responde em texto corrido objetivo em pt-BR (sem JSON).`;

  try {
    const message = await client.messages.create({
      model: getAnthropicModelId(),
      max_tokens: 500,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    const content = block?.type === "text" ? block.text.trim() : "";

    return [
      {
        type: PRODUCTION_TYPE,
        title:
          onTimeRate < 80
            ? "Alerta: entregas fora do prazo"
            : "Produção dentro do esperado",
        description: `Taxa de entrega no prazo: ${onTimeRate.toFixed(1)}% (${orders.length - delayedCount} de ${orders.length} ordens).`,
        recommendation:
          content ||
          "Ajuste capacidade de chão de fábrica e comunicação com clientes.",
        priority:
          onTimeRate < 70 ? "high" : onTimeRate < 90 ? "medium" : "low",
        metrics: {
          current_value: onTimeRate,
          target_value: 95,
          percentage: onTimeRate,
          trend: "stable",
        },
      },
    ];
  } catch (e) {
    console.error("analyzeProductionEfficiency IA:", e);
    return [
      {
        type: PRODUCTION_TYPE,
        title:
          onTimeRate < 80
            ? "Alerta: entregas fora do prazo"
            : "Produção dentro do esperado",
        description: `Taxa de entrega no prazo: ${onTimeRate.toFixed(1)}%.`,
        recommendation:
          "Reveja cronogramas, gargalos e prazos de entrega pactuados.",
        priority:
          onTimeRate < 70 ? "high" : onTimeRate < 90 ? "medium" : "low",
        metrics: {
          current_value: onTimeRate,
          target_value: 95,
          percentage: onTimeRate,
          trend: "stable",
        },
      },
    ];
  }
}

export async function runFullBusinessAnalysis(
  tenantId: string
): Promise<BusinessInsight[]> {
  const [profitability, paymentRisk, efficiency] = await Promise.all([
    analyzeProductProfitability(tenantId),
    analyzePaymentRisk(tenantId),
    analyzeProductionEfficiency(tenantId),
  ]);

  return [...profitability, ...paymentRisk, ...efficiency];
}

function normalizePriority(
  p?: string
): BusinessInsight["priority"] {
  if (p === "low" || p === "medium" || p === "high" || p === "critical") {
    return p;
  }
  return "medium";
}

function sanitizeMetrics(
  m?: BusinessInsight["metrics"]
): BusinessInsight["metrics"] | undefined {
  if (!m || typeof m.current_value !== "number") return undefined;
  return {
    current_value: m.current_value,
    target_value:
      typeof m.target_value === "number" ? m.target_value : undefined,
    percentage:
      typeof m.percentage === "number" ? m.percentage : undefined,
    trend:
      m.trend === "up" || m.trend === "down" || m.trend === "stable"
        ? m.trend
        : undefined,
  };
}
