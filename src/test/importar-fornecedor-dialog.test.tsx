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
    Object.defineProperty(arquivo, "text", { value: async () => '<table><tr><td>Fornecedor: Fornecedor HTML</td></tr><tr><td>123</td><td>Mesa HTML</td><td>2026</td><td>1</td><td>2026</td><td>2</td></tr></table>' });
    fireEvent.change(screen.getByLabelText("Arquivo HTML ou PDF por fornecedor"), { target: { files: [arquivo] } });
    expect(await screen.findByLabelText("Fornecedor")).toHaveValue("Fornecedor HTML");
    expect(mocks.parsear).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
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
