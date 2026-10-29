import { beforeEach, describe, expect, it, vi } from "vitest";
import { agruparNotasIncorporadas, carregarNotasIncorporadas, htmlNotasIncorporadas, type BemNotaIncorporada } from "@/lib/notas-incorporadas";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
const bem = (id: string, dados: Partial<BemNotaIncorporada> = {}): BemNotaIncorporada => ({
  id, ano_empenho: "2026", empenho: "620", pedido: "372", fornecedor: "Fornecedor A",
  nota_fiscal: "000614", incorporacao: "10/01/2026", valor: 119000, ...dados,
});
function consulta() {
  const builder = { select: vi.fn(), eq: vi.fn(), not: vi.fn(), neq: vi.fn(), order: vi.fn(), range: vi.fn() };
  for (const metodo of [builder.select, builder.eq, builder.not, builder.neq, builder.order]) metodo.mockReturnValue(builder);
  return builder;
}
beforeEach(() => { vi.resetAllMocks(); });

describe("Relatório de notas incorporadas e empenhos", () => {
  it("agrupa bens sem duplicar IDs e calcula quantidades, notas, empenhos e valores", () => {
    const resultado = agruparNotasIncorporadas([
      bem("a"), bem("b"), bem("a"),
      bem("c", { empenho: "1923", nota_fiscal: "700", valor: 3984.61 }),
    ], "2026");
    expect(resultado.linhas).toHaveLength(2);
    expect(resultado.linhas[0]).toMatchObject({ empenho: "620", nota: "614", quantidade: 2, unitario: 119000, total: 238000 });
    expect(resultado).toMatchObject({ ano: "2026", quantidade: 3, notas: 2, empenhos: 2, total: 241984.61 });
  });

  it("usa o ano do empenho, não o ano da incorporação, e exclui bens sem incorporação", () => {
    const resultado = agruparNotasIncorporadas([
      bem("a", { incorporacao: "10/01/2027" }),
      bem("b", { ano_empenho: "2025" }),
      bem("c", { incorporacao: null }), bem("d", { incorporacao: "  " }),
    ], "2026");
    expect(resultado.quantidade).toBe(1);
    expect(resultado.linhas[0].ano).toBe("2026");
  });

  it("filtra pela data de incorporação incluindo os limites em formatos brasileiro e ISO", () => {
    const resultado = agruparNotasIncorporadas([
      bem("a", { incorporacao: "01/02/2026" }),
      bem("b", { incorporacao: "2026-02-28" }),
      bem("c", { incorporacao: "15/02/2026" }),
      bem("d", { incorporacao: "31/01/2026" }),
      bem("e", { incorporacao: "01/03/2026" }),
      bem("f", { incorporacao: "31/02/2026" }),
      bem("g", { incorporacao: "não informada" }),
      bem("h", { incorporacao: "15/02/2026", ano_empenho: "2025" }),
    ], "2026", { dataInicial: "2026-02-01", dataFinal: "2026-02-28" });
    expect(resultado).toMatchObject({ quantidade: 3, total: 357000, dataInicial: "2026-02-01", dataFinal: "2026-02-28" });
    expect(resultado.linhas[0].quantidade).toBe(3);
  });

  it("permite apenas um limite de data e mantém o ano do empenho como exercício", () => {
    const bens = [bem("a"), bem("b", { incorporacao: "10/01/2027" })];
    expect(agruparNotasIncorporadas(bens, "2026", { dataInicial: "2027-01-10" }).quantidade).toBe(1);
    expect(agruparNotasIncorporadas(bens, "2026", { dataFinal: "2026-01-10" }).quantidade).toBe(1);
    expect(agruparNotasIncorporadas(bens, "2026").quantidade).toBe(2);
  });

  it("rejeita períodos invertidos e datas inválidas antes de consultar", async () => {
    await expect(carregarNotasIncorporadas("2026", { dataInicial: "2026-02-01", dataFinal: "2026-01-01" })).rejects.toThrow("data inicial");
    await expect(carregarNotasIncorporadas("2026", { dataFinal: "2026-02-30" })).rejects.toThrow("datas válidas");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("aplica o filtro de datas na consulta e mostra o período na impressão", async () => {
    const builder = consulta();
    builder.range.mockResolvedValue({ data: [bem("a"), bem("b", { incorporacao: "10/02/2026" })], error: null });
    mocks.from.mockReturnValue(builder);
    const resultado = await carregarNotasIncorporadas("2026", { dataInicial: "2026-01-01", dataFinal: "2026-01-31" });
    expect(resultado.quantidade).toBe(1);
    const html = htmlNotasIncorporadas(resultado);
    expect(html).toContain("Data de incorporação: de 01/01/2026 · até 31/01/2026 (inclusive)");
    expect(htmlNotasIncorporadas(agruparNotasIncorporadas([], "2026"))).not.toContain("Data de incorporação:");
  });

  it("separa notas, fornecedores e valores unitários sem multiplicar o número de notas", () => {
    const resultado = agruparNotasIncorporadas([
      bem("a", { valor: 0.1 }), bem("b", { valor: 0.1 }),
      bem("c", { valor: 0.2 }), bem("d", { nota_fiscal: "615", valor: 1 }),
      bem("e", { fornecedor: "Fornecedor B", valor: 1 }),
    ], "2026");
    expect(resultado.linhas).toHaveLength(4);
    expect(resultado.notas).toBe(3);
    expect(resultado.total).toBe(2.4);
    expect(resultado.empenhos).toBe(1);
  });

  it("mantém bens com documentos ausentes e ordena empenhos numericamente", () => {
    const resultado = agruparNotasIncorporadas([
      bem("a", { empenho: "100" }), bem("b", { empenho: "20" }),
      bem("c", { empenho: null, nota_fiscal: null, pedido: null, fornecedor: null }),
    ], "2026");
    expect(resultado.linhas.map((l) => l.empenho)).toEqual(["", "20", "100"]);
    expect(resultado.quantidade).toBe(3);
    expect(resultado.empenhos).toBe(2);
    expect(resultado.notas).toBe(1);
  });

  it("consulta todas as páginas do exercício sem filtro de sala", async () => {
    const builder = consulta();
    builder.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => bem(String(i))), error: null })
      .mockResolvedValueOnce({ data: [bem("500")], error: null });
    mocks.from.mockReturnValue(builder);
    const resultado = await carregarNotasIncorporadas("2026");
    expect(resultado.quantidade).toBe(501);
    expect(builder.eq).toHaveBeenCalledExactlyOnceWith("ano_empenho", "2026");
    expect(builder.range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(builder.range).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it("não exibe um relatório parcial quando uma página falha", async () => {
    const builder = consulta();
    builder.range.mockResolvedValue({ data: null, error: { message: "Sem conexão" } });
    mocks.from.mockReturnValue(builder);
    await expect(carregarNotasIncorporadas("2026")).rejects.toMatchObject({ message: "Sem conexão" });
    await expect(carregarNotasIncorporadas("26")).rejects.toThrow("exercício válido");
  });

  it("gera impressão em paisagem com nota fiscal, totais e conteúdo escapado", () => {
    const html = htmlNotasIncorporadas(agruparNotasIncorporadas([
      bem("a", { fornecedor: '<script>alert("x")</script>' }),
    ], "2026"));
    expect(html).toContain("A4 landscape");
    expect(html).toContain("NOTA FISCAL");
    expect(html).toContain("614");
    expect(html).toContain("Valor incorporado ao patrimônio");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('<script>alert("x")');
    expect(html).toContain("Imprimir / Salvar em PDF");
  });
});
