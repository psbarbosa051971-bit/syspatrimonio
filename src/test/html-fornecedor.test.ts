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
});
