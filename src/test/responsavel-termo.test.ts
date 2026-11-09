import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
import { atualizarResponsaveisDosTermos } from "@/lib/responsavel-termo";
import { htmlDoTermo, type TermoResponsabilidade } from "@/lib/termo-responsabilidade";

const termo: TermoResponsabilidade = {
  id: "termo", numero: 10, termo_ano: 2026, created_at: "2026-10-10T12:00:00Z", arquivo: "bens.html",
  termo_snapshot: {
    local: "Sala teste", responsavel: "Nome antigo", cpf: "52998224725",
    bens: [{ codigo_red: "123", descricao: "Mesa", valor: 10 }],
    responsavel_recebimento: "Maria Recebedora", cpf_recebimento: "52998224725",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: { responsavel: "Ana Atual", cpf: "11144477735" }, error: null });
  mocks.from.mockReturnValue({ select: () => ({ in: () => Promise.resolve({
    data: [{ id: "termo", sala_id: "sala" }], error: null,
  }) }) });
});

describe("responsável pela sala na impressão do termo", () => {
  it("usa o nome e CPF atuais sem modificar o termo salvo nem o recebedor", async () => {
    const [atualizado] = await atualizarResponsaveisDosTermos([termo], "sala");
    const html = htmlDoTermo(atualizado!);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("dados_responsavel_sala_termo", { _sala_id: "sala" });
    expect(html).toContain("Ana Atual");
    expect(html).toContain("111.444.777-35");
    expect(html).toContain("Maria Recebedora");
    expect(html).not.toContain("Nome antigo");
    expect(htmlDoTermo(termo)).toContain("Nome antigo");
  });

  it("consulta a sala do termo quando ela não foi informada", async () => {
    const [atualizado] = await atualizarResponsaveisDosTermos([termo]);
    expect(mocks.from).toHaveBeenCalledWith("importacoes");
    expect(htmlDoTermo(atualizado!)).toContain("Ana Atual");
  });

  it("consulta uma única vez o responsável de termos da mesma sala", async () => {
    await atualizarResponsaveisDosTermos([termo, { ...termo, id: "outro" }], "sala");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("preserva o nome original quando a sala não tem responsável preenchido", async () => {
    mocks.rpc.mockResolvedValue({ data: { responsavel: "", cpf: "" }, error: null });
    expect(await atualizarResponsaveisDosTermos([termo], "sala")).toEqual([termo]);
  });

  it("não imprime silenciosamente se a consulta ao responsável falhar", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Falha na consulta" } });
    await expect(atualizarResponsaveisDosTermos([termo], "sala")).rejects.toThrow("responsável pela sala");
  });

  it("escapa caracteres do nome antes de exibir no documento", async () => {
    mocks.rpc.mockResolvedValue({ data: { responsavel: "Ana <script>", cpf: "" }, error: null });
    const [atualizado] = await atualizarResponsaveisDosTermos([termo], "sala");
    expect(htmlDoTermo(atualizado!)).toContain("Ana &lt;script&gt;");
    expect(htmlDoTermo(atualizado!)).not.toContain("Ana <script>");
  });
});
