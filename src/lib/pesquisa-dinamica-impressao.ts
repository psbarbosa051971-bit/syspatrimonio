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
  const linhas = resultado.bens.map((bem) => `<tr>
    <td class="codigo">${escapar(formatarCodigoRed(bem.codigo_red))}</td>
    <td>${escapar(limparDescricao(bem.descricao))}</td>
    <td>${escapar(bem.sala_id ? resultado.locais[bem.sala_id] || "—" : "—")}</td>
    <td>${escapar(bem.incorporacao || "—")}</td>
    <td>${escapar(bem.tipo || "—")}</td>
    <td>${escapar(statusBem(bem))}</td>
    <td class="valor">${escapar(moeda(Number(bem.valor)))}</td>
  </tr>`).join("");
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
      th, td { border: 1px solid oklch(0.6 0 0); padding: 5px; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
      th { background: oklch(0.92 0 0); text-align: left; font-size: 9px; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      .codigo { font-weight: bold; }
      .valor { text-align: right; white-space: nowrap; }
      .totais { margin-top: 10px; padding: 8px; border: 1px solid oklch(0.6 0 0); display: flex; justify-content: space-between; gap: 12px; font-weight: bold; break-inside: avoid; }
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
    <table aria-label="Resultado da pesquisa dinâmica"><colgroup>
      <col style="width:9%"><col style="width:31%"><col style="width:20%"><col style="width:11%">
      <col style="width:8%"><col style="width:11%"><col style="width:10%">
    </colgroup><thead><tr><th>PATRIMÔNIO</th><th>DESCRIÇÃO DO BEM</th><th>LOCAL FÍSICO</th>
      <th>INCORPORAÇÃO</th><th>TIPO</th><th>STATUS</th><th class="valor">VALOR</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="7">Nenhum bem encontrado para os filtros aplicados.</td></tr>'}</tbody></table>
    <div class="totais"><span>QUANTIDADE DE BENS: ${resultado.bens.length}</span><span>VALOR TOTAL: ${escapar(moeda(total))}</span></div>
    </main><script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
    </body></html>`;
}
