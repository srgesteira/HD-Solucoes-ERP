"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Printer, Save } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  decidirModeloFiltro,
  descricaoSemMedida,
  detectarClasseFiltragem,
  gerarLote,
  LABEL_MODELO_LABELS,
  medidaFromDescricao,
  parseSeriesReimpressao,
  type FiltroModelo,
  type LabelModelo,
  type LabelTemplate,
} from "@/modules/producao/lib/etiquetas/label-template";
import {
  fetchLogoDataUrl,
  labelsSheetsHtml,
  LABEL_PREVIEW_CSS,
  makeQrDataUrl,
  openLabelPrintWindow,
  POPUP_BLOCKED_ERROR,
  writeLabelsToWindow,
  type LabelPrintData,
} from "@/modules/producao/lib/etiquetas/label-print";

type LabelInfo = {
  order_item_id: string;
  product_id: string | null;
  codigo: string;
  descricao: string;
  quantidade: number;
  pedido: string;
  op: string | null;
  pedido_cliente: string | null;
  cliente: string | null;
  template: LabelTemplate;
  template_saved: boolean;
  template_column_ready: boolean;
  empresa: { nome: string; logo_url: string | null; site: string };
};

type Props = {
  orderItemId: string | null;
  open: boolean;
  onClose: () => void;
  /** Item em produção → oferece finalizar após imprimir. */
  canFinish?: boolean;
  onFinish?: (orderItemId: string) => void;
};

type Alvo = "principal" | "filtros" | "tudo";

