import { describe, expect, it } from "vitest";
import { parsearPaginasTermo, type TextoPdf } from "@/lib/pdf-parse";
import { parsearFornecedorPdf } from "@/lib/pdf-fornecedor";

const item = (str: string, x: number, y: number): TextoPdf => ({ str, transform: [1, 0, 0, 1, x, y] });

describe("Importação somente de PDF", () => {
  it("mantém páginas de continuação no local correto e separa outro local", () => {
    const resultado = parsearPaginasTermo([
      [item("Local Físico: 12 - Escola A", 10, 700), item("10001 Mesa 10,00", 10, 650)],
      [item("10002 Cadeira 20,00", 10, 650)],
      [item("Local Físico: 13 - Escola B", 10, 700), item("10003 Armário 30,00", 10, 650)],
    ]);
    expect(resultado.bens.map((b) => b.codigo_red)).toEqual(["10001", "10002", "10003"]);
    expect(resultado.locais?.map((l) => l.cabecalho.local)).toEqual(["12 - Escola A", "13 - Escola B"]);
    expect(resultado.locais?.map((l) => l.bens.length)).toEqual([2, 1]);
  });

  it("não interpreta filtros do relatório como locais físicos", () => {
    const resultado = parsearPaginasTermo([[
      item("Local Físico: 12 - Escola A; Situação do Bem: ATIVO", 10, 700),
      item("Parâmetro de Ordenação: Código RED", 10, 680),
      item("10001 Mesa 10,00", 10, 650),
    ]]);
    expect(resultado.cabecalho.local).toBe("12 - Escola A");
    expect(resultado.bens).toHaveLength(1);
    expect(resultado.locais).toBeUndefined();
  });

  it("lê os dados do fornecedor e a nota fiscal no PDF", () => {
    const resultado = parsearFornecedorPdf([[
      item("Fornecedor: Empresa A", 10, 700),
      item("123", 10, 650), item("Mesa", 100, 650),
      item("2026", 300, 650), item("1", 350, 650),
      item("2026", 400, 650), item("2", 450, 650),
      item("Doc. Entrada: 614", 100, 630),
    ]]);
    expect(resultado).toEqual([{ codigo_red: "123", descricao: "Mesa", ano_pedido: "2026",
      pedido: "1", ano_empenho: "2026", empenho: "2", nota_fiscal: "614", fornecedor: "Empresa A" }]);
  });
});
