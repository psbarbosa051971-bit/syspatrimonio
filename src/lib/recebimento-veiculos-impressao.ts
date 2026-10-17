import type { Tables } from "@/integrations/supabase/types";
import { conclusaoPadraoRecebimento, descricaoDetalhada, extrairDadosVeiculo, gruposChecklist, lerDadosRecebimento } from "@/lib/recebimento-veiculos";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { limparDescricao } from "@/lib/pdf-parse";

export function numeroTermoVeiculo(termo: Pick<Tables<"recebimentos_veiculos">, "numero" | "ano">): string {
  return `${String(termo.numero).padStart(3, "0")}/${termo.ano}`;
}

const escapar = (valor: unknown) => String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const dataBr = (valor: string) => /^(\d{4})-(\d{2})-(\d{2})$/.test(valor) ? valor.split("-").reverse().join("/") : valor;
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function htmlTermoVeiculo(bem: Tables<"bens">, termo: Tables<"recebimentos_veiculos">, local = ""): string {
  const d = lerDadosRecebimento(termo.dados);
  const numero = numeroTermoVeiculo(termo);
  const texto = (valor?: string) => escapar(valor?.trim() || "—");
  const campo = (rotulo: string, valor?: string) => `<div class="campo"><span>${escapar(rotulo)}</span><strong>${texto(valor)}</strong></div>`;
  const modelo = d.modelo_veiculo || extrairDadosVeiculo(limparDescricao(bem.descricao)).modelo;
  const conclusao = texto(d.observacoes_gerais?.trim() || conclusaoPadraoRecebimento(modelo));
  const observacoes = conclusao.replace(/(\bve[ií]culo\s+)([\s\S]+?)(?=\s+encontra-se\b)/gi, "$1<strong>$2</strong>");
  const descricao = descricaoDetalhada(d, modelo).split("\n").map((linha) => {
    const i = linha.indexOf(":");
    return `<div><b>${escapar(linha.slice(0, i + 1))}</b> ${escapar(linha.slice(i + 1))}</div>`;
  }).join("");
  const grupos = gruposChecklist.map((grupo) => `<section><h2>${escapar(grupo.titulo)}</h2><div class="checklist">${grupo.campos.map((c) => `<div><span>${escapar(c.nome)}</span><b>${texto(d[c.chave])}</b></div>`).join("")}</div></section>`).join("");
  const assinaturas = [1, 2, 3, 4].map((i) => `<div class="assinatura"><strong>${texto(d[`assinante_${i}`])}</strong><span>${texto(d[`cargo_${i}`] || (i === 1 ? "Presidente da comissão" : "Membro da comissão"))}</span></div>`).join("");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo de recebimento de veículos ${escapar(numero)}</title><style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: oklch(0.96 0.005 250); color: oklch(0.2 0.02 255); font: 9px/1.25 Arial, sans-serif; }
    .folha { width: 190mm; height: 276mm; margin: 16px auto; background: oklch(1 0 0); box-shadow: 0 3px 20px oklch(0 0 0 / 12%); }
    .folha { position: relative; overflow: hidden; }
    .conteudo { position: absolute; top: 0; left: 0; width: 190mm; display: flow-root; overflow-wrap: anywhere; transform-origin: top center; }
    header { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid oklch(0.4 0.08 250); padding-bottom: 5px; margin-bottom: 5px; }
    header > div { min-width: 0; } .marca { font-size: 12px; font-weight: 800; color: oklch(0.35 0.08 250); } .orgao { max-width: 55%; text-align: right; font-size: 8px; white-space: pre-line; }
    h1 { margin: 0; padding: 5px 8px; border: 1px solid oklch(0.7 0.02 250); background: oklch(0.94 0.015 250); font-size: 12px; color: oklch(0.28 0.05 250); text-align: center; }
    .cabecalho-institucional { display: block; width: 100%; height: auto; margin-bottom: 6px; }
    .introducao { margin: 6px 0; font-size: 12px; line-height: 1.4; text-align: justify; } section { margin-top: 4px; border: 1px solid oklch(0.72 0.015 250); break-inside: avoid; }
    h2 { margin: 0; padding: 3px 6px; font-size: 8px; text-transform: uppercase; letter-spacing: .2px; background: oklch(0.92 0.015 250); border-bottom: 1px solid oklch(0.72 0.015 250); }
    .grade { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); } .campo { min-width: 0; padding: 3px 6px; border-bottom: 1px solid oklch(0.88 0.01 250); }
    .campo span { display: block; font-size: 7px; font-weight: bold; text-transform: uppercase; color: oklch(0.43 0.02 250); } .campo strong { display: block; overflow-wrap: anywhere; font-weight: 500; margin-top: 1px; }
    .veiculo { display: grid; grid-template-columns: 2fr 1fr; } .descricao { padding: 5px 6px; overflow-wrap: anywhere; } .destino { min-width: 0; border-left: 1px solid oklch(0.72 0.015 250); padding: 5px 6px; white-space: pre-line; }
    .grupos-checklist { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 6px; }
    .grupos-checklist section { min-width: 0; }
    .checklist { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 8px; padding: 5px 6px; }
    .checklist div { display: flex; justify-content: space-between; align-items: center; gap: 3px; min-width: 0; } .checklist span { font-size: 8px; } .checklist b { min-width: 35px; max-width: 55%; padding: 1px 3px; border: 1px solid oklch(0.8 0.01 250); font-size: 8px; font-weight: 500; text-align: center; overflow-wrap: anywhere; }
    .observacoes { padding: 6px; font-size: 12px; line-height: 1.4; white-space: pre-wrap; text-align: justify; overflow-wrap: anywhere; } .observacoes strong { font-weight: 700; } .data { margin: 6px 0 0; }
    .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 22px 24px; padding: 24px 12px 0; break-inside: avoid; } .assinatura { min-width: 0; border-top: 1px solid oklch(0.35 0.01 250); text-align: center; padding-top: 3px; } .assinatura span { display: block; font-size: 8px; } .assinatura strong { overflow-wrap: anywhere; }
    footer { margin-top: 8px; padding-top: 4px; border-top: 1px solid oklch(0.8 0.01 250); font-size: 7px; display: flex; justify-content: space-between; gap: 8px; }
    .acoes { text-align: center; padding: 12px; } button { padding: 10px 18px; cursor: pointer; } @media print { body { background: oklch(1 0 0); } .folha { margin: 0; box-shadow: none; } .acoes { display: none; } h1,h2 { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style></head><body><div class="acoes"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div><main class="folha"><div class="conteudo">
    <img class="cabecalho-institucional" src="/images/cabecalho-recebimento-veiculos.jpg" alt="Cabeçalho da Prefeitura de Itajubá" onload="ajustarPaginaUnica()">
    <header><div><div class="marca">RECEBIMENTO DE VEÍCULOS</div><div>${texto(d.via || "Via Almoxarifado")}</div></div><div class="orgao"><b>${texto(d.orgao || "PREFEITURA MUNICIPAL DE ITAJUBÁ")}</b><br>${texto(d.endereco_orgao)}<br>${d.cnpj_orgao ? `CNPJ: ${texto(d.cnpj_orgao)}` : ""}</div></header>
    <h1>TERMO DE RECEBIMENTO DE VEÍCULOS Nº ${escapar(numero)}</h1>
    <p class="introducao">A Comissão de Recebimento de Veículos, designada pela Portaria nº ${texto(d.portaria || "144/2025")} e pelo Decreto nº 8342/2021, reuniu-se na Central de Distribuição e Logística para proceder ao exame de conferência do veículo abaixo descrito:</p>
    <section><h2>Identificação do recebimento</h2><div class="grade">
      ${campo("Nota fiscal", d.nota_fiscal || d.material)}${campo("Emissão", dataBr(d.emissao || ""))}${campo("Fornecedor", d.fornecedor)}${campo("Pedido", d.pedido)}
      ${campo("Data de recebimento", dataBr(d.data_recebimento || ""))}${campo("Data de cadastro", bem.incorporacao || "")}${campo("Patrimônio / RED", formatarCodigoRed(bem.codigo_red))}${campo("Valor da nota / unitário", moeda(Number(bem.valor)))}
      ${d.valor?.trim() && /^\d+(?:\.\d{1,2})?$/.test(d.valor) && Number.isFinite(Number(d.valor)) ? campo("Valor total da nota fiscal", moeda(Number(d.valor))) : ""}
      ${campo("Tipo de compra / incorporação", bem.tipo || "")}${campo("Quilometragem", d.km ? `${d.km} km` : "")}${campo("Empenho / ano", [d.empenho, d.ano_empenho].filter(Boolean).join(" / "))}${campo("Local físico", local || d.local_fisico)}
    </div></section>
    <section><h2>Descrição do veículo e secretaria de destino</h2><div class="veiculo"><div class="descricao">${descricao}</div><div class="destino"><b>SECRETARIA DESTINO</b><br><br>${texto(d.secretaria || local || d.local_fisico)}</div></div></section>
    <div class="grupos-checklist">${grupos}</div><section><h2>Observações gerais / conclusão da comissão</h2><div class="observacoes">${observacoes}</div></section>
    <p class="data">${texto(d.cidade || "Itajubá")}, ${texto(dataBr(d.data_termo || d.data_recebimento || termo.criado_em.slice(0, 10)))}.</p>
    <div class="assinaturas">${assinaturas}</div><footer><span>SysPatrimônio · Recebimento de veículos</span><span>Termo ${escapar(numero)} · Patrimônio ${escapar(formatarCodigoRed(bem.codigo_red))}</span></footer>
  </div></main><script type="text/javascript">
    function ajustarPaginaUnica() {
      var folha = document.querySelector('.folha');
      var conteudo = document.querySelector('.conteudo');
      if (!folha || !conteudo) return;
      conteudo.style.transform = 'none';
      var altura = Math.max(conteudo.scrollHeight, conteudo.offsetHeight);
      var escala = Math.min(1, (folha.clientHeight - 2) / Math.max(1, altura));
      conteudo.style.transform = 'scale(' + escala + ')';
    }
    ajustarPaginaUnica();
    window.addEventListener('load', ajustarPaginaUnica);
    window.addEventListener('beforeprint', ajustarPaginaUnica);
  </script></body></html>`;
}

export function imprimirTermoVeiculo(bem: Tables<"bens">, termo: Tables<"recebimentos_veiculos">, local = ""): boolean {
  const janela = window.open("", "_blank");
  if (!janela) return false;
  janela.opener = null;
  janela.document.open();
  janela.document.write(htmlTermoVeiculo(bem, termo, local));
  janela.document.close();
  janela.focus();
  return true;
}
