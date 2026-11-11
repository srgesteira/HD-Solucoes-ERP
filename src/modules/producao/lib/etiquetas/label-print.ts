import QRCode from "qrcode";
import {
  FILTRO_PRINT_CSS,
  painelPrintCss,
} from "@/modules/producao/lib/etiquetas/label-print-styles";
import {
  familiaDoModelo,
  LABEL_FORMATOS,
  type LabelModelo,
} from "@/modules/producao/lib/etiquetas/label-template";

/** Uma etiqueta pronta para imprimir (100×20 mm). */
export type LabelPrintData = {
  modelo: LabelModelo;
  codigo: string;
  descricao: string;
  medida: string | null;
  linhaExtra?: string;
  classe?: string;
  vazao?: string;
  perdaInicial?: string;
  perdaFinal?: string;
  lote: string;
  serie: number;
  serieTotal: number;
  pedido: string;
  op?: string | null;
  pedidoCliente?: string | null;
  cliente?: string | null;
  logoDataUrl?: string | null;
  qrDataUrl: string;
  empresa: string;
  site: string;
};

export const POPUP_BLOCKED_ERROR =
  "Pop-up bloqueado. Clique no ícone de pop-up bloqueado na barra de endereço, permita pop-ups deste site e tente de novo.";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function makeQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 120,
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

