import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DadosRelatorioSala } from "@/lib/relatorio-sala-pdf";

const mocks = vi.hoisted(() => ({ gerar: vi.fn(), sucesso: vi.fn(), erro: vi.fn() }));
vi.mock("@/lib/relatorio-sala-pdf", () => ({ gerarRelatorioSalaPdf: mocks.gerar }));
vi.mock("sonner", () => ({ toast: { success: mocks.sucesso, error: mocks.erro } }));
import { CompartilharRelatorioSala } from "@/components/CompartilharRelatorioSala";

const dados: DadosRelatorioSala = {
  sala: { nome: "Sala A", endereco: null, unidade: null, responsavel: null },
  departamento: "Patrimônio", responsavel: "Maria", bens: [],
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("Compartilhar relatório da sala", () => {
  it("gera o PDF e compartilha o arquivo a partir do clique do usuário", async () => {
    const arquivo = new File(["pdf"], "Sala.pdf", { type: "application/pdf" });
    mocks.gerar.mockResolvedValue(arquivo);
    const compartilhar = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "canShare", { configurable: true, value: vi.fn().mockReturnValue(true) });
    Object.defineProperty(navigator, "share", { configurable: true, value: compartilhar });
    render(<CompartilharRelatorioSala dados={dados} />);
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar Relatório" }));
    fireEvent.click(await screen.findByRole("button", { name: "Compartilhar PDF" }));
    await waitFor(() => expect(compartilhar).toHaveBeenCalledWith({ files: [arquivo], title: "Relatório de bens da sala" }));
    expect(mocks.gerar).toHaveBeenCalledWith(dados);
  });

  it("oferece nova tentativa quando não é possível gerar o arquivo", async () => {
    mocks.gerar.mockRejectedValue(new Error("Falha"));
    render(<CompartilharRelatorioSala dados={dados} />);
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar Relatório" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível gerar o PDF.");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("não permite compartilhar sem sala selecionada", () => {
    render(<CompartilharRelatorioSala dados={null} />);
    expect(screen.getByRole("button", { name: "Compartilhar Relatório" })).toBeDisabled();
  });
});
