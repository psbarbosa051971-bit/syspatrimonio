import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImportarFornecedorDialog } from "@/components/ImportarFornecedorDialog";

const mocks = vi.hoisted(() => ({ parsear: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/pdf-fornecedor", () => ({ extrairFornecedorPdf: mocks.parsear }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.parsear.mockReturnValue([
    { codigo_red: "123", descricao: "Mesa", ano_pedido: "2026", pedido: "1", ano_empenho: "2026", empenho: "2", nota_fiscal: "614", fornecedor: "Fornecedor A" },
    { codigo_red: "456", descricao: "Cadeira", ano_pedido: "2026", pedido: "3", ano_empenho: "2026", empenho: "4", nota_fiscal: "615", fornecedor: "Fornecedor B" },
  ]);
});
afterEach(cleanup);

async function abrirImportacao(onFornecedorChange: (fornecedor: string) => void) {
  render(<ImportarFornecedorDialog onFornecedorChange={onFornecedorChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Importar por fornecedor" }));
  const arquivo = new File(["%PDF-"], "fornecedores.pdf", { type: "application/pdf" });
  const input = screen.getByLabelText("Arquivo HTML ou PDF por fornecedor");
  expect(input).toHaveAttribute("accept", ".html,.htm,text/html,.pdf,application/pdf");
  fireEvent.change(input, { target: { files: [arquivo] } });
  await screen.findByLabelText("Fornecedor");
}

describe("Fornecedor compartilhado com Notas Fiscais", () => {
  it("restaura a importação HTML por fornecedor sem exigir PDF", async () => {
    render(<ImportarFornecedorDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Importar por fornecedor" }));
    const arquivo = new File([], "fornecedor.html", { type: "text/html" });
    Object.defineProperty(arquivo, "text", { value: async () => '<table><tr><td>Fornecedor: Fornecedor HTML</td></tr><tr><td>123</td><td>Mesa HTML</td><td>2026</td><td>1</td><td>2026</td><td>2</td><td>21/09/2026</td><td>Aquisição</td><td>R$ 1.234,56</td></tr></table>' });
    fireEvent.change(screen.getByLabelText("Arquivo HTML ou PDF por fornecedor"), { target: { files: [arquivo] } });
    expect(await screen.findByLabelText("Fornecedor")).toHaveValue("Fornecedor HTML");
    expect(screen.getByLabelText("Empenho")).toHaveValue("2");
    expect(screen.getByLabelText("Ano empenho")).toHaveValue("2026");
    expect(screen.getByLabelText("Valor do bem (R$)")).toHaveValue("R$ 1.234,56");
    expect(mocks.parsear).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: [{ codigo_red: "123", vinculados: 1 }], error: null });
    fireEvent.click(screen.getByRole("button", { name: "Vincular aos patrimônios" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("vincular_dados_fornecedor", {
      _itens: [expect.objectContaining({ codigo_red: "123", empenho: "2", ano_empenho: "2026", valor: 1234.56 })],
    }));
  });

  it("encaminha um HTML por Local Físico para a importação de salas sem vincular dados fiscais", async () => {
    const importarRelatorio = vi.fn().mockResolvedValue(undefined);
    render(<ImportarFornecedorDialog onImportarRelatorio={importarRelatorio} />);
    fireEvent.click(screen.getByRole("button", { name: "Importar por fornecedor" }));
    const arquivo = new File([], "leilao.html", { type: "text/html" });
    Object.defineProperty(arquivo, "text", { value: async () => '<table><tr><td>Local Físico:</td><td>58536 1º LEILÃO DE INSERVÍVEIS 2026</td></tr><tr><td>181</td><td>Cadeira</td><td>31/12/1994</td><td>Aquisição</td><td>10,00</td></tr></table>' });
    fireEvent.change(screen.getByLabelText("Arquivo HTML ou PDF por fornecedor"), { target: { files: [arquivo] } });
    const acao = await screen.findByRole("button", { name: "Importar relatório por Local Físico" });
    expect(importarRelatorio).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Vincular aos patrimônios" })).not.toBeInTheDocument();
    fireEvent.click(acao);
    await waitFor(() => expect(importarRelatorio).toHaveBeenCalledWith(arquivo));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("envia o valor revisado também ao incluir um bem que ainda não existe", async () => {
    await abrirImportacao(vi.fn());
    fireEvent.change(screen.getByLabelText("Valor do bem (R$)"), { target: { value: "R$ 995,97" } });
    mocks.rpc.mockResolvedValueOnce({ data: [{ codigo_red: "123", vinculados: 0 }, { codigo_red: "456", vinculados: 1 }], error: null });
    fireEvent.click(screen.getByRole("button", { name: "Vincular aos patrimônios" }));
    await screen.findByText("Números não encontrados no sistema");
    expect(mocks.rpc).toHaveBeenCalledWith("vincular_dados_fornecedor", {
      _itens: expect.arrayContaining([expect.objectContaining({ codigo_red: "123", valor: 995.97 })]),
    });
    mocks.rpc.mockResolvedValueOnce({ data: 1, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Sim", exact: true }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("incluir_bens_fornecedor", {
      _itens: [expect.objectContaining({ codigo_red: "123", valor: 995.97 })],
    }));
  });

  it("importa para a sala selecionada somente ao clicar na ação explícita", async () => {
    const importar = vi.fn().mockResolvedValue(true);
    render(<ImportarFornecedorDialog salaDestino={{ id: "sala-58536", nome: "58536 1º LEILÃO DE INSERVÍVEIS 2026" }} onImportarNaSala={importar} />);
    fireEvent.click(screen.getByRole("button", { name: "Importar por fornecedor" }));
    fireEvent.change(screen.getByLabelText("Arquivo HTML ou PDF por fornecedor"), {
      target: { files: [new File(["%PDF-"], "fornecedores.pdf", { type: "application/pdf" })] },
    });
    await screen.findByLabelText("Fornecedor");
    expect(screen.getByText(/Destino: 58536/)).toBeInTheDocument();
    expect(importar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Importar bens para a sala selecionada" }));
    await waitFor(() => expect(importar).toHaveBeenCalledWith([
      expect.objectContaining({ codigo_red: "123" }), expect.objectContaining({ codigo_red: "456" }),
    ], "fornecedores.pdf"));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Arquivo HTML ou PDF por fornecedor")).not.toBeInTheDocument();
  });

  it("exige uma sala de destino e permite reabrir após cancelar a confirmação", async () => {
    const importar = vi.fn().mockResolvedValue(false);
    const { rerender } = render(<ImportarFornecedorDialog onImportarNaSala={importar} />);
    fireEvent.click(screen.getByRole("button", { name: "Importar por fornecedor" }));
    fireEvent.change(screen.getByLabelText("Arquivo HTML ou PDF por fornecedor"), {
      target: { files: [new File(["%PDF-"], "fornecedores.pdf", { type: "application/pdf" })] },
    });
    await screen.findByLabelText("Fornecedor");
    expect(screen.getByRole("button", { name: "Importar bens para a sala selecionada" })).toBeDisabled();
    rerender(<ImportarFornecedorDialog salaDestino={{ id: "sala-58536", nome: "Leilão" }} onImportarNaSala={importar} />);
    fireEvent.click(screen.getByRole("button", { name: "Importar bens para a sala selecionada" }));
    await screen.findByLabelText("Arquivo HTML ou PDF por fornecedor");
    expect(importar).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Fornecedor")).toHaveValue("Fornecedor A");
  });

  it("envia o fornecedor do bem carregado sem exigir a vinculação aos patrimônios", async () => {
    const receber = vi.fn();
    await abrirImportacao(receber);
    await waitFor(() => expect(receber).toHaveBeenLastCalledWith("Fornecedor A"));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("envia as alterações feitas no campo Fornecedor", async () => {
    const receber = vi.fn();
    await abrirImportacao(receber);
    fireEvent.change(screen.getByLabelText("Fornecedor"), { target: { value: "Fornecedor corrigido" } });
    await waitFor(() => expect(receber).toHaveBeenLastCalledWith("Fornecedor corrigido"));
  });

  it("envia o fornecedor ao selecionar outro bem na tabela", async () => {
    const receber = vi.fn();
    await abrirImportacao(receber);
    fireEvent.click(screen.getByText("Cadeira"));
    await waitFor(() => expect(receber).toHaveBeenLastCalledWith("Fornecedor B"));
    expect(screen.getByLabelText("Fornecedor")).toHaveValue("Fornecedor B");
  });
});
