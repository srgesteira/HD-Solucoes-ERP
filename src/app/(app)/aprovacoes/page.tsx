"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, BookOpen, CheckCircle2, ClipboardCheck, ExternalLink, History, Pause, Play, KeyRound, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/shared/ui/app-page";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { EmptyState, ErrorState, LoadingState, StatusBadge, type StatusTone } from "@/shared/ui/page-helpers";
import { MfaGate } from "@/modules/agent/components/mfa-gate";

/* ------------------------------------------------------------------ */
/* Tipos e chamadas                                                    */
/* ------------------------------------------------------------------ */

type Aprovacao = {
  id: string;
  tipo: string;
  resumo: string;
  dados: Record<string, unknown> | null;
  origem_url: string | null;
  risco: "baixo" | "medio" | "alto";
  status: "pendente" | "aprovado" | "rejeitado" | "expirado";
  robo: string | null;
  robo_nome: string | null;
  criado_em: string;
  expira_em: string;
  decidido_em: string | null;
  decidido_por_nome: string | null;
  observacao: string | null;
};

type Robo = {
  slug: string;
  nome: string;
  funcao: string;
  status: "ativo" | "pausado" | "erro";
  janela: string;
  dentro_da_janela_agora: boolean;
  limite_por_hora: number;
  acoes_ultima_hora: number;
  ultimo_sinal: string | null;
  tem_token_proprio: boolean;
};

type Regra = {
  id: string;
  robo: string | null;
  robo_nome: string | null;
  contexto: string;
  pergunta_original: string;
  resposta_aprovada: Record<string, unknown>;
  fonte: "claude" | "diretor";
  risco: string;
  ultima_confirmacao: string;
  vence_em: string;
  valida: boolean;
};

class MfaError extends Error {}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: { mfa?: string } };
  if (res.status === 401 && j.detail?.mfa) throw new MfaError(j.error ?? "Confirme o MFA.");
  if (!res.ok) throw new Error(j.error ?? `Erro ${res.status}`);
  return j;
}

const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : "—";

