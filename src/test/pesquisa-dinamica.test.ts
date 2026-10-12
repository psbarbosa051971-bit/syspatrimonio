import { beforeEach, describe, expect, it, vi } from "vitest";
import { correspondePesquisaDinamica, pesquisarBensEmTodasAsSalas } from "@/lib/pesquisa-dinamica";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

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

  it("recebe somente os resultados já filtrados, com o local na mesma consulta", async () => {
    mocks.rpc.mockReturnValue({ range: vi.fn().mockResolvedValue({
      data: [{ bem: { ...bem, id: "bem-distante", sala_id: "sala-distante" }, local_nome: "Arquivo" }],
      error: null,
    }) });
    const resultado = await pesquisarBensEmTodasAsSalas(" dulo de a ");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("pesquisar_bens_salas", { _termo: "dulo de a" });
    expect(resultado.bens.map((item) => item.id)).toEqual(["bem-distante"]);
    expect(resultado.locais["sala-distante"]).toBe("Arquivo");
  });

  it("pagina apenas os resultados quando houver mais de 500 correspondências", async () => {
    const itens = Array.from({ length: 501 }, (_, indice) => ({
      bem: { ...bem, id: `bem-${indice}`, sala_id: `sala-${indice}` }, local_nome: `Local ${indice}`,
    }));
    const range = vi.fn(async (inicio: number, fim: number) => ({ data: itens.slice(inicio, fim + 1), error: null }));
    mocks.rpc.mockReturnValue({ range });
    const resultado = await pesquisarBensEmTodasAsSalas("azul");
    expect(resultado.bens).toHaveLength(501);
    expect(resultado.locais["sala-500"]).toBe("Local 500");
    expect(range.mock.calls).toEqual([[0, 499], [500, 999]]);
  });

  it("não consulta o banco para pesquisa vazia", async () => {
    expect(await pesquisarBensEmTodasAsSalas("  ")).toEqual({ termo: "", bens: [], locais: {} });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("informa falhas sem entregar resultados parciais", async () => {
    const erro = { message: "Falha de conexão" };
    mocks.rpc.mockReturnValue({ range: vi.fn().mockResolvedValue({ data: null, error: erro }) });
    await expect(pesquisarBensEmTodasAsSalas("mesa")).rejects.toEqual(erro);
  });
});