async function fetchInfo(orderItemId: string): Promise<LabelInfo> {
  const res = await fetch(`/api/production/labels?order_item_id=${encodeURIComponent(orderItemId)}`, {
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { data?: LabelInfo; error?: string } & Partial<LabelInfo>;
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar dados da etiqueta");
  return (json.data ?? json) as LabelInfo;
}

const inputCls = "mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs";

export function ProductionLabelModal({ orderItemId, open, onClose, canFinish, onFinish }: Props) {
  const [info, setInfo] = useState<LabelInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tpl, setTpl] = useState<LabelTemplate>({ modelo: "painel" });
  const [series, setSeries] = useState("");
  const [busy, setBusy] = useState(false);
  const [finishAfter, setFinishAfter] = useState(true);
  const [qr, setQr] = useState("");
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderItemId) return;
    let cancel = false;
    setInfo(null);
    setLoadErr(null);
    setSeries("");
    fetchInfo(orderItemId)
      .then(async (d) => {
        if (cancel) return;
        setInfo(d);
        setTpl(d.template);
        const [q, l] = await Promise.all([
          makeQrDataUrl(d.empresa.site.startsWith("http") ? d.empresa.site : `https://${d.empresa.site}`),
          fetchLogoDataUrl(d.empresa.logo_url),
        ]);
        if (!cancel) {
          setQr(q);
          setLogo(l);
        }
      })
      .catch((e: unknown) => !cancel && setLoadErr(e instanceof Error ? e.message : "Erro"));
    return () => {
      cancel = true;
    };
  }, [open, orderItemId]);

  const set = (patch: Partial<LabelTemplate>) => setTpl((t) => ({ ...t, ...patch }));
  const filtrosPorUnidade = tpl.modelo === "painel" ? Math.max(0, Math.floor(tpl.filtros_por_unidade ?? 0)) : 0;
  const totalFiltros = info ? info.quantidade * filtrosPorUnidade : 0;

  const buildList = (alvo: Alvo, numeros: number[]): LabelPrintData[] => {
    if (!info || !qr) return [];
    const lote = gerarLote(info.pedido || info.op || "");
    const common = {
      lote,
      pedido: info.pedido,
      op: info.op,
      pedidoCliente: info.pedido_cliente,
      cliente: info.cliente,
      logoDataUrl: logo,
      qrDataUrl: qr,
      empresa: info.empresa.nome,
      site: info.empresa.site.replace(/^https?:\/\//, ""),
    };
    const pick = (total: number) =>
      numeros.length ? numeros.filter((n) => n <= total) : Array.from({ length: total }, (_, i) => i + 1);

    const out: LabelPrintData[] = [];
    if (alvo !== "filtros") {
      const total = info.quantidade;
      for (const serie of pick(total)) {
        out.push({
          ...common,
          modelo: tpl.modelo,
          codigo: info.codigo,
          descricao: descricaoSemMedida(info.descricao) || info.descricao,
          medida: medidaFromDescricao(info.descricao),
          linhaExtra: tpl.linha_extra,
          classe: tpl.classe,
          vazao: tpl.vazao,
          perdaInicial: tpl.perda_inicial,
          perdaFinal: tpl.perda_final,
          serie,
          serieTotal: total,
        });
      }
    }
    if (alvo !== "principal" && totalFiltros > 0) {
      const desc = (tpl.filtro_descricao ?? "").trim() || "FILTRO";
      const classe = (tpl.filtro_classe ?? "").trim() || detectarClasseFiltragem(desc, tpl.filtro_codigo) || "";
      const modelo: FiltroModelo = tpl.filtro_modelo ?? decidirModeloFiltro(classe);
      for (const serie of pick(totalFiltros)) {
        out.push({
          ...common,
          modelo,
          codigo: (tpl.filtro_codigo ?? "").trim() || "—",
          descricao: descricaoSemMedida(desc) || desc,
          medida: medidaFromDescricao(desc),
          classe,
          vazao: tpl.filtro_vazao,
          perdaInicial: tpl.filtro_perda_inicial,
          perdaFinal: tpl.filtro_perda_final,
          serie,
          serieTotal: totalFiltros,
        });
      }
    }
    return out;
  };

  const previewList = useMemo(() => {
    const a = buildList("principal", [1]);
    const b = totalFiltros > 0 ? buildList("filtros", [1]) : [];
    return [...a, ...b];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, tpl, qr, logo, totalFiltros]);

  const previewDoc = useMemo(
    () =>
      `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${LABEL_PREVIEW_CSS} body{padding:8px!important;min-height:0!important;}</style></head><body><div class="etiqueta-print-root">${labelsSheetsHtml(previewList)}</div></body></html>`,
    [previewList]
  );

  const saveTemplate = async (silent = false): Promise<boolean> => {
    if (!info) return false;
    if (!info.product_id) {
      if (!silent) toast.error("Item sem produto cadastrado — modelo não pode ser salvo.");
      return false;
    }
    const res = await fetch("/api/production/labels", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_item_id: info.order_item_id, template: tpl }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? "Erro ao salvar modelo");
      return false;
    }
    if (!silent) toast.success("Modelo de etiqueta salvo no produto");
    setInfo((i) => (i ? { ...i, template_saved: true } : i));
    return true;
  };

  const print = (alvo: Alvo) => {
    if (!info || busy) return;
    const totalAlvo = alvo === "filtros" ? totalFiltros : info.quantidade;
    let numeros: number[] = [];
    if (series.trim()) {
      const p = parseSeriesReimpressao(series, Math.max(totalAlvo, 1));
      if (!p.ok) {
        toast.error(p.error);
        return;
      }
      numeros = p.numeros;
    }
    const list = buildList(alvo, numeros);
    if (!list.length) {
      toast.error("Nenhuma etiqueta para imprimir.");
      return;
    }
    const win = openLabelPrintWindow();
    if (!win) {
      toast.error(POPUP_BLOCKED_ERROR);
      return;
    }
    setBusy(true);
    try {
      writeLabelsToWindow(win, list, `Etiquetas ${info.pedido}`);
      void saveTemplate(true);
      if (canFinish && finishAfter && onFinish && !series.trim()) {
        onFinish(info.order_item_id);
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao imprimir");
      try {
        win.close();
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const isFiltro = tpl.modelo !== "painel";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Imprimir etiqueta</h3>
          <button type="button" className="text-slate-500 hover:text-slate-800 text-xs" onClick={onClose}>
            Fechar
          </button>
        </div>

        {loadErr ? <p className="text-red-600 text-xs">{loadErr}</p> : null}
        {!info && !loadErr ? (
          <div className="flex items-center gap-2 text-slate-600 py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : null}

        {info ? (
          <>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-0.5">
              <p className="font-semibold text-slate-900">
                {info.codigo} · {info.descricao}
              </p>
              <p>
                PV: {info.pedido || "—"} · OP: {info.op ?? "—"} · Ped. cliente: {info.pedido_cliente || "—"} · Cliente:{" "}
                {info.cliente || "—"}
              </p>
              <p>
                Qtd: {info.quantidade} → séries 1/{info.quantidade} … {info.quantidade}/{info.quantidade}
                {" · "}
                {info.template_saved ? (
                  <span className="text-emerald-700 font-medium">modelo salvo no produto</span>
                ) : (
                  <span className="text-amber-700 font-medium">modelo detectado (será salvo ao imprimir)</span>
                )}
              </p>
              {!info.template_column_ready ? (
                <p className="text-amber-700">Banco ainda sem a coluna do modelo: imprime, mas não salva.</p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-700">
                Modelo
                <select className={inputCls} value={tpl.modelo} onChange={(e) => set({ modelo: e.target.value as LabelModelo })}>
                  {(Object.keys(LABEL_MODELO_LABELS) as LabelModelo[]).map((m) => (
                    <option key={m} value={m}>
                      {LABEL_MODELO_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
              {isFiltro ? (
                <label className="text-xs font-medium text-slate-700">
                  Classe
                  <input className={inputCls} value={tpl.classe ?? ""} onChange={(e) => set({ classe: e.target.value })} placeholder="Ex.: G4, F8, H14" />
                </label>
              ) : (
                <label className="text-xs font-medium text-slate-700">
                  Linha extra (opcional)
                  <input className={inputCls} value={tpl.linha_extra ?? ""} onChange={(e) => set({ linha_extra: e.target.value })} placeholder="Ex.: 220V · 1.200 m³/h" />
                </label>
              )}
            </div>

            {tpl.modelo === "filtro_completa" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-medium text-slate-700">
                  Vazão (m³/h)
                  <input className={inputCls} value={tpl.vazao ?? ""} onChange={(e) => set({ vazao: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  ΔPi (Pa)
                  <input className={inputCls} value={tpl.perda_inicial ?? ""} onChange={(e) => set({ perda_inicial: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  ΔPf (Pa)
                  <input className={inputCls} value={tpl.perda_final ?? ""} onChange={(e) => set({ perda_final: e.target.value })} />
                </label>
              </div>
            ) : null}

            {tpl.modelo === "painel" ? (
              <div className="rounded-md border border-slate-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700">Filtros que vão no painel</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-medium text-slate-700">
                    Filtros por painel
                    <input
                      className={inputCls}
                      inputMode="numeric"
                      value={String(tpl.filtros_por_unidade ?? 0)}
                      onChange={(e) => set({ filtros_por_unidade: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-700">
                    Código do filtro
                    <input className={inputCls} value={tpl.filtro_codigo ?? ""} onChange={(e) => set({ filtro_codigo: e.target.value })} />
                  </label>
                  <label className="text-xs font-medium text-slate-700">
                    Classe do filtro
                    <input className={inputCls} value={tpl.filtro_classe ?? ""} onChange={(e) => set({ filtro_classe: e.target.value })} placeholder="Ex.: G4, F8" />
                  </label>
                </div>
                {filtrosPorUnidade > 0 ? (
                  <>
                    <label className="block text-xs font-medium text-slate-700">
                      Descrição do filtro (com medida)
                      <input
                        className={inputCls}
                        value={tpl.filtro_descricao ?? ""}
                        onChange={(e) => set({ filtro_descricao: e.target.value })}
                        placeholder="Ex.: FILTRO PLISSADO G4 592X592X48MM"
                      />
                    </label>
                    {decidirModeloFiltro(tpl.filtro_classe || detectarClasseFiltragem(tpl.filtro_descricao ?? "")) ===
                    "filtro_completa" ? (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="text-xs font-medium text-slate-700">
                          Vazão filtro (m³/h)
                          <input className={inputCls} value={tpl.filtro_vazao ?? ""} onChange={(e) => set({ filtro_vazao: e.target.value })} />
                        </label>
                        <label className="text-xs font-medium text-slate-700">
                          ΔPi (Pa)
                          <input className={inputCls} value={tpl.filtro_perda_inicial ?? ""} onChange={(e) => set({ filtro_perda_inicial: e.target.value })} />
                        </label>
                        <label className="text-xs font-medium text-slate-700">
                          ΔPf (Pa)
                          <input className={inputCls} value={tpl.filtro_perda_final ?? ""} onChange={(e) => set({ filtro_perda_final: e.target.value })} />
                        </label>
                      </div>
                    ) : null}
                    <p className="text-[11px] text-slate-500">
                      {info.quantidade} painéis × {filtrosPorUnidade} = {totalFiltros} etiquetas de filtro.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            <label className="block text-xs font-medium text-slate-700">
              Reimprimir série específica (opcional)
              <input className={inputCls} value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Ex.: 2 ou 2,5,7 — vazio = todas" />
            </label>

            <div className="space-y-1">
              <p className="text-[11px] text-slate-500">Pré-visualização 100×20 mm (série 1)</p>
              <iframe title="Pré-visualização da etiqueta" className="w-full h-48 rounded-md border border-dashed border-slate-300 bg-slate-100" srcDoc={previewDoc} />
            </div>

            {canFinish && onFinish ? (
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={finishAfter} onChange={(e) => setFinishAfter(e.target.checked)} />
                Finalizar a produção deste item depois de imprimir
              </label>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void saveTemplate()}>
                <Save className="h-3.5 w-3.5 mr-1" /> Salvar modelo
              </Button>
              {totalFiltros > 0 ? (
                <>
                  <Button type="button" variant="outline" size="sm" disabled={busy || !qr} onClick={() => print("principal")}>
                    Só painéis ({info.quantidade})
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={busy || !qr} onClick={() => print("filtros")}>
                    Só filtros ({totalFiltros})
                  </Button>
                </>
              ) : null}
              <Button type="button" size="sm" disabled={busy || !qr} onClick={() => print("tudo")}>
                <Printer className="h-3.5 w-3.5 mr-1" />
                Imprimir {totalFiltros > 0 ? `tudo (${info.quantidade + totalFiltros})` : `todas (${info.quantidade})`}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
