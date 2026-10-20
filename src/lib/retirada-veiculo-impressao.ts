import type { Tables } from "@/integrations/supabase/types";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { limparDescricao } from "@/lib/pdf-parse";
import { descricaoDetalhada, extrairDadosVeiculo, lerDadosRecebimento } from "@/lib/recebimento-veiculos";
import { numeroTermoVeiculo } from "@/lib/recebimento-veiculos-impressao";

const escapar = (valor: unknown) => String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const dataBr = (valor: string) => /^(\d{4})-(\d{2})-(\d{2})$/.test(valor) ? valor.split("-").reverse().join("/") : valor;
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function htmlRetiradaVeiculo(bem: Tables<"bens">, termo: Tables<"recebimentos_veiculos">, local = ""): string {
  const d = lerDadosRecebimento(termo.dados);
  const texto = (valor?: string) => escapar(valor?.trim() || "—");
  const destino = d.secretaria?.trim() || local || d.local_fisico || "";
  const modelo = d.modelo_veiculo?.trim() || extrairDadosVeiculo(limparDescricao(bem.descricao)).modelo;
  const identificadores = { ...extrairDadosVeiculo(limparDescricao(bem.descricao)).dados, ...d };
  const descricao = descricaoDetalhada(identificadores, modelo).split("\n").map((linha) => {
    const i = linha.indexOf(":");
    return `<div><strong>${escapar(linha.slice(0, i + 1))}</strong> ${escapar(linha.slice(i + 1).trim())}</div>`;
  }).join("");
  const dataImpressao = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const numero = numeroTermoVeiculo(termo);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title></title><style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: oklch(0.95 0 0); color: oklch(0 0 0); font: 11px/1.3 Arial, sans-serif; }
    .acoes { padding: 12px; text-align: center; } button { padding: 10px 18px; cursor: pointer; }
    .folha { position: relative; width: 281mm; height: 193mm; margin: 12px auto; padding: 0 1mm; background: oklch(1 0 0); }
    .conteudo { width: 279mm; transform-origin: top left; overflow-wrap: anywhere; }
    .cabecalho { display: block; width: 100%; height: 31mm; object-fit: contain; margin-bottom: 2mm; }
    .destino { border: 1px solid oklch(0.6 0 0); padding: 3mm; text-align: center; text-transform: uppercase; }
    .destino h1 { margin: 0 0 2mm; font: bold 19px 'Arial Narrow', Arial, sans-serif; }
    .destino p { margin: 0; font-size: 10px; }
    h2, .historico, .totais, .atencao { background: oklch(0.8 0 0); }
    h2 { margin: 0; padding: 1.5mm; font-size: 14px; text-align: center; }
    .historico { margin: 1mm 0; padding: 1.5mm; text-align: center; text-transform: uppercase; font-weight: bold; }
    .historico span { float: left; font-size: 9px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; border-top: 2px solid oklch(0 0 0); }
    th { background: oklch(0.74 0 0); border: 2px solid oklch(1 0 0); padding: 1mm; font-size: 10px; text-transform: uppercase; }
    td { vertical-align: top; padding: 1.5mm 1mm; text-align: center; font-size: 10px; overflow-wrap: anywhere; }
    .descricao { text-align: left; text-transform: uppercase; min-height: 30mm; }
    .totais { display: flex; justify-content: space-between; gap: 3mm; padding: 1.5mm; border-bottom: 1px solid oklch(0 0 0); font-weight: bold; }
    .total-geral { display: flex; justify-content: space-between; padding: 1mm; font-size: 9px; font-weight: bold; }
    .assinaturas { display: grid; grid-template-columns: 44% 1fr; gap: 5mm; margin-top: 2mm; }
    .quadro { border: 1.25px solid oklch(0 0 0); min-height: 61mm; padding: 3mm; display: flex; flex-direction: column; }
    .quadro h3 { margin: 0 0 3mm; font-size: 11px; text-decoration: underline; }
    .diretor { justify-content: space-between; }
    .assinatura { margin: 12mm 4mm 0; border-top: 1px solid oklch(0 0 0); padding-top: 1mm; text-align: center; font-size: 10px; }
    .declaracao { margin: 0; text-align: justify; text-indent: 4mm; font-size: 11px; line-height: 1.4; }
    .responsavel { margin: 0 0 2mm; font-size: 11px; }
    .data { margin: auto 0 0; padding-top: 6mm; text-align: center; font-weight: bold; font-size: 10px; }
    .atencao { margin-top: 1.5mm; padding: 1.5mm; text-align: center; font-size: 11px; font-weight: bold; }
    footer { position: absolute; bottom: 0; left: 1mm; right: 1mm; display: flex; justify-content: space-between; font-size: 8px; }
    @media print { body { background: oklch(1 0 0); } .folha { margin: 0; } .acoes { display: none; } h2, th, .historico, .totais, .atencao { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style></head><body><div class="acoes"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
  <main class="folha"><div class="conteudo">
    <img class="cabecalho" src="/images/cabecalho-recebimento-veiculos.jpg" alt="Prefeitura Municipal de Itajubá — Central de Distribuição e Logística / Material e Patrimônio" onload="ajustarPagina()">
    <div class="destino"><h1>${texto(destino)}</h1><p>${texto(d.retirada_endereco)}</p></div>
    <h2>TERMO DE RESPONSABILIDADE Nº ${escapar(numero)}</h2>
    <div class="historico"><span>HISTÓRICO:</span>BENS DISTRIBUÍDOS CONFORME PLANILHA ENVIADA AO CENTRO DE DISTRIBUIÇÃO E LOGÍSTICA E INCORPORADO(S) A (AO) ${texto(destino)}</div>
    <table aria-label="Veículo retirado"><colgroup><col style="width:9%"><col style="width:49%"><col style="width:7%"><col style="width:10%"><col style="width:9%"><col style="width:6%"><col style="width:10%"></colgroup>
    <thead><tr><th>Cód. reduz.</th><th>Descrição do(s)</th><th>Pedido</th><th>Incorporação</th><th>Aquisição</th><th>Estado</th><th>Valor unit.</th></tr></thead>
    <tbody><tr><td>${escapar(formatarCodigoRed(bem.codigo_red))}</td><td><div class="descricao">${descricao}</div></td><td>${texto(d.pedido)}</td><td>${texto(bem.tipo ?? "")}</td><td>${texto(dataBr(bem.incorporacao || ""))}</td><td>${texto(d.retirada_estado)}</td><td>${escapar(moeda(Number(bem.valor)))}</td></tr></tbody></table>
    <div class="totais"><span>LISTADO(S) POR GRUPO: &nbsp; 1</span><span>VALOR POR GRUPO: &nbsp; ${escapar(moeda(Number(bem.valor)))}</span></div>
    <div class="total-geral"><span>LISTADO(S) GERAL: &nbsp; 001</span><span>VALOR TOTAL: &nbsp; ${escapar(moeda(Number(bem.valor)))}</span></div>
    <div class="assinaturas"><section class="quadro diretor"><h3>DIRETOR DE MATERIAL E PATRIMÔNIO</h3><div class="assinatura"><strong>${d.retirada_diretor?.trim() ? `${texto(d.retirada_diretor)}<br>` : ""}CENTRAL DE DISTRIBUIÇÃO E LOGÍSTICA</strong></div></section>
    <section class="quadro"><p class="responsavel"><strong><u>RESPONSÁVEL:</u> &nbsp; ${texto(destino)}</strong></p>
    <p class="declaracao">DECLARO QUE RETIREI DA CENTRAL DE DISTRIBUIÇÃO E LOGÍSTICA O VEÍCULO ÔNIBUS RURAL ESCOLAR MOTOR DIESEL 275 L 59 PASSAGEIRO + CONDUTOR DISPOSITIVO POLTRONA MÓVEL MODELO 25811: IVECO 15-210 - ORE 3 JUNTAMENTE COM A CHAVE RESERVA, CRV/RECIBO, MANUAL DO PROPRIETÁRIO. O VEÍCULO FICARÁ SOB MINHA RESPONSABILIDADE. COMPROMETO-ME A ZELAR PELO VEÍCULO, MANTENDO-O EM CONDIÇÕES ADEQUADAS DE USO E CONSERVAÇÃO, UTILIZANDO-O EXCLUSIVAMENTE PARA O DESEMPENHO DAS ATIVIDADES INSTITUCIONAIS, BEM COMO A DEVOLVÊ-LO NAS MESMAS CONDIÇÕES EM QUE FOI RECEBIDO, RESSALVADO O DESGASTE NATURAL DECORRENTE DO USO NORMAL. AS APLICAÇÕES DESTE TERMO OBEDECEM, EM ESPECIAL, AO DISPOSTO NO ARTIGO 70, PARÁGRAFO ÚNICO, DA CONSTITUIÇÃO FEDERAL, SEGUNDO O QUAL: PRESTARÁ CONTAS QUALQUER PESSOA FÍSICA OU JURÍDICA, PÚBLICA OU PRIVADA, QUE UTILIZE, ARRECADE, GUARDE, GERENCIE OU ADMINISTRE DINHEIROS, BENS E VALORES PÚBLICOS OU PELOS QUAIS A UNIÃO RESPONDA, OU QUE, EM NOME DESTA, ASSUMA OBRIGAÇÕES DE NATUREZA PECUNIÁRIA.</p>
    <div class="assinatura"><strong>${d.retirada_responsavel?.trim() ? texto(d.retirada_responsavel) : "ASSINATURA DO RESPONSÁVEL PELA RETIRADA"}</strong>${d.retirada_documento?.trim() ? `<br>Matrícula / documento: ${texto(d.retirada_documento)}` : ""}</div>
    <p class="data">DATA DE RECEBIMENTO ${d.retirada_data?.trim() ? texto(dataBr(d.retirada_data)) : "____ / ____ / ________"}</p></section></div>
    <div class="atencao">ATENÇÃO: CONFERIR NO ATO DO RECEBIMENTO. NÃO ACEITAREMOS RECLAMAÇÕES APÓS O RECEBIMENTO E ASSINATURA DESTE TERMO.</div>
  </div><footer><span>SysPatrimônio · Retirada de veículo · Termo ${escapar(numero)}</span><span>${escapar(dataImpressao)}</span></footer></main>
  <script>function ajustarPagina() {
    var folha = document.querySelector('.folha'), conteudo = document.querySelector('.conteudo'), rodape = document.querySelector('footer');
    if (!folha || !conteudo) return;
    conteudo.style.transform = 'none';
    conteudo.style.width = '279mm';
    var disponivel = folha.clientHeight - (rodape ? rodape.offsetHeight + 8 : 0);
    var escala = 1;
    for (var tentativa = 0; tentativa < 8; tentativa++) {
      var altura = Math.max(conteudo.scrollHeight, conteudo.offsetHeight);
      var ajuste = Math.min(1, (disponivel - 2) / Math.max(1, altura * escala));
      if (ajuste >= 1) break;
      escala *= ajuste;
      conteudo.style.width = (279 / escala) + 'mm';
    }
    conteudo.style.transform = 'scale(' + escala + ')';
  }
  ajustarPagina(); window.addEventListener('load', ajustarPagina); window.addEventListener('beforeprint', ajustarPagina);
  </script></body></html>`;
}