const RISCO_TOM: Record<string, StatusTone> = { alto: "danger", medio: "warning", baixo: "success" };
const STATUS_TOM: Record<string, StatusTone> = { pendente: "info", aprovado: "success", rejeitado: "danger", expirado: "muted" };
const TIPO_LABEL: Record<string, string> = {
  compra: "Compra",
  nfe: "NF-e",
  envio_cliente: "Envio a cliente",
  pagamento: "Pagamento",
  permissao_pc: "Permissão no PC",
  excecao: "Exceção",
  pergunta: "Pergunta",
};

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export default function AprovacoesPage() {
  const [aba, setAba] = useState("pendentes");
  return (
    <AppPage title="Aprovações" description="Pedidos dos robôs, killswitch e regras aprendidas" width="narrow">
      <MfaGate>
        {(fim) => (
          <>
            <p className="mb-3 text-xs text-slate-500">
              Sessão de aprovação até {fim.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Depois o código é pedido de novo.
            </p>
            <Tabs value={aba} onValueChange={setAba}>
              <TabsList className="mb-4 grid w-full grid-cols-4">
                <TabsTrigger value="pendentes">
                  <ClipboardCheck className="mr-1 h-4 w-4" /> Fila
                </TabsTrigger>
                <TabsTrigger value="historico">
                  <History className="mr-1 h-4 w-4" /> Histórico
                </TabsTrigger>
                <TabsTrigger value="robos">
                  <Bot className="mr-1 h-4 w-4" /> Robôs
                </TabsTrigger>
                <TabsTrigger value="regras">
                  <BookOpen className="mr-1 h-4 w-4" /> Regras
                </TabsTrigger>
              </TabsList>
              <TabsContent value="pendentes">
                <Fila />
              </TabsContent>
              <TabsContent value="historico">
                <Historico />
              </TabsContent>
              <TabsContent value="robos">
                <Robos />
              </TabsContent>
              <TabsContent value="regras">
                <Regras />
              </TabsContent>
            </Tabs>
          </>
        )}
      </MfaGate>
    </AppPage>
  );
}

/** Servidor pediu o código de novo (sessão de 30 min venceu): recarrega para o portão de MFA. */
function tratarMfa(err: unknown) {
  if (err instanceof MfaError && typeof window !== "undefined") {
    toast.error(err.message);
    window.location.reload();
  }
}

function ErroOuMfa({ erro }: { erro: unknown }) {
  if (erro instanceof MfaError) {
    return (
      <ErrorState
        message={erro.message}
        action={
          <Button size="sm" onClick={() => window.location.reload()}>
            Digitar o código
          </Button>
        }
      />
    );
  }
  return <ErrorState message={erro instanceof Error ? erro.message : "Erro"} />;
}

/* ------------------------------------------------------------------ */
/* Fila de pendentes                                                   */
/* ------------------------------------------------------------------ */

function Fila() {
  const qc = useQueryClient();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [nota, setNota] = useState("");
  const q = useQuery({
    queryKey: ["aprovacoes", "pendente"],
    queryFn: () => api<{ itens: Aprovacao[] }>("/api/approvals?status=pendente&limite=200"),
    refetchInterval: 60_000,
  });

  const decidir = useMutation({
    mutationFn: (decisao: "aprovado" | "rejeitado") =>
      api<{ decididos: number; ignorados: string[] }>("/api/approvals/decide", {
        method: "POST",
        body: JSON.stringify({ ids: [...marcados], decisao, nota: nota || undefined }),
      }),
    onSuccess: (r, decisao) => {
      toast.success(`${r.decididos} ${decisao === "aprovado" ? "aprovado(s)" : "rejeitado(s)"}${r.ignorados.length ? ` · ${r.ignorados.length} já não estavam pendentes` : ""}`);
      setMarcados(new Set());
      setNota("");
      void qc.invalidateQueries({ queryKey: ["aprovacoes"] });
    },
    onError: (e) => {
      tratarMfa(e);
      toast.error(e instanceof Error ? e.message : "Erro ao decidir");
    },
  });

  const itens = q.data?.itens ?? [];
  const todos = itens.length > 0 && marcados.size === itens.length;

  if (q.isLoading) return <LoadingState label="Carregando a fila…" />;
  if (q.error) return <ErroOuMfa erro={q.error} />;
  if (!itens.length) return <EmptyState title="Nada pendente" description="Os robôs não pediram nada que precise da sua decisão." icon={CheckCircle2} />;

  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-3 pb-40">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={todos}
          onChange={() => setMarcados(todos ? new Set() : new Set(itens.map((i) => i.id)))}
        />
        Marcar todos ({itens.length})
      </label>

      {itens.map((a) => (
        <Card key={a.id} className={marcados.has(a.id) ? "border-brand-600 ring-1 ring-brand-600" : ""}>
          <CardContent className="space-y-2 py-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={marcados.has(a.id)} onChange={() => alternar(a.id)} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={RISCO_TOM[a.risco] ?? "neutral"} size="xs">
                    risco {a.risco}
                  </StatusBadge>
                  <StatusBadge tone="neutral" size="xs">
                    {TIPO_LABEL[a.tipo] ?? a.tipo}
                  </StatusBadge>
                  <span className="text-xs text-slate-500">
                    {a.robo_nome ?? a.robo} · {dataHora(a.criado_em)}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-900">{a.resumo}</p>
              </div>
            </label>
            <DetalhesPedido a={a} />
          </CardContent>
        </Card>
      ))}

      {marcados.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="mx-auto max-w-3xl space-y-2">
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={500}
              placeholder="Observação (opcional, ex.: motivo da rejeição)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" disabled={decidir.isPending} onClick={() => decidir.mutate("aprovado")}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Aprovar {marcados.size}
              </Button>
              <Button size="lg" variant="danger" disabled={decidir.isPending} onClick={() => decidir.mutate("rejeitado")}>
                <XCircle className="mr-1 h-4 w-4" /> Rejeitar {marcados.size}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetalhesPedido({ a }: { a: Aprovacao }) {
  const dados = { ...(a.dados ?? {}) };
  const matriz = dados._matriz as { descricao?: string; fora_da_matriz?: boolean } | undefined;
  delete dados._matriz;
  const comando = typeof dados.comando === "string" ? dados.comando : null;
  const motivo = typeof dados.motivo === "string" ? dados.motivo : null;
  const resto = Object.fromEntries(Object.entries(dados).filter(([k]) => k !== "comando" && k !== "motivo"));
  return (
    <div className="space-y-2 pl-8 text-xs text-slate-600">
      {a.tipo === "permissao_pc" || comando ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-2">
          {comando ? <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-slate-900">{comando}</pre> : null}
          {motivo ? <p className="mt-1">Motivo: {motivo}</p> : null}
        </div>
      ) : null}
      {a.origem_url ? (
        <a href={a.origem_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 underline">
          <ExternalLink className="h-3 w-3" /> Ver a origem
        </a>
      ) : null}
      {matriz?.descricao ? (
        <p>
          Matriz: {matriz.descricao}
          {matriz.fora_da_matriz ? " — ação nova, classifique na matriz" : ""}
        </p>
      ) : null}
      {Object.keys(resto).length ? (
        <details>
          <summary className="cursor-pointer">Dados do pedido</summary>
          <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[11px]">
            {JSON.stringify(resto, null, 2)}
          </pre>
        </details>
      ) : null}
      <p>Vale até {dataHora(a.expira_em)}.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Histórico                                                           */
/* ------------------------------------------------------------------ */

function Historico() {
  const q = useQuery({
    queryKey: ["aprovacoes", "historico"],
    queryFn: () => api<{ itens: Aprovacao[] }>("/api/approvals?limite=60"),
  });
  const itens = (q.data?.itens ?? []).filter((a) => a.status !== "pendente");
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErroOuMfa erro={q.error} />;
  if (!itens.length) return <EmptyState title="Sem decisões ainda" />;
  return (
    <div className="space-y-2">
      {itens.map((a) => (
        <Card key={a.id}>
          <CardContent className="space-y-1 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={STATUS_TOM[a.status]} size="xs">
                {a.status}
              </StatusBadge>
              <span className="text-xs text-slate-500">
                {a.robo_nome ?? a.robo} · pedido {dataHora(a.criado_em)}
              </span>
            </div>
            <p className="text-slate-900">{a.resumo}</p>
            <p className="text-xs text-slate-500">
              {a.status === "expirado"
                ? "Expirou às 18h sem decisão"
                : `Por ${a.decidido_por_nome ?? "—"} em ${dataHora(a.decidido_em)}`}
              {a.observacao ? ` · “${a.observacao}”` : ""}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Robôs (killswitch e token)                                          */
/* ------------------------------------------------------------------ */

function Robos() {
  const qc = useQueryClient();
  const [tokenNovo, setTokenNovo] = useState<{ robo: string; token: string } | null>(null);
  const q = useQuery({ queryKey: ["robos"], queryFn: () => api<{ robos: Robo[] }>("/api/agents"), refetchInterval: 60_000 });

  const acao = useMutation({
    mutationFn: ({ slug, acao }: { slug: string; acao: "pausar" | "retomar" | "revogar" | "novo_token" }) =>
      api<{ robo: string; status?: string; token?: string }>(`/api/agents/${slug}`, { method: "POST", body: JSON.stringify({ acao }) }),
    onSuccess: (r, v) => {
      if (v.acao === "novo_token" && r.token) setTokenNovo({ robo: r.robo, token: r.token });
      else toast.success(`${r.robo}: ${v.acao === "pausar" ? "pausado" : v.acao === "retomar" ? "ativo" : "token revogado"}`);
      void qc.invalidateQueries({ queryKey: ["robos"] });
    },
    onError: (e) => {
      tratarMfa(e);
      toast.error(e instanceof Error ? e.message : "Erro");
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErroOuMfa erro={q.error} />;

  return (
    <div className="space-y-2">
      {tokenNovo ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="space-y-2 py-3 text-sm">
            <p className="font-medium">Token novo do robô {tokenNovo.robo} — aparece só agora:</p>
            <p className="select-all break-all rounded bg-white p-2 font-mono text-xs">{tokenNovo.token}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(tokenNovo.token).then(() => toast.success("Copiado"));
                }}
              >
                Copiar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTokenNovo(null)}>
                Já colei no n8n
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {(q.data?.robos ?? []).map((r) => (
        <Card key={r.slug}>
          <CardContent className="space-y-2 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{r.nome}</p>
                <p className="text-xs text-slate-500">{r.funcao}</p>
                <p className="text-xs text-slate-500">
                  Janela {r.janela} · {r.acoes_ultima_hora}/{r.limite_por_hora} ações na última hora · sinal {dataHora(r.ultimo_sinal)}
                  {r.tem_token_proprio ? " · token próprio" : " · sem token próprio"}
                </p>
              </div>
              <StatusBadge tone={r.status === "ativo" ? "success" : r.status === "pausado" ? "warning" : "danger"}>{r.status}</StatusBadge>
            </div>
            <div className="flex flex-wrap gap-2">
              {r.status === "pausado" ? (
                <Button size="sm" variant="outline" disabled={acao.isPending} onClick={() => acao.mutate({ slug: r.slug, acao: "retomar" })}>
                  <Play className="mr-1 h-3.5 w-3.5" /> Retomar
                </Button>
              ) : (
                <Button size="sm" variant="danger" disabled={acao.isPending} onClick={() => acao.mutate({ slug: r.slug, acao: "pausar" })}>
                  <Pause className="mr-1 h-3.5 w-3.5" /> Pausar
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={acao.isPending} onClick={() => acao.mutate({ slug: r.slug, acao: "novo_token" })}>
                <KeyRound className="mr-1 h-3.5 w-3.5" /> {r.tem_token_proprio ? "Trocar token" : "Gerar token"}
              </Button>
              {r.tem_token_proprio ? (
                <Button size="sm" variant="ghost" disabled={acao.isPending} onClick={() => acao.mutate({ slug: r.slug, acao: "revogar" })}>
                  Revogar token
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Regras aprendidas                                                   */
/* ------------------------------------------------------------------ */

function Regras() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const q = useQuery({
    queryKey: ["regras"],
    queryFn: () => api<{ itens: Regra[] }>("/api/learning?todas=1&limite=1000"),
  });

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const itens = q.data?.itens ?? [];
    if (!b) return itens;
    return itens.filter((r) => `${r.pergunta_original} ${JSON.stringify(r.resposta_aprovada)} ${r.robo}`.toLowerCase().includes(b));
  }, [q.data, busca]);

  const mut = useMutation({
    mutationFn: async (op: { tipo: "salvar" | "confirmar" | "apagar" | "carga"; id?: string; resposta?: unknown }) => {
      if (op.tipo === "carga") return api<{ regras_novas_ou_atualizadas: number }>("/api/learning/carga", { method: "POST" });
      if (op.tipo === "apagar") return api(`/api/learning/${op.id}`, { method: "DELETE" });
      return api(`/api/learning/${op.id}`, {
        method: "PATCH",
        body: JSON.stringify(op.tipo === "confirmar" ? { confirmar: true } : { resposta: op.resposta }),
      });
    },
    onSuccess: (r, op) => {
      const msg =
        op.tipo === "carga"
          ? `${(r as { regras_novas_ou_atualizadas: number }).regras_novas_ou_atualizadas} regras novas ou atualizadas`
          : op.tipo === "apagar"
            ? "Regra apagada — o robô volta a perguntar"
            : op.tipo === "confirmar"
              ? "Confirmada por mais 6 meses"
              : "Regra salva";
      toast.success(msg);
      setEditando(null);
      void qc.invalidateQueries({ queryKey: ["regras"] });
    },
    onError: (e) => {
      tratarMfa(e);
      toast.error(e instanceof Error ? e.message : "Erro");
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErroOuMfa erro={q.error} />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar item, fornecedor, robô…"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <Button variant="outline" disabled={mut.isPending} onClick={() => mut.mutate({ tipo: "carga" })}>
          Refazer carga
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        {filtradas.length} regra(s). A regra diz só quem/qual; a ação continua seguindo a matriz de risco. Sem confirmação há 6 meses, vence e o robô volta a perguntar.
      </p>
      {!filtradas.length ? <EmptyState title="Nenhuma regra" /> : null}
      {filtradas.slice(0, 300).map((r) => (
        <Card key={r.id} className={r.valida ? "" : "opacity-60"}>
          <CardContent className="space-y-2 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={r.valida ? "success" : "muted"} size="xs">
                {r.valida ? "válida" : "vencida"}
              </StatusBadge>
              <StatusBadge tone="neutral" size="xs">
                fonte: {r.fonte}
              </StatusBadge>
              <span className="text-xs text-slate-500">
                {r.robo_nome ?? r.robo} · confirmada {dataHora(r.ultima_confirmacao)}
              </span>
            </div>
            <p className="text-slate-900">{r.pergunta_original}</p>
            {editando?.id === r.id ? (
              <>
                <textarea
                  value={editando.texto}
                  onChange={(e) => setEditando({ id: r.id, texto: e.target.value })}
                  rows={8}
                  className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={mut.isPending}
                    onClick={() => {
                      try {
                        mut.mutate({ tipo: "salvar", id: r.id, resposta: JSON.parse(editando.texto) });
                      } catch {
                        toast.error("Resposta precisa ser JSON válido.");
                      }
                    }}
                  >
                    Salvar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                    Cancelar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <RespostaResumo r={r} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate({ tipo: "confirmar", id: r.id })}>
                    Confirmar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditando({ id: r.id, texto: JSON.stringify(r.resposta_aprovada, null, 2) })}
                  >
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" disabled={mut.isPending} onClick={() => mut.mutate({ tipo: "apagar", id: r.id })}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RespostaResumo({ r }: { r: Regra }) {
  const a = r.resposta_aprovada ?? {};
  if (typeof a.fornecedor === "string") {
    return (
      <p className="text-xs text-slate-600">
        Fornecedor: <b>{a.fornecedor}</b>
        {typeof a.ultimo_pc === "string" ? ` · último ${a.ultimo_pc}` : ""}
      </p>
    );
  }
  return <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(a, null, 2)}</pre>;
}
