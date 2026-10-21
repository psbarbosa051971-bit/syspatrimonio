import type { ResultadoPesquisaDinamica } from "@/lib/pesquisa-dinamica";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { limparDescricao } from "@/lib/pdf-parse";
import { statusBem } from "@/lib/status-bem";

const escapar = (valor: unknown) => String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[caractere]!);
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Recebe exatamente os bens visíveis, incluindo eventuais filtros adicionais. */
export function htmlPesquisaDinamica(
  resultado: ResultadoPesquisaDinamica,
  filtros: { busca?: string; ano?: string } = {},
): string {
  const emitido = new Date().toLocaleString("pt-BR");
  const total = resultado.bens.reduce((soma, bem) => soma + Number(bem.valor), 0);
  const salas = new Map<string | null, ResultadoPesquisaDinamica["bens"]>();
  for (const bem of resultado.bens) {
    const bensDaSala = salas.get(bem.sala_id);
    if (bensDaSala) bensDaSala.push(bem);
    else salas.set(bem.sala_id, [bem]);
  }
  const grupos = Array.from(salas, ([salaId, bens]) => {
    const nome = salaId ? resultado.locais[salaId] || "Sala não identificada" : "Sem sala";
    const subtotal = bens.reduce((soma, bem) => soma + Number(bem.valor), 0);
    const linhas = bens.map((bem) => `<tr>
      <td class="codigo">${escapar(formatarCodigoRed(bem.codigo_red))}</td>
      <td>${escapar(limparDescricao(bem.descricao))}</td>
      <td>${escapar(bem.incorporacao || "—")}</td>
      <td>${escapar(bem.tipo || "—")}</td>
      <td>${escapar(statusBem(bem))}</td>
      <td class="valor">${escapar(moeda(Number(bem.valor)))}</td>
    </tr>`).join("");
    return `<section class="sala">
      <table aria-label="Bens da sala: ${escapar(nome)}"><colgroup>
        <col style="width:9%"><col style="width:41%"><col style="width:11%">
        <col style="width:9%"><col style="width:15%"><col style="width:15%">
      </colgroup><thead><tr class="titulo-sala"><th colspan="6"><h3>${escapar(nome)}</h3></th></tr>
        <tr><th>PATRIMÔNIO</th><th class="descricao">DESCRIÇÃO DO BEM</th>
        <th>INCORPORAÇÃO</th><th>TIPO</th><th>STATUS</th><th class="valor">VALOR</th></tr></thead>
      <tbody>${linhas}</tbody></table>
      <div class="totais subtotal" aria-label="Total da sala: ${escapar(nome)}"><span>${String(bens.length).padStart(2, "0")} ITEM(NS)</span>
        <span>VALOR TOTAL DA SALA: ${escapar(moeda(subtotal))}</span></div>
    </section>`;
  }).join("");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>Relatório da pesquisa dinâmica — SysPatrimônio</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: oklch(0 0 0); background: oklch(1 0 0); font: 10px/1.4 Arial, sans-serif; }
      main { max-width: 273mm; margin: 20px auto; }
      h1 { margin: 0 0 4px; font-size: 17px; }
      h2 { margin: 0 0 12px; font-size: 14px; }
      p { margin: 4px 0; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 12px; }
      thead { display: table-header-group; }
      th, td { border: 1px solid oklch(0 0 0); padding: 5px; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
      th { background: oklch(1 0 0); text-align: center; font-size: 9px; }
      td { text-align: center; }
      td:nth-child(2), th.descricao { text-align: left; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      .codigo { font-weight: bold; }
      .valor { text-align: right; white-space: nowrap; }
      .sala { margin-top: 24px; margin-bottom: 22mm; break-inside: avoid; page-break-inside: avoid; }
      .titulo-sala th { border: 0; padding: 0 0 16px; text-align: left; }
      .sala h3 { margin: 0; font-size: 12px; break-after: avoid; page-break-after: avoid; }
      .sala table { margin-top: 0; }
      .subtotal { break-before: avoid; page-break-before: avoid; }
      .totais { margin-top: 6mm; border: 1px solid oklch(0 0 0); display: flex; justify-content: space-between; font-weight: bold; break-inside: avoid; page-break-inside: avoid; }
      .totais span { padding: 2px 8px; }
      .totais span:last-child { border-left: 1px solid oklch(0 0 0); min-width: 25%; text-align: right; }
      .total-geral { margin-top: 12mm; }
      .acoes { text-align: center; padding: 12px; }
      button { padding: 10px 18px; cursor: pointer; }
      @media print {
        main { max-width: none; margin: 0; }
        .acoes { display: none; }
        th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      }
    </style></head><body>
    <div class="acoes"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
    <main><h1>PREFEITURA MUNICIPAL DE ITAJUBÁ</h1><h2>RELATÓRIO DA PESQUISA DINÂMICA</h2>
    <p><strong>Pesquisa:</strong> ${escapar(resultado.termo)}</p>
    ${filtros.busca ? `<p><strong>Filtro dos bens:</strong> ${escapar(filtros.busca)}</p>` : ""}
    ${filtros.ano ? `<p><strong>Ano de incorporação:</strong> ${escapar(filtros.ano)}</p>` : ""}
    <p>Emitido em: ${escapar(emitido)} · SysPatrimônio · Somente os resultados filtrados.</p>
    ${grupos || '<p class="sem-resultados">Nenhum bem encontrado para os filtros aplicados.</p>'}
    <div class="totais total-geral"><span>QUANTIDADE DE BENS: ${resultado.bens.length}</span><span>VALOR TOTAL: ${escapar(moeda(total))}</span></div>
    </main><script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
    </body></html>`;
}
