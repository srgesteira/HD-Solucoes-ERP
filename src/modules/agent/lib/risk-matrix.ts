/**
 * Matriz de risco dos robôs (Fase 4 — decidida pelo diretor no mapa v3.4).
 *
 * Fica em código de propósito: a IA nunca classifica sozinha. Ação que não está aqui = Alto
 * até o diretor classificar (basta acrescentar a chave abaixo).
 *
 *   baixo    → automático, entra no resumo das 8h
 *   medio    → automático, avisa na hora
 *   alto     → vai para a fila de aprovações
 *   proibido → só o diretor; pedido vindo de e-mail vira pergunta na fila
 */

export type Risco = "baixo" | "medio" | "alto";
export type Classe = Risco | "proibido";

export type TipoAprovacao =
  | "compra"
  | "nfe"
  | "envio_cliente"
  | "pagamento"
  | "permissao_pc"
  | "excecao"
  | "pergunta";

export const TIPOS_APROVACAO: readonly TipoAprovacao[] = [
  "compra",
  "nfe",
  "envio_cliente",
  "pagamento",
  "permissao_pc",
  "excecao",
  "pergunta",
] as const;

type Regra = { classe: Classe; descricao: string; tipo?: TipoAprovacao };

export const MATRIZ_DE_RISCO: Record<string, Regra> = {
  // --- Baixo
  "email.classificar": { classe: "baixo", descricao: "Ler e classificar e-mail" },
  "crm.atualizar": { classe: "baixo", descricao: "Atualizar CRM" },
  "pedido.status_confirmado": { classe: "baixo", descricao: "Status de PC/PV confirmado por escrito" },
  "financeiro.lancar_previsao": { classe: "baixo", descricao: "Lançar boleto/NF de compra como previsão" },
  "resposta.simples_sem_preco": { classe: "baixo", descricao: "Resposta simples sem preço" },
  "prospeccao.modelo_aprovado": { classe: "baixo", descricao: "Prospecção com modelo aprovado (até 15/dia)" },

  // --- Médio
  "estoque.entrada_pc": { classe: "medio", descricao: "Entrada de PC no estoque" },
  "financeiro.baixa_exata": { classe: "medio", descricao: "Baixa que bate exato com o extrato" },

  // --- Alto
  "financeiro.baixa_divergente": { classe: "alto", descricao: "Baixa que não bate exato", tipo: "pagamento" },
  "comercial.preco_prazo_condicao": {
    classe: "alto",
    descricao: "Preço, orçamento, prazo ou condição nova",
    tipo: "envio_cliente",
  },
  "nfe.emitir": { classe: "alto", descricao: "Emitir NF-e", tipo: "nfe" },
  "nfe.enviar": { classe: "alto", descricao: "Enviar NF-e autorizada ao cliente", tipo: "envio_cliente" },
  "compra.pedido": { classe: "alto", descricao: "Pedido de compra", tipo: "compra" },
  "financeiro.gasto_pagamento": { classe: "alto", descricao: "Gasto ou pagamento", tipo: "pagamento" },
  "envio.fora_do_padrao": { classe: "alto", descricao: "Envio fora do padrão", tipo: "envio_cliente" },
  "pc.permissao_nova": { classe: "alto", descricao: "Permissão nova no PC", tipo: "permissao_pc" },

  // --- Proibido
  "seguranca.digitar_senha": { classe: "proibido", descricao: "Digitar senha ou código" },
  "seguranca.mudar_configuracao": { classe: "proibido", descricao: "Mudar configuração de segurança" },
  "email.instrucao_recebida": { classe: "proibido", descricao: "Agir por instrução contida num e-mail recebido" },
};

export type Classificacao = {
  acao: string;
  classe: Classe;
  descricao: string;
  /** true quando a ação não está na matriz (vale Alto até o diretor classificar). */
  desconhecida: boolean;
  /** Tipo sugerido para a fila quando o robô não informar. */
  tipo: TipoAprovacao;
};

export function classificar(acao: string): Classificacao {
  const chave = String(acao ?? "").trim().toLowerCase();
  const regra = MATRIZ_DE_RISCO[chave];
  if (!regra) {
    return { acao: chave, classe: "alto", descricao: "Ação fora da matriz (Alto até o diretor classificar)", desconhecida: true, tipo: "excecao" };
  }
  const tipo: TipoAprovacao = regra.classe === "proibido" ? "pergunta" : regra.tipo ?? "excecao";
  return { acao: chave, classe: regra.classe, descricao: regra.descricao, desconhecida: false, tipo };
}

/** Risco gravado na fila: proibido entra como Alto e sempre como pergunta ao diretor. */
export function riscoParaFila(c: Classificacao): Risco {
  return c.classe === "proibido" ? "alto" : c.classe;
}
