import type { Tables } from "@/integrations/supabase/types";
import { descricaoDetalhada, extrairDadosVeiculo, gruposChecklist, lerDadosRecebimento } from "@/lib/recebimento-veiculos";
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
  const descricao = descricaoDetalhada(d, modelo).split("\n").map((linha) => {
    const i = linha.indexOf(":");
    return `<div><b>${escapar(linha.slice(0, i + 1))}</b> ${escapar(linha.slice(i + 1))}</div>`;
  }).join("");
  const grupos = gruposChecklist.map((grupo) => `<section><h2>${escapar(grupo.titulo)}</h2><div class="checklist">${grupo.campos.map((c) => `<div><span>${escapar(c.nome)}</span><b>${texto(d[c.chave])}</b></div>`).join("")}</div></section>`).join("");
  const assinaturas = [1, 2, 3, 4].map((i) => `<div class="assinatura"><strong>${texto(d[`assinante_${i}`])}</strong><span>${texto(d[`cargo_${i}`] || (i === 1 ? "Presidente da comissão" : "Membro da comissão"))}</span></div>`).join("");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo de recebimento de veículos ${escapar(numero)}</title><style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: oklch(0.96 0.005 250); color: oklch(0.2 0.02 255); font: 9px/1.35 Arial, sans-serif; }
    .folha { max-width: 190mm; margin: 16px auto; padding: 10mm; background: oklch(1 0 0); box-shadow: 0 3px 20px oklch(0 0 0 / 12%); }
    header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid oklch(0.4 0.08 250); padding-bottom: 9px; margin-bottom: 9px; }
    .marca { font-size: 14px; font-weight: 800; color: oklch(0.35 0.08 250); } .orgao { text-align: right; font-size: 9px; white-space: pre-line; }
    h1 { margin: 0; padding: 8px 10px; border: 1px solid oklch(0.7 0.02 250); background: oklch(0.94 0.015 250); font-size: 13px; color: oklch(0.28 0.05 250); text-align: center; }
    .introducao { margin: 8px 0; text-align: justify; } section { margin-top: 6px; border: 1px solid oklch(0.72 0.015 250); break-inside: avoid; }
    h2 { margin: 0; padding: 4px 7px; font-size: 9px; text-transform: uppercase; letter-spacing: .35px; background: oklch(0.92 0.015 250); border-bottom: 1px solid oklch(0.72 0.015 250); }
    .grade { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); } .campo { min-width: 0; padding: 5px 7px; border-bottom: 1px solid oklch(0.88 0.01 250); }
    .campo span { display: block; font-size: 7px; font-weight: bold; text-transform: uppercase; color: oklch(0.43 0.02 250); } .campo strong { display: block; overflow-wrap: anywhere; font-weight: 500; margin-top: 2px; }
    .veiculo { display: grid; grid-template-columns: 2fr 1fr; } .descricao { padding: 7px; overflow-wrap: anywhere; } .destino { border-left: 1px solid oklch(0.72 0.015 250); padding: 7px; white-space: pre-line; }
    .checklist { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 12px; padding: 6px 7px; }
    .checklist div { display: flex; justify-content: space-between; align-items: center; gap: 4px; min-width: 0; } .checklist span { font-size: 7.5px; } .checklist b { min-width: 48px; max-width: 55%; padding: 2px 4px; border: 1px solid oklch(0.8 0.01 250); font-size: 8px; font-weight: 500; text-align: center; overflow-wrap: anywhere; }
    .observacoes { padding: 7px; white-space: pre-wrap; text-align: justify; overflow-wrap: anywhere; } .data { margin: 10px 0 0; }
    .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 24px 25px; padding: 30px 15px 0; break-inside: avoid; } .assinatura { border-top: 1px solid oklch(0.35 0.01 250); text-align: center; padding-top: 4px; } .assinatura span { display: block; font-size: 8px; } .assinatura strong { overflow-wrap: anywhere; }
    footer { margin-top: 14px; padding-top: 5px; border-top: 1px solid oklch(0.8 0.01 250); font-size: 7px; display: flex; justify-content: space-between; }
    .acoes { text-align: center; padding: 12px; } button { padding: 10px 18px; cursor: pointer; } @media print { body { background: oklch(1 0 0); } .folha { margin: 0; padding: 0; max-width: none; box-shadow: none; } .acoes { display: none; } h1,h2 { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style></head><body><div class="acoes"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div><main class="folha">
    <header><div><div class="marca">RECEBIMENTO DE VEÍCULOS</div><div>${texto(d.via || "Via Almoxarifado")}</div></div><div class="orgao"><b>${texto(d.orgao || "PREFEITURA MUNICIPAL DE ITAJUBÁ")}</b><br>${texto(d.endereco_orgao)}<br>${d.cnpj_orgao ? `CNPJ: ${texto(d.cnpj_orgao)}` : ""}</div></header>
    <h1>TERMO DE RECEBIMENTO DE VEÍCULOS Nº ${escapar(numero)}</h1>
    <p class="introducao">A comissão de recebimento de veículos${d.portaria ? `, designada pela Portaria nº ${texto(d.portaria)},` : ""} reúne-se para proceder à conferência e à inspeção do veículo abaixo descrito, verificando sua conformidade com as especificações técnicas e demais exigências${d.pedido ? ` da Ordem de Compra nº ${texto(d.pedido)}` : " da aquisição"}.</p>
    <section><h2>Identificação do recebimento</h2><div class="grade">
      ${campo("Nota fiscal", d.nota_fiscal || d.material)}${campo("Emissão", dataBr(d.emissao || ""))}${campo("Fornecedor", d.fornecedor)}${campo("Pedido", d.pedido)}
      ${campo("Data de recebimento", dataBr(d.data_recebimento || ""))}${campo("Data de cadastro", bem.incorporacao || "")}${campo("Patrimônio / RED", formatarCodigoRed(bem.codigo_red))}${campo("Valor da nota / unitário", moeda(Number(bem.valor)))}
      ${campo("Tipo de compra / incorporação", bem.tipo || "")}${campo("Quilometragem", d.km ? `${d.km} km` : "")}${campo("Empenho / ano", [d.empenho, d.ano_empenho].filter(Boolean).join(" / "))}${campo("Local físico", local || d.local_fisico)}
    </div></section>
    <section><h2>Descrição do veículo e secretaria de destino</h2><div class="veiculo"><div class="descricao">${descricao}</div><div class="destino"><b>SECRETARIA DESTINO</b><br><br>${texto(d.secretaria || local || d.local_fisico)}</div></div></section>
    ${grupos}<section><h2>Observações gerais / conclusão da comissão</h2><div class="observacoes">${texto(d.observacoes_gerais)}</div></section>
    <p class="data">${texto(d.cidade || "Itajubá")}, ${texto(dataBr(d.data_termo || d.data_recebimento || termo.criado_em.slice(0, 10)))}.</p>
    <div class="assinaturas">${assinaturas}</div><footer><span>SysPatrimônio · Recebimento de veículos</span><span>Termo ${escapar(numero)} · Patrimônio ${escapar(formatarCodigoRed(bem.codigo_red))}</span></footer>
  </main></body></html>`;
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
