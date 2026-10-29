import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotasFiscais } from "@/components/NotasFiscais";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), insert: vi.fn(), upload: vi.fn(), download: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from, storage: { from: () => ({ upload: mocks.upload, download: mocks.download }) } } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "usuario" } }) }));

async function consultar() {
  render(<NotasFiscais />);
  fireEvent.click(screen.getByRole("button", { name: "Notas Fiscais" }));
  await screen.findByRole("option", { name: "Fornecedor A" });
  fireEvent.change(screen.getByLabelText("Fornecedor"), { target: { value: "Fornecedor A" } });
  fireEvent.change(screen.getByLabelText("Número da nota fiscal"), { target: { value: "000614" } });
  await screen.findByText("Bens cadastrados referentes à nota");
  await screen.findByLabelText(/Importar PDF da nota/);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:nota-pdf");
    static revokeObjectURL = vi.fn();
  });
  mocks.rpc.mockImplementation((nome: string) => {
    const data = nome === "fornecedores_notas_fiscais" ? [{ fornecedor: "Fornecedor A" }] : [{ id: "bem-1", codigo_red: "1234", descricao: "Mesa cadastrada", valor: 201, incorporacao: "2026", empenho: "7438", ano_empenho: "2026" }];
    return { order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data, error: null }) };
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.from.mockImplementation(() => {
    const consulta = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ data: [], error: null }), insert: mocks.insert, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
    consulta.select.mockReturnValue(consulta); consulta.eq.mockReturnValue(consulta); consulta.order.mockReturnValue(consulta);
    return consulta;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Notas Fiscais com PDF direto", () => {
  it("abre em tela cheia e consulta bens pelo fornecedor e número sem zeros", async () => {
    await consultar();
    expect(screen.getByRole("dialog", { name: "Notas Fiscais" })).toHaveClass("h-dvh", "w-full", "max-w-none");
    expect(mocks.rpc).toHaveBeenCalledWith("bens_da_nota_fiscal", { _fornecedor: "Fornecedor A", _numero: "614" });
    const descricao = screen.getByText("Mesa cadastrada");
    expect(descricao).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((celula) => celula.textContent)).toEqual([
      "Patrimônio", "Descrição do bem", "Empenho", "Ano empenho", "Incorporação", "Valor",
    ]);
    expect(descricao.nextElementSibling).toHaveTextContent("7438");
    expect(descricao.nextElementSibling?.nextElementSibling).toHaveTextContent("2026");
    expect(screen.getByLabelText(/Importar PDF da nota/)).toHaveAttribute("accept", ".pdf,application/pdf");
    expect(screen.queryByLabelText(/Anexar XML/)).not.toBeInTheDocument();
  });
  it("pré-visualiza e salva o PDF sem XML somente após confirmação", async () => {
    await consultar();
    const arquivo = new File(["%PDF-1.7"], "nota.pdf", { type: "application/pdf" });
    Object.defineProperty(arquivo, "slice", { value: () => ({ arrayBuffer: async () => new TextEncoder().encode("%PDF-1.7").buffer }) });
    fireEvent.change(screen.getByLabelText(/Importar PDF da nota/), { target: { files: [arquivo] } });
    await screen.findByTitle("PDF da nota fiscal 614");
    expect(screen.getByRole("button", { name: "Salvar PDF da nota" })).toBeDisabled();
    expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar PDF da nota" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ fornecedor: "Fornecedor A", numero: "614", arquivo_nome: "nota.pdf", criado_por: "usuario" })));
    expect(mocks.from).toHaveBeenCalledWith("notas_fiscais_pdfs");
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^notas\/usuario\/.+\.pdf$/), arquivo, expect.objectContaining({ contentType: "application/pdf" }));
  });
  it("recusa XML no campo destinado ao PDF", async () => {
    await consultar();
    fireEvent.change(screen.getByLabelText(/Importar PDF da nota/), { target: { files: [new File(["<NFe/>"], "nota.xml")] } });
    await screen.findByText("Selecione um PDF de até 15 MB.");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("recebe o fornecedor da importação", async () => {
    render(<NotasFiscais fornecedorImportado="Fornecedor importado" />);
    fireEvent.click(screen.getByRole("button", { name: "Notas Fiscais" }));
    await screen.findByRole("option", { name: "Fornecedor A" });
    expect(screen.getByLabelText("Fornecedor")).toHaveValue("Fornecedor importado");
  });
  it("não consulta um número de nota com letras", async () => {
    render(<NotasFiscais fornecedorImportado="Fornecedor A" />);
    fireEvent.click(screen.getByRole("button", { name: "Notas Fiscais" }));
    await screen.findByRole("option", { name: "Fornecedor A" });
    fireEvent.change(screen.getByLabelText("Número da nota fiscal"), { target: { value: "614x" } });
    expect(screen.getByText(/Digite apenas números/)).toBeInTheDocument();
    expect(mocks.rpc.mock.calls.some(([nome]) => nome === "bens_da_nota_fiscal")).toBe(false);
  });
});
