import { describe, it, expect } from "vitest";
import { parsearFornecedorHtml } from "@/lib/html-fornecedor";
const html = `<table><tr><td>Fornecedor:</td><td>AMORIM COMERCIO LTDA</td></tr>
<tr><td>76958</td><td>MICROFONE</td><td>2026</td><td>3162</td><td>2026</td><td>7438</td><td>21/09/2026</td><td>Aquisição</td><td>R$ 995,97</td></tr>
<tr><td>Local Atual:</td><td>SECOM</td><td>Doc. Entrada</td><td>000000013</td></tr></table>`;
describe("html por fornecedor", () => {
  it("lê pedido, empenho, nota e fornecedor", () => {
    expect(parsearFornecedorHtml(html)).toEqual([{ codigo_red: "76958", descricao: "MICROFONE", ano_pedido: "2026", pedido: "3162", ano_empenho: "2026", empenho: "7438", nota_fiscal: "000000013", fornecedor: "AMORIM COMERCIO LTDA", valor: 995.97 }]);
  });

  it("converte milhares e centavos em reais", () => {
    expect(parsearFornecedorHtml(html.replace("R$ 995,97", "R$ 12.345,67"))[0]?.valor).toBe(12345.67);
  });

  it("importa valor zero sem tratar como ausente", () => {
    expect(parsearFornecedorHtml(html.replace("R$ 995,97", "R$ 0,00"))[0]?.valor).toBe(0);
  });

  it("não inventa valor quando a informação está vazia ou inválida", () => {
    for (const valor of ["", "Não informado", "R$ abc"]) {
      expect(parsearFornecedorHtml(html.replace("R$ 995,97", valor))[0]?.valor).toBeUndefined();
    }
  });

  it("preserva colunas vazias para não confundir empenho com valor", () => {
    const incompleto = html.replace("<td>2026</td><td>7438</td>", "<td></td><td>7438</td>");
    expect(parsearFornecedorHtml(incompleto)[0]).toMatchObject({ ano_empenho: "", empenho: "7438", valor: 995.97 });
  });

  it("reconhece a posição do valor pelo cabeçalho", () => {
    const comCabecalho = `<table><tr><td>Fornecedor: Empresa</td></tr>
      <tr><th>Código RED</th><th>Descrição</th><th>Ano pedido</th><th>Pedido</th><th>Ano empenho</th><th>Empenho</th><th>Valor</th></tr>
      <tr><td>123</td><td>Mesa</td><td>2026</td><td>1</td><td>2026</td><td>2</td><td>1.234,56</td></tr></table>`;
    expect(parsearFornecedorHtml(comCabecalho)[0]?.valor).toBe(1234.56);
  });

  it("lê a grade Jasper do 3880.htm com margem vazia e colspans", () => {
    const linhaBem = (codigo: string, descricao: string, valor: string) => `<tr>
      <td></td><td colspan="2"><span>${codigo}</span></td>
      <td colspan="6"><span>${descricao}</span></td>
      <td colspan="2">2026</td><td>3880</td><td>2026</td><td>9367</td>
      <td>09/11/2026</td><td>Aquisição</td>
      <td colspan="2"><span>${valor}</span></td><td colspan="3"></td></tr>
      <tr><td></td><td colspan="2">Local Atual:</td>
      <td colspan="6">SECRETARIA MUNICIPAL DE MEIO AMBIENTE - SEMEA</td>
      <td></td><td>Doc. Entrada</td><td>000010335</td><td colspan="9"></td></tr>
      <tr><td colspan="21"></td></tr>`;
    const relatorio = `<table><tr><td>&nbsp;</td><td>
      <table class="jrPage">
        <tr>${Array.from({ length: 21 }, () => '<td style="width:20px"></td>').join("")}</tr>
        <tr><td></td><td colspan="20">Local Físico: SEMEA; Data de: 09/11/2026</td></tr>
        <tr><td></td><td colspan="3">Fornecedor:</td>
          <td colspan="15">M&amp;R EQUIPAMENTOS E MOVEIS LTDA -</td><td colspan="2"></td></tr>
        <tr><td></td><td colspan="2">Código Red.:</td><td colspan="6">Descrição do bem</td>
          <td colspan="2">Ano Pedido</td><td>Pedido</td><td>Ano Empenho</td><td>Empenho</td>
          <td>Incorporação</td><td>Tipo</td><td colspan="4">Valor</td><td></td></tr>
        ${linhaBem("77181", "CADEIRA FIXA PÉS PALITOS EM TECIDO PRETO", "R$ 114,00")}
        ${linhaBem("77189", "ESTANTE DE AÇO 06 PRATELEIRAS", "R$ 300,00")}
      </table>
      <table class="jrPage">
        <tr><td colspan="21">Continuação</td></tr>
        ${linhaBem("77190", "ESTANTE DE AÇO 06 PRATELEIRAS", "R$ 300,00")}
        <tr><td></td><td colspan="15">Total do Fornecedor:</td><td>R$ 714,00</td></tr>
      </table>
    </td></tr></table>`;
    const itens = parsearFornecedorHtml(relatorio);
    expect(itens).toHaveLength(3);
    expect(itens[0]).toEqual({
      codigo_red: "77181", descricao: "CADEIRA FIXA PÉS PALITOS EM TECIDO PRETO",
      ano_pedido: "2026", pedido: "3880", ano_empenho: "2026", empenho: "9367",
      nota_fiscal: "000010335", fornecedor: "M&R EQUIPAMENTOS E MOVEIS LTDA -", valor: 114,
    });
    expect(itens[1]).toMatchObject({ codigo_red: "77189", valor: 300, nota_fiscal: "000010335" });
    expect(itens[2]).toMatchObject({
      codigo_red: "77190", valor: 300, nota_fiscal: "000010335",
      fornecedor: "M&R EQUIPAMENTOS E MOVEIS LTDA -",
    });
  });

  it("remove só as margens sem deslocar campos vazios no meio da linha", () => {
    const comMargens = html
      .replace(/<tr>/g, "<tr><td></td><td>&nbsp;</td>")
      .replace("<td>2026</td><td>7438</td>", "<td></td><td>7438</td>");
    expect(parsearFornecedorHtml(comMargens)[0]).toMatchObject({
      codigo_red: "76958", ano_empenho: "", empenho: "7438",
      nota_fiscal: "000000013", fornecedor: "AMORIM COMERCIO LTDA", valor: 995.97,
    });
  });
});
