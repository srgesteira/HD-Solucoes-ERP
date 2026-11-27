/**
 * Tempo útil da HD (Etapa 6/7): seg–sex, 7h00–17h30, horário de São Paulo (UTC−3, sem horário de verão).
 * Feriados: lista opcional de datas AAAA-MM-DD (tabela no ERP numa etapa seguinte).
 */
const INICIO = 7 * 60; // 07:00
const FIM = 17 * 60 + 30; // 17:30
const OFFSET_MIN = -3 * 60;

function minutoLocal(d: Date) {
  const local = new Date(d.getTime() + OFFSET_MIN * 60000);
  return {
    iso: local.toISOString().slice(0, 10),
    dow: local.getUTCDay(),
    min: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** Minutos úteis entre `de` e `ate`. */
export function minutosUteis(de: Date, ate: Date, feriados: ReadonlySet<string> = new Set()): number {
  if (ate <= de) return 0;
  let total = 0;
  const cur = new Date(de.getTime());
  while (cur < ate) {
    const a = minutoLocal(cur);
    // início do próximo dia local
    const proxDia = new Date(Date.UTC(+a.iso.slice(0, 4), +a.iso.slice(5, 7) - 1, +a.iso.slice(8, 10) + 1) - OFFSET_MIN * 60000);
    const fimTrecho = ate < proxDia ? ate : proxDia;
    if (a.dow !== 0 && a.dow !== 6 && !feriados.has(a.iso)) {
      const ini = Math.max(a.min, INICIO);
      const b = fimTrecho.getTime() === proxDia.getTime() ? 24 * 60 : minutoLocal(fimTrecho).min;
      const fim = Math.min(b, FIM);
      if (fim > ini) total += fim - ini;
    }
    cur.setTime(proxDia.getTime());
  }
  return total;
}

/** Limite para virar "aguardando Helder" no painel: 10h30 úteis = 1 dia útil. */
export const LIMITE_AGUARDANDO_MIN = 10 * 60 + 30;

/** Agora é horário útil? (seg–sex, 7h–17h30 SP, fora de feriado) */
export function dentroDoHorarioUtil(agora: Date, feriados: ReadonlySet<string> = new Set()): boolean {
  const a = minutoLocal(agora);
  return a.dow !== 0 && a.dow !== 6 && !feriados.has(a.iso) && a.min >= INICIO && a.min < FIM;
}

/** Intervalo entre pushes de um crítico sem resposta: 2 h úteis. */
export const INTERVALO_REPUSH_MIN = 120;
