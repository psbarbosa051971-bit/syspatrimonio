import { moedaNota, type NotaFiscalXml } from "@/lib/notas-fiscais";

/** Prévia de leitura: não consulta a SEFAZ nem substitui o DANFE original. */
export async function gerarPreviaDanfe(nota: NotaFiscalXml): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf/dist/jspdf.es.min.js"),
    import("jspdf-autotable"),
  ]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 12;
  const largura = 186;
  let y = 12;
  const data = nota.emissao.slice(0, 10).split("-").reverse().join("/");
  pdf.setProperties({ title: `Prévia DANFE - NF-e ${nota.numero} - Série ${nota.serie}` });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("DANFE - PRÉVIA SIMPLIFICADA", margem, y + 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Documento auxiliar da nota fiscal eletrônica - visualização do XML", margem, y + 11);
  pdf.text(`NF-e nº ${nota.numero}   |   Série ${nota.serie}   |   Emissão: ${data || "Não informada"}`, margem, y + 17);
  y += 24;
  if (nota.homologacao) {
    pdf.setFont("helvetica", "bold");
    pdf.text("AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL", margem, y);
    y += 7;
  }

  function bloco(titulo: string, conteudo: string) {
    const linhas = pdf.splitTextToSize(conteudo || "Não informado", largura - 6) as string[];
    const altura = 11 + linhas.length * 4;
    if (y + altura > 275) { pdf.addPage(); y = margem; }
    pdf.setDrawColor(100);
    pdf.rect(margem, y, largura, altura);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(titulo, margem + 3, y + 5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(linhas, margem + 3, y + 10);
    y += altura + 3;
  }

  bloco("EMITENTE", [nota.emitente.nome, `CNPJ/CPF: ${nota.emitente.documento || "—"}   IE: ${nota.emitente.ie || "—"}`, nota.emitente.endereco].filter(Boolean).join("\n"));
  bloco("CHAVE DE ACESSO", nota.chave.match(/.{1,4}/g)?.join(" ") || nota.chave);
  bloco("NATUREZA DA OPERAÇÃO / PROTOCOLO INFORMADO NO XML", `${nota.natureza || "—"}\nProtocolo: ${nota.protocolo || "Não informado"}`);
  bloco("DESTINATÁRIO", [nota.destinatario.nome, `CNPJ/CPF: ${nota.destinatario.documento || "—"}   IE: ${nota.destinatario.ie || "—"}`, nota.destinatario.endereco].filter(Boolean).join("\n"));

  autoTable(pdf, {
    startY: y,
    margin: { left: margem, right: margem, bottom: 18 },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7, cellPadding: 1.5, overflow: "linebreak", textColor: 20, lineColor: 140, lineWidth: 0.1 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
    head: [["Código / NCM", "Descrição do produto", "CFOP", "Un.", "Qtd.", "V. unitário", "V. total"]],
    body: nota.itens.map((item) => [
      `${item.codigo}\n${item.ncm}`, item.descricao, item.cfop, item.unidade,
      Number(item.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 4 }),
      moedaNota(item.unitario), moedaNota(item.total),
    ]),
    columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 66 }, 2: { cellWidth: 12 }, 3: { cellWidth: 9 }, 4: { cellWidth: 17, halign: "right" }, 5: { cellWidth: 28, halign: "right" }, 6: { cellWidth: 29, halign: "right" } },
  });
  y = (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 4;
  bloco("TOTAIS DA NOTA", [
    `Produtos: ${moedaNota(nota.produtos)}   Frete: ${moedaNota(nota.frete)}   Desconto: ${moedaNota(nota.desconto)}`,
    `ICMS: ${moedaNota(nota.icms)}   IPI: ${moedaNota(nota.ipi)}   TOTAL DA NF-e: ${moedaNota(nota.total)}`,
  ].join("\n"));
  if (nota.adicionais) {
    // Informações longas podem ocupar várias páginas, sem cortar o conteúdo.
    autoTable(pdf, {
      startY: y, margin: { left: margem, right: margem, bottom: 18 }, theme: "grid",
      head: [["INFORMAÇÕES ADICIONAIS"]], body: [[nota.adicionais]],
      styles: { fontSize: 8, cellPadding: 3, textColor: 20, overflow: "linebreak" },
      headStyles: { fillColor: [235, 235, 235], textColor: 20 },
    });
  }
  const paginas = pdf.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina++) {
    pdf.setPage(pagina);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text("Prévia gerada do XML. Não substitui o DANFE original nem valida a autorização na SEFAZ.", margem, 286);
    pdf.text(`${pagina} / ${paginas}`, 198, 291, { align: "right" });
  }
  return pdf.output("blob");
}
