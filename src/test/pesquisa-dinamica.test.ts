import { beforeEach, describe, expect, it, vi } from "vitest";
import { correspondePesquisaDinamica, pesquisarBensEmTodasAsSalas } from "@/lib/pesquisa-dinamica";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));

const bem = { codigo_red: "987654", descricao: "Módulo de aço azul", valor: 1250.75 };

beforeEach(() => vi.clearAllMocks());

describe("Pesquisa dinâmica em todas as salas", () => {
  it.each(["987", "DULO DE A", "aço", "azul", "1250.75", "1250,75", "1.250,75", "R$ 1.250,75"])(
    "encontra código, trecho da descrição ou valor: %s", (termo) => {
      expect(correspondePesquisaDinamica(bem, termo)).toBe(true);
    },
  );

  it.each(["", "   ", "inexistente", "outro local"])("não corresponde a %s", (termo) => {
    expect(correspondePesquisaDinamica(bem, termo)).toBe(false);
  });

  it("consulta todas as páginas de salas e bens, sem depender da sala selecionada", async () => {
    const salas = Array.from({ length: 501 }, (_, indice) => ({ id: `sala-${indice}`, nome: `Local ${indice}` }));
    const bens = Array.from({ length: 501 }, (_, indice) => ({
      ...bem, id: `bem-${indice}`, sala_id: `sala-${indice}`,
      codigo_red: String(indice).padStart(4, "0"), descricao: "Mesa",
    }));
    bens[500] = { ...bens[500]!, descricao: "Módulo de aço azul" };
    const paginas: string[] = [];
    mocks.from.mockImplementation((tabela: string) => {
      const consulta = {
        select: () => consulta,
        order: () => consulta,
        range: async (inicio: number, fim: number) => {
          paginas.push(`${tabela}:${inicio}`);
          return { data: (tabela === "salas" ? salas : bens).slice(inicio, fim + 1), error: null };
        },
      };
      return consulta;
    });
    const resultado = await pesquisarBensEmTodasAsSalas("dulo de a");
    expect(resultado.bens.map((item) => item.id)).toEqual(["bem-500"]);
    expect(resultado.locais["sala-500"]).toBe("Local 500");
    expect(paginas).toEqual(["salas:0", "salas:500", "bens:0", "bens:500"]);
  });

  it("informa falhas sem entregar resultados parciais", async () => {
    const erro = { message: "Falha de conexão" };
    mocks.from.mockImplementation(() => {
      const consulta = {
        select: () => consulta,
        order: () => consulta,
        range: async () => ({ data: null, error: erro }),
      };
      return consulta;
    });
    await expect(pesquisarBensEmTodasAsSalas("mesa")).rejects.toEqual(erro);
  });
});
