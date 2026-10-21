import { describe, it, expect } from "vitest";
import { parsearFornecedorHtml } from "@/lib/html-fornecedor";
const html = `<table><tr><td>Fornecedor:</td><td>AMORIM COMERCIO LTDA</td></tr>
<tr><td>76958</td><td>MICROFONE</td><td>2026</td><td>3162</td><td>2026</td><td>7438</td><td>21/09/2026</td><td>Aquisição</td><td>R$ 995,97</td></tr>
<tr><td>Local Atual:</td><td>SECOM</td><td>Doc. Entrada</td><td>000000013</td></tr></table>`;
describe("html por fornecedor", () => {
  it("lê pedido, empenho, nota e fornecedor", () => {
    expect(parsearFornecedorHtml(html)).toEqual([{ codigo_red: "76958", descricao: "MICROFONE", ano_pedido: "2026", pedido: "3162", ano_empenho: "2026", empenho: "7438", nota_fiscal: "000000013", fornecedor: "AMORIM COMERCIO LTDA" }]);
  });
});
