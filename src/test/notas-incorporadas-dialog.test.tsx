import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotasIncorporadasDialog } from "@/components/NotasIncorporadasDialog";

const mocks = vi.hoisted(() => ({ carregar: vi.fn(), html: vi.fn() }));
vi.mock("@/lib/notas-incorporadas", () => ({
  carregarNotasIncorporadas: mocks.carregar,
  htmlNotasIncorporadas: mocks.html,
  moedaIncorporada: (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
}));
const resultado = {
  ano: "2026", quantidade: 2, notas: 1, empenhos: 1, total: 238000,
  linhas: [{ empenho: "620", ano: "2026", pedido: "372", fornecedor: "Fornecedor A", nota: "614", quantidade: 2, unitario: 119000, total: 238000 }],
};
const abrir = () => {
  render(<NotasIncorporadasDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Notas incorporadas" }));
  fireEvent.change(screen.getByLabelText("Exercício"), { target: { value: "2026" } });
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.carregar.mockResolvedValue(resultado);
  mocks.html.mockReturnValue("<html><body>Relatório 2026</body></html>");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Notas incorporadas por exercício", () => {
  it("consulta o exercício selecionado apenas ao gerar e apresenta as colunas do anexo com nota fiscal", async () => {
    abrir();
    expect(mocks.carregar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Notas incorporadas e empenhos" })).toHaveClass("h-dvh", "w-full");
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    await screen.findByRole("table", { name: "Notas incorporadas por empenho" });
    expect(mocks.carregar).toHaveBeenCalledWith("2026", { dataInicial: "", dataFinal: "" });
    expect(screen.getAllByRole("columnheader").map((celula) => celula.textContent)).toEqual([
      "EMPENHO", "ANO EMPENHO", "PEDIDO", "FORNECEDORES", "NOTA FISCAL", "ITENS", "VALOR UNITÁRIO", "VALOR TOTAL",
    ]);
    expect(screen.getByText("Fornecedor A")).toBeInTheDocument();
    expect(screen.getByText("614")).toBeInTheDocument();
    expect(screen.getByText("1 nota(s) · 1 empenho(s) · 2 bem(ns)")).toBeInTheDocument();
  });

  it("permite filtrar opcionalmente por datas de incorporação e limpa o resultado ao alterá-las", async () => {
    mocks.carregar.mockResolvedValueOnce({ ...resultado, dataInicial: "2026-01-01", dataFinal: "2026-01-31" });
    abrir();
    expect(screen.getByLabelText("Data inicial")).toHaveValue("");
    expect(screen.getByLabelText("Data final")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-01-31" } });
    expect(mocks.carregar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    await screen.findByRole("table");
    expect(mocks.carregar).toHaveBeenCalledWith("2026", { dataInicial: "2026-01-01", dataFinal: "2026-01-31" });
    expect(screen.getByText("Data de incorporação: de 01/01/2026 · até 31/01/2026")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-02-28" } });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imprimir / Salvar em PDF" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-01-02" } });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imprimir / Salvar em PDF" })).toBeDisabled();
  });

  it("impede gerar com período invertido e permite consultar só com a data inicial", async () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-01-31" } });
    expect(screen.getByRole("alert")).toHaveTextContent("A data inicial não pode ser posterior à data final.");
    expect(screen.getByRole("button", { name: "Gerar relatório" })).toBeDisabled();
    expect(mocks.carregar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    await screen.findByRole("table");
    expect(mocks.carregar).toHaveBeenCalledWith("2026", { dataInicial: "2026-02-01", dataFinal: "" });
  });

  it("limpa o resultado ao alterar o exercício e impede a impressão do ano anterior", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Exercício"), { target: { value: "2025" } });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imprimir / Salvar em PDF" })).toBeDisabled();
    expect(mocks.carregar).toHaveBeenCalledTimes(1);
  });

  it("distingue a ausência de resultados de uma falha de consulta", async () => {
    mocks.carregar.mockResolvedValueOnce({ ...resultado, linhas: [], quantidade: 0, notas: 0, empenhos: 0, total: 0 });
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    await screen.findByText(/Nenhum bem incorporado encontrado/);
    mocks.carregar.mockRejectedValueOnce(new Error("Sem conexão"));
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    await screen.findByRole("alert");
    expect(screen.queryByText(/Nenhum bem incorporado encontrado/)).not.toBeInTheDocument();
  });

  it("abre uma versão própria para impressão ou PDF com os mesmos resultados", async () => {
    const documento = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue({ document: documento, opener: null } as unknown as Window);
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Imprimir / Salvar em PDF" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("", "_blank"));
    expect(mocks.html).toHaveBeenCalledWith(resultado);
    expect(documento.write).toHaveBeenCalledWith("<html><body>Relatório 2026</body></html>");
    expect(documento.close).toHaveBeenCalled();
  });
});