/** Busca o logo e converte em data URL (impressão sem rede). Falha → null (sai o nome). */
export async function fetchLogoDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url?.trim()) return null;
  try {
    const res = await fetch(url.trim(), { cache: "no-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function logoHtml(d: LabelPrintData, imgClass: string, textClass: string): string {
  return d.logoDataUrl
    ? `<img src="${d.logoDataUrl}" alt="" class="${imgClass}">`
    : `<div class="${textClass}">${esc(d.empresa)}</div>`;
}

function traceLine(d: LabelPrintData): string {
  const parts: string[] = [`PV: ${d.pedido}`];
  // OP derivada do PV (PV-2026-0022-001) só repete o PV → omite para caber.
  if (d.op && !d.op.startsWith(d.pedido)) parts.push(`OP: ${d.op}`);
  if (d.pedidoCliente?.trim()) parts.push(`PED.: ${d.pedidoCliente.trim()}`);
  return parts.join(" · ");
}

const FLUXO_SVG = `<div class="etiqueta-filtro__fluxo" aria-hidden="true"><div class="etiqueta-filtro__fluxo-bar"><svg class="etiqueta-filtro__fluxo-shape" viewBox="0 0 16 42" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision"><polygon points="8,0 16,11 0,11" fill="#000"/><rect x="0" y="11" width="16" height="31" fill="#000"/></svg><div class="etiqueta-filtro__fluxo-text"><span class="etiqueta-filtro__fluxo-line">FLUXO</span><span class="etiqueta-filtro__fluxo-line">DE AR</span></div></div></div>`;

function painelHtml(d: LabelPrintData): string {
  const medidaExtra = [d.medida, d.linhaExtra?.trim()].filter(Boolean).join(" · ");
  const logo = d.logoDataUrl
    ? `<img src="${d.logoDataUrl}" alt="" class="etiqueta-painel__logo-img">`
    : `<div class="etiqueta-painel__logo-text">${esc(d.empresa)}</div>`;
  return `<div class="etiqueta-painel">
  <div class="etiqueta-painel__top">
    <div class="etiqueta-painel__logo-wrap">${logo}</div>
    <div class="etiqueta-painel__qr"><img src="${d.qrDataUrl}" alt=""><span class="etiqueta-painel__site">${esc(d.site)}</span></div>
  </div>
  <div class="etiqueta-painel__code">${esc(d.codigo)}</div>
  <div class="etiqueta-painel__desc">${esc(d.descricao)}</div>
  ${medidaExtra ? `<div class="etiqueta-painel__line">${esc(medidaExtra)}</div>` : ""}
  <div class="etiqueta-painel__line">${esc(traceLine(d))}</div>
  <div class="etiqueta-painel__line">SÉRIE: ${d.serie}/${d.serieTotal} · LOTE: ${esc(d.lote)}</div>
</div>`;
}

function filtroHtml(d: LabelPrintData): string {
  const completa = d.modelo === "filtro_completa";
  const trace = [d.pedido ? `PV: ${d.pedido}` : "", d.pedidoCliente?.trim() ? `PED.: ${d.pedidoCliente.trim()}` : ""]
    .filter(Boolean)
    .join(" · ");
  const logo = `<div class="etiqueta-filtro__logo-wrap">${logoHtml(d, "etiqueta-filtro__logo-img", "etiqueta-painel__logo-text")}</div>`;
  const right = `<div class="etiqueta-filtro__right"><div class="etiqueta-filtro__qr"><img src="${d.qrDataUrl}" alt=""></div></div>`;
  const center = completa
    ? `<div class="etiqueta-filtro__center-col"><div class="etiqueta-filtro__center-stack">
  <div class="etiqueta-filtro__text-block">
    <div class="etiqueta-filtro__line etiqueta-filtro__line--code-desc">${esc(d.codigo)} ${esc(d.descricao)}</div>
    ${d.medida ? `<div class="etiqueta-filtro__line etiqueta-filtro__line--medida">${esc(d.medida)}</div>` : ""}
  </div>
  <div class="etiqueta-filtro__specs">
    <span><strong>Vazão:</strong> ${esc(d.vazao || "—")} m³/h</span>
    <span><strong>Classe:</strong> ${esc(d.classe || "—")}</span>
    <span><strong>ΔPi:</strong> ${esc(d.perdaInicial || "—")} Pa</span>
    <span><strong>ΔPf:</strong> ${esc(d.perdaFinal || "—")} Pa</span>
  </div>
  <div class="etiqueta-filtro__trace"><span>SÉRIE: ${d.serie}/${d.serieTotal} · LOTE: ${esc(d.lote)}</span><span>${esc(trace)}</span></div>
  <div class="etiqueta-filtro__warn"><span>NÃO TORCER OU TOCAR</span><span>NO MEIO FILTRANTE</span></div>
</div></div>`
    : `<div class="etiqueta-filtro__center-col">
  <div class="etiqueta-filtro__text-block">
    <div class="etiqueta-filtro__line">${esc(d.codigo)} ${esc(d.descricao)}</div>
    ${d.medida ? `<div class="etiqueta-filtro__line">${esc(d.medida)}</div>` : ""}
  </div>
  <div class="etiqueta-filtro__trace"><span>SÉRIE: ${d.serie}/${d.serieTotal} · LOTE: ${esc(d.lote)}</span>${trace ? `<span>${esc(trace)}</span>` : ""}</div>
</div>`;
  return `<div class="etiqueta-filtro ${completa ? "etiqueta-filtro--completa" : "etiqueta-filtro--simples"}"><div class="etiqueta-filtro__main">${logo}${center}${right}${FLUXO_SVG}</div></div>`;
}

export function labelHtml(d: LabelPrintData): string {
  return d.modelo === "painel" ? painelHtml(d) : filtroHtml(d);
}

export function labelsSheetsHtml(list: LabelPrintData[]): string {
  return list.map((d) => `<div class="etiqueta-sheet">${labelHtml(d)}</div>`).join("");
}

/** CSS da família (painel 50×30 / filtro 100×20). Um job de impressão = uma família. */
export function cssDaFamilia(familia: "painel" | "filtro"): string {
  if (familia === "painel") {
    const f = LABEL_FORMATOS.painel;
    return painelPrintCss(f.largura_mm, f.altura_mm);
  }
  return FILTRO_PRINT_CSS;
}

export function familiaDaLista(list: LabelPrintData[]): "painel" | "filtro" {
  return list.length && familiaDoModelo(list[0].modelo) === "painel" ? "painel" : "filtro";
}

const PRINT_SCRIPT = `<script>
(function(){
  var printed=false;
  function fechar(){ try{ window.close(); }catch(e){} }
  function doPrint(){ if(printed) return; printed=true; try{ window.focus(); window.print(); }catch(e){ console.error(e); } }
  function ready(){
    var imgs=document.querySelectorAll("img"), pend=0;
    imgs.forEach(function(img){ if(!img.complete){ pend++; var c=function(){ pend--; if(pend<=0) requestAnimationFrame(function(){requestAnimationFrame(doPrint);}); }; img.addEventListener("load",c,{once:true}); img.addEventListener("error",c,{once:true}); } });
    if(pend===0) requestAnimationFrame(function(){requestAnimationFrame(doPrint);});
  }
  window.addEventListener("afterprint",function(){ setTimeout(fechar,80); });
  setTimeout(fechar,120000);
  if(document.readyState==="complete") ready(); else window.addEventListener("load",ready,{once:true});
  setTimeout(function(){ if(!printed) ready(); },600);
})();
</script>`;

/** Abrir de forma síncrona no clique (senão o navegador bloqueia o pop-up). */
export function openLabelPrintWindow(): Window | null {
  const { availWidth, availHeight } = window.screen;
  const w = window.open(
    "about:blank",
    "etiqueta-print-hd",
    `width=${availWidth},height=${availHeight},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes`
  );
  try {
    w?.moveTo(0, 0);
    w?.resizeTo(availWidth, availHeight);
  } catch {
    /* ignore */
  }
  return w;
}

/** Todas as etiquetas da lista devem ser da mesma família (mesmo tamanho de papel). */
export function writeLabelsToWindow(win: Window, list: LabelPrintData[], title: string): void {
  const css = cssDaFamilia(familiaDaLista(list));
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body><div class="etiqueta-print-root">${labelsSheetsHtml(list)}</div>${PRINT_SCRIPT}</body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
