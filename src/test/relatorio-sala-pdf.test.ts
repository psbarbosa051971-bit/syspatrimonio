import { beforeEach, describe, expect, it, vi } from "vitest";
import autoTable, { type CellHookData } from "jspdf-autotable";
import { gerarRelatorioSalaPdf } from "@/lib/relatorio-sala-pdf";
import type { Tables } from "@/integrations/supabase/types";

vi.mock("jspdf-autotable", async (importOriginal) => {
  const original = await importOriginal<typeof import("jspdf-autotable")>();
  return { ...original, default: vi.fn(original.default) };
});

beforeEach(() => vi.clearAllMocks());

const sala = { nome: "Sala da Saúde / 01", endereco: "Rua Central", unidade: "SAÚDE", responsavel: "Maria" };
const bem: Tables<"bens"> = {
  id: "bem", user_id: "usuario", sala_id: "sala", codigo_red: "60651", descricao: "Mesa de escritório",
  valor: 120.5, created_at: "2026-10-17T12:00:00Z", conferido: true, conferencia_finalizada: true, ano_pedido: null, pedido: null, ano_empenho: null, empenho: null, nota_fiscal: null, fornecedor: null,
  observacao: null, incorporacao: "2026", tipo: "Mobiliário", importacao_id: null,
};

describe("Arquivo PDF do relatório da sala", () => {
  it("gera um PDF com nome seguro para anexar no WhatsApp", async () => {
    const arquivo = await gerarRelatorioSalaPdf({ sala, departamento: "Patrimônio", responsavel: "Maria", bens: [bem] });
    expect(arquivo).toBeInstanceOf(File);
    expect(arquivo.type).toBe("application/pdf");
    expect(arquivo.name).toBe("Relatorio-Sala-da-Saude-01.pdf");
    expect(arquivo.size).toBeGreaterThan(1000);
  });

  it("inclui uma caixa vazia à esquerda do patrimônio em cada bem, mesmo se já conferido", async () => {
    await gerarRelatorioSalaPdf({
      sala, departamento: "Patrimônio", responsavel: "Maria",
      bens: [bem, { ...bem, id: "outro", codigo_red: "60652", conferido: false }],
    });
    const [pdf, tabela] = vi.mocked(autoTable).mock.calls[1];
    expect(tabela.head).toEqual([["", "PATRIMÔNIO", "DESCRIÇÃO DO BEM", "INCORPORAÇÃO", "TIPO / SITUAÇÃO", "VALOR"]]);
    expect(tabela.body).toHaveLength(2);
    for (const linha of tabela.body as string[][]) {
      expect(linha[0]).toBe("");
      expect(linha).toHaveLength(6);
    }
    const retangulo = vi.spyOn(pdf, "rect");
    const dados = {
      section: "body", column: { index: 0 }, cell: { x: 10, y: 20, width: 8, height: 10 },
    } as CellHookData;
    tabela.didDrawCell?.(dados);
    expect(retangulo).toHaveBeenCalledExactlyOnceWith(12.25, 23.25, 3.5, 3.5, "S");
    tabela.didDrawCell?.({ ...dados, section: "head" });
    tabela.didDrawCell?.({ ...dados, section: "foot" });
    tabela.didDrawCell?.({ ...dados, column: { ...dados.column, index: 1 } as CellHookData["column"] });
    expect(retangulo).toHaveBeenCalledTimes(1);
    retangulo.mockRestore();
  });

  it("permite gerar o relatório de uma sala sem bens", async () => {
    const arquivo = await gerarRelatorioSalaPdf({ sala, departamento: "", responsavel: "", bens: [] });
    expect(arquivo.type).toBe("application/pdf");
    expect(arquivo.size).toBeGreaterThan(1000);
  });
});
