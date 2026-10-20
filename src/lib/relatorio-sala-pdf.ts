import type { Tables } from "@/integrations/supabase/types";
import { limparDescricao } from "@/lib/pdf-parse";
import { formatarCodigoRed } from "@/lib/codigo-red";

export type DadosRelatorioSala = {
  sala: Pick<Tables<"salas">, "nome" | "endereco" | "unidade" | "responsavel">;
  departamento: string;
  responsavel: string;
  bens: Tables<"bens">[];
};
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Gera um arquivo real, sem depender da janela de impressão do navegador. */
export async function gerarRelatorioSalaPdf({ sala, departamento, responsavel, bens }: DadosRelatorioSala): Promise<File> {
  // "jspdf" (raiz) não é resolúvel no build do servidor (workerd): usar o arquivo ESM direto.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf/dist/jspdf.es.min.js"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const emitido = new Date().toLocaleString("pt-BR");
  pdf.setProperties({ title: `Relatório de bens — ${sala.nome}`, author: "SysPatrimônio" });
  autoTable(pdf, {
    startY: 12, theme: "plain", margin: { left: 12, right: 12 },
    body: [
      [{ content: "PREFEITURA MUNICIPAL DE ITAJUBÁ", styles: { fontSize: 15, fontStyle: "bold" } }],
      [{ content: "RELATÓRIO DE BENS DA SALA", styles: { fontSize: 12, fontStyle: "bold" } }],
      [`Local Físico: ${sala.nome}`],
      [`Departamento: ${departamento || "—"}     Unidade: ${sala.unidade || "—"}`],
      [`Endereço: ${sala.endereco || "—"}`],
      [`Responsável pela sala: ${responsavel || sala.responsavel || "—"}`],
      [`Emitido em: ${emitido} · Relação completa dos bens atuais da sala.`],
    ], styles: { font: "helvetica", fontSize: 9, cellPadding: 1.5, textColor: [0, 0, 0] },
  });
  const inicio = (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 62;
  autoTable(pdf, {
    startY: inicio + 4, margin: { top: 12, left: 12, right: 12, bottom: 16 },
    head: [["", "PATRIMÔNIO", "DESCRIÇÃO DO BEM", "INCORPORAÇÃO", "TIPO / SITUAÇÃO", "VALOR"]],
    body: [...bens].sort((a, b) =>
      limparDescricao(a.descricao).localeCompare(limparDescricao(b.descricao), "pt-BR", { sensitivity: "base", numeric: true })
      || a.codigo_red.localeCompare(b.codigo_red, "pt-BR", { numeric: true })
    ).map((bem) => [
      "", formatarCodigoRed(bem.codigo_red), limparDescricao(bem.descricao), bem.incorporacao || "—",
      bem.conferencia_finalizada && !bem.conferido ? "Não localizado" : bem.tipo || "—", moeda(Number(bem.valor)),
    ]),
    foot: [[{ content: `QUANTIDADE DE BENS: ${bens.length}`, colSpan: 4 }, "VALOR TOTAL", moeda(bens.reduce((soma, bem) => soma + Number(bem.valor), 0))]],
    showFoot: "lastPage", theme: "grid", rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: [0, 0, 0], lineColor: [90, 90, 90], lineWidth: 0.15 },
    headStyles: { fillColor: [220, 225, 232], textColor: [0, 0, 0], fontStyle: "bold" },
    footStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 25 }, 2: { cellWidth: 139 }, 3: { cellWidth: 33 }, 4: { cellWidth: 35 }, 5: { cellWidth: 33, halign: "right" } },
    didDrawCell: ({ section, column, cell }) => {
      if (section !== "body" || column.index !== 0) return;
      // Quadrado vetorial sempre vazio para marcação manual após localizar o bem.
      const tamanho = 3.5;
      pdf.saveGraphicsState();
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.25);
      pdf.rect(cell.x + (cell.width - tamanho) / 2, cell.y + (cell.height - tamanho) / 2, tamanho, tamanho, "S");
      pdf.restoreGraphicsState();
    },
  });
  const paginas = pdf.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina++) {
    pdf.setPage(pagina); pdf.setFontSize(8); pdf.setTextColor(80);
    pdf.text(`SysPatrimônio · ${emitido}`, 12, 202);
    pdf.text(`Página ${pagina} de ${paginas}`, 285, 202, { align: "right" });
  }
  const nome = sala.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 90) || "sala";
  return new File([pdf.output("blob")], `Relatorio-${nome}.pdf`, { type: "application/pdf" });
}
