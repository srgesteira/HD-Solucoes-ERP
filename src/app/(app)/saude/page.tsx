"use client";

import { useQuery } from "@tanstack/react-query";
import { AppPage } from "@/shared/ui/app-page";
import { Card, CardContent } from "@/shared/ui/card";
import { ErrorState, LoadingState, StatusBadge, type StatusTone } from "@/shared/ui/page-helpers";

type Saude = {
  agora: string;
  robos: Array<{ slug: string; name: string; status: string; last_seen_at: string | null; ok: number; erro: number; recusado: number; ultimo_ok: string | null }>;
  eventos: {
    contagem: Record<string, number>;
    itens: Array<{
      id: number;
      criado_em: string;
      robo: string;
      severidade: string;
      pv: string | null;
      cliente: string | null;
      resumo: string;
      status: string;
      minutos_uteis_aguardando: number | null;
      aguardando_helder_vencido: boolean;
    }>;
  };
  aprovacoes: { pendentes: number; vencidas_7d: number };
  hd_central_ultima_resposta: string | null;
  healthchecks: string;
};

const dh = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";

const TOM: Record<string, StatusTone> = {
  aberto: "info",
  em_atendimento: "info",
  aguardando_helder: "warning",
  falha_hd_central: "danger",
  resolvido: "success",
  descartado: "neutral",
  expirado: "neutral",
};
const ROTULO: Record<string, string> = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  aguardando_helder: "Aguardando Helder",
  falha_hd_central: "Falha na HD Central",
  resolvido: "Resolvido",
  descartado: "Descartado",
  expirado: "Expirado",
};

export default function SaudePage() {
  const q = useQuery({
    queryKey: ["saude-robos"],
    queryFn: async () => {
      const r = await fetch("/api/saude", { credentials: "include", cache: "no-store" });
      const j = (await r.json()) as Saude & { error?: string };
      if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`);
      return j;
    },
    refetchInterval: 60_000,
  });

  return (
    <AppPage title="Saúde dos robôs" description="Último sinal, erros, eventos e aprovações — sem abrir o n8n" width="narrow">
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={(q.error as Error).message} />
      ) : q.data ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
              {(["aberto", "em_atendimento", "aguardando_helder", "falha_hd_central"] as const).map((s) => (
                <div key={s}>
                  <div className="text-muted-foreground">{ROTULO[s]}</div>
                  <div className="text-2xl font-semibold">{q.data.eventos.contagem[s] ?? 0}</div>
                </div>
              ))}
              <div>
                <div className="text-muted-foreground">Aprovações pendentes</div>
                <div className="text-2xl font-semibold">{q.data.aprovacoes.pendentes}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Vencidas (7 dias)</div>
                <div className="text-2xl font-semibold">{q.data.aprovacoes.vencidas_7d}</div>
              </div>
              <div className="col-span-2">
                <div className="text-muted-foreground">Última resposta da HD Central</div>
                <div className="text-base font-medium">{dh(q.data.hd_central_ultima_resposta)}</div>
                <a className="text-xs underline" href={q.data.healthchecks} target="_blank" rel="noreferrer">
                  Abrir o Healthchecks
                </a>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">Robô</th>
                    <th className="p-2">Último sinal</th>
                    <th className="p-2">Último sucesso</th>
                    <th className="p-2 text-right">Erros 24 h</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.robos.map((r) => (
                    <tr key={r.slug} className="border-t">
                      <td className="p-2">
                        {r.name} {r.status !== "ativo" ? <StatusBadge tone="warning">{r.status}</StatusBadge> : null}
                      </td>
                      <td className="p-2">{dh(r.last_seen_at)}</td>
                      <td className="p-2">{dh(r.ultimo_ok)}</td>
                      <td className="p-2 text-right">{r.erro + r.recusado || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="font-medium">Eventos (abertos e das últimas 24 h)</div>
              {q.data.eventos.itens.length === 0 ? <div className="text-muted-foreground">Nenhum evento.</div> : null}
              {q.data.eventos.itens.map((e) => (
                <div key={e.id} className="border-t pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={e.aguardando_helder_vencido ? "danger" : TOM[e.status] ?? "neutral"}>
                      {ROTULO[e.status] ?? e.status}
                      {e.aguardando_helder_vencido ? " (+1 dia útil)" : ""}
                    </StatusBadge>
                    <span className="font-medium">{e.robo}</span>
                    <span>{e.severidade}</span>
                    {e.pv ? <span>{e.pv}</span> : null}
                    <span className="text-muted-foreground">{dh(e.criado_em)}</span>
                  </div>
                  <div className="line-clamp-2 text-muted-foreground">{e.resumo}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </AppPage>
  );
}
