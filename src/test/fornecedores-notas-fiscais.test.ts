import { beforeEach, describe, expect, it, vi } from "vitest";
import { carregarFornecedoresNotas } from "@/lib/fornecedores-notas-fiscais";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));

type Linha = { fornecedor: string | null };
function consulta(data: Linha[] | null, error: { message: string } | null = null) {
  const builder = {
    select: vi.fn(), not: vi.fn(), neq: vi.fn(), order: vi.fn(),
    range: vi.fn().mockResolvedValue({ data, error }),
  };
  builder.select.mockReturnValue(builder);
  builder.not.mockReturnValue(builder);
  builder.neq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockReturnValue(consulta(null, { message: "Consulta indisponível" }));
  mocks.from.mockImplementation((tabela: string) => consulta(tabela === "bens"
    ? [{ fornecedor: "Fornecedor B" }, { fornecedor: "Fornecedor A" }, { fornecedor: "Fornecedor A" }, { fornecedor: null }]
    : [{ fornecedor: "Fornecedor C" }, { fornecedor: "Fornecedor A" }]));
});

describe("Carregamento de fornecedores das notas fiscais", () => {
  it("usa a consulta principal quando ela está disponível", async () => {
    mocks.rpc.mockReturnValue(consulta([{ fornecedor: "Fornecedor A" }]));
    await expect(carregarFornecedoresNotas()).resolves.toEqual({ fornecedores: ["Fornecedor A"], aviso: "" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("consulta as tabelas se a consulta principal falhar, unindo e ordenando sem duplicações", async () => {
    await expect(carregarFornecedoresNotas()).resolves.toEqual({
      fornecedores: ["Fornecedor A", "Fornecedor B", "Fornecedor C"], aviso: "",
    });
    expect(mocks.from).toHaveBeenCalledWith("bens");
    expect(mocks.from).toHaveBeenCalledWith("notas_fiscais");
  });

  it("busca todas as páginas de bens na alternativa", async () => {
    const bens = consulta(Array.from({ length: 500 }, () => ({ fornecedor: "Fornecedor A" })));
    bens.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({ fornecedor: "Fornecedor A" })), error: null })
      .mockResolvedValueOnce({ data: [{ fornecedor: "Fornecedor B" }], error: null });
    mocks.from.mockImplementation((tabela: string) => tabela === "bens" ? bens : consulta([]));
    await expect(carregarFornecedoresNotas()).resolves.toEqual({ fornecedores: ["Fornecedor A", "Fornecedor B"], aviso: "" });
    expect(bens.range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(bens.range).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it("preserva os fornecedores dos bens quando a consulta dos XMLs falha", async () => {
    mocks.from.mockImplementation((tabela: string) => tabela === "bens"
      ? consulta([{ fornecedor: "Fornecedor A" }])
      : consulta(null, { message: "Falha ao consultar XMLs" }));
    const resultado = await carregarFornecedoresNotas();
    expect(resultado.fornecedores).toEqual(["Fornecedor A"]);
    expect(resultado.aviso).toContain("lista de fornecedores está incompleta");
    expect(resultado.aviso).toContain("Falha ao consultar XMLs");
  });

  it("informa o detalhe do erro quando todas as alternativas falham", async () => {
    mocks.from.mockReturnValue(consulta(null, { message: "Conexão indisponível" }));
    await expect(carregarFornecedoresNotas()).rejects.toThrow("Não foi possível carregar os fornecedores. Conexão indisponível");
  });
});
