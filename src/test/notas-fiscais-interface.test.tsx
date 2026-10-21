import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotasFiscais } from "@/components/NotasFiscais";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), insert: vi.fn(), lerArquivo: vi.fn(), erro: vi.fn(), sucesso: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "usuario" } }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.erro, success: mocks.sucesso } }));
vi.mock("@/lib/notas-fiscais", async (original) => ({ ...await original<typeof import("@/lib/notas-fiscais")>(), lerArquivoNota: mocks.lerArquivo }));
vi.mock("@/components/DocumentoNotaFiscal", () => ({ DocumentoNotaFiscal: () => <article>Documento da nota</article> }));

const nota = { numero: "614", serie: "1", chave: "1".repeat(44), emitente: { nome: "Fornecedor A", documento: "12345678000123" } };
const file = () => new File(["<NFe />"], "nota.xml", { type: "application/xml" });

async function consultar(numero = "000614") {
  render(<NotasFiscais />);
  fireEvent.click(screen.getByRole("button", { name: "Notas Fiscais" }));
  await screen.findByRole("option", { name: "Fornecedor A" });
  fireEvent.change(screen.getByLabelText("Fornecedor"), { target: { value: "Fornecedor A" } });
  fireEvent.change(screen.getByLabelText("Número da nota fiscal"), { target: { value: numero } });
  await screen.findByText("Bens cadastrados referentes à nota");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation((nome: string) => {
    const resposta = nome === "fornecedores_notas_fiscais" ? [{ fornecedor: "Fornecedor A" }] : [{ id: "bem-1", codigo_red: "1234", descricao: "Mesa cadastrada", valor: 201, incorporacao: "2026" }];
    const consulta = { order: vi.fn(), range: vi.fn().mockResolvedValue({ data: resposta, error: null }) };
    consulta.order.mockReturnValue(consulta);
    return consulta;
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation(() => {
    const consulta = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ data: [], error: null }), insert: mocks.insert };
    consulta.select.mockReturnValue(consulta); consulta.eq.mockReturnValue(consulta); consulta.order.mockReturnValue(consulta);
    return consulta;
  });
  mocks.lerArquivo.mockResolvedValue({ xml: "<NFe />", nota });
});
afterEach(cleanup);

describe("Formulário Notas Fiscais", () => {
  it("consulta automaticamente pelo fornecedor e número sem zeros e lista os bens", async () => {
    await consultar();
    expect(mocks.rpc).toHaveBeenCalledWith("bens_da_nota_fiscal", { _fornecedor: "Fornecedor A", _numero: "614" });
    expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
    expect(screen.getByText(/Nenhum XML anexado/)).toBeInTheDocument();
  });
  it("não consulta a nota enquanto o número contém letras", async () => {
    render(<NotasFiscais />);
    fireEvent.click(screen.getByRole("button", { name: "Notas Fiscais" }));
    await screen.findByRole("option", { name: "Fornecedor A" });
    fireEvent.change(screen.getByLabelText("Fornecedor"), { target: { value: "Fornecedor A" } });
    fireEvent.change(screen.getByLabelText("Número da nota fiscal"), { target: { value: "614x" } });
    expect(screen.getByText(/Digite apenas números/)).toBeInTheDocument();
    expect(mocks.rpc.mock.calls.some(([nome]) => nome === "bens_da_nota_fiscal")).toBe(false);
  });
  it("exibe prévia e só salva após conferir o emitente", async () => {
    await consultar();
    fireEvent.change(screen.getByLabelText(/Anexar XML/), { target: { files: [file()] } });
    await screen.findByText("Prévia do XML — ainda não salvo");
    expect(screen.getByText("Documento da nota")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar XML da nota" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar XML da nota" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ fornecedor: "Fornecedor A", numero: "614", serie: "1", chave: nota.chave, xml: "<NFe />", criado_por: "usuario" })));
    await waitFor(() => expect(mocks.sucesso).toHaveBeenCalled());
  });
  it("recusa anexo de outra nota antes de gravar", async () => {
    mocks.lerArquivo.mockResolvedValueOnce({ xml: "<NFe />", nota: { ...nota, numero: "999" } });
    await consultar();
    fireEvent.change(screen.getByLabelText(/Anexar XML/), { target: { files: [file()] } });
    await waitFor(() => expect(mocks.erro).toHaveBeenCalledWith(expect.stringContaining("O XML é da nota 999")));
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(screen.queryByText("Prévia do XML — ainda não salvo")).not.toBeInTheDocument();
  });
});
