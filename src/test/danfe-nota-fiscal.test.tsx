import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DanfeNotaFiscal } from "@/components/DanfeNotaFiscal";
import type { NotaFiscalXml } from "@/lib/notas-fiscais";

const mocks = vi.hoisted(() => ({ gerar: vi.fn(), criarUrl: vi.fn(), revogarUrl: vi.fn() }));
vi.mock("@/lib/danfe-nota-fiscal", () => ({ gerarPreviaDanfe: mocks.gerar }));
const nota: NotaFiscalXml = {
  numero: "614", serie: "1", chave: "1".repeat(44), emissao: "2026-10-21", natureza: "Venda",
  emitente: { nome: "Fornecedor A", documento: "12345678000123", ie: "", endereco: "Rua A" },
  destinatario: { nome: "Prefeitura", documento: "", ie: "", endereco: "Rua B" },
  protocolo: "123", homologacao: false, itens: [], produtos: "100", frete: "0",
  desconto: "0", icms: "0", ipi: "0", total: "100", adicionais: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.gerar.mockReset().mockResolvedValue(new Blob(["PDF"], { type: "application/pdf" }));
  mocks.criarUrl.mockReset().mockReturnValue("blob:danfe");
  vi.stubGlobal("URL", { createObjectURL: mocks.criarUrl, revokeObjectURL: mocks.revogarUrl });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Prévia do DANFE ao lado do XML", () => {
  it("exibe o PDF e permite abrir e baixar, liberando o arquivo ao fechar", async () => {
    const { unmount } = render(<DanfeNotaFiscal nota={nota} />);
    expect(screen.getByRole("status")).toHaveTextContent("Gerando prévia");
    const frame = await screen.findByTitle("DANFE da NF-e 614 — série 1");
    expect(frame).toHaveAttribute("src", "blob:danfe");
    expect(mocks.gerar).toHaveBeenCalledWith(nota);
    expect(screen.getByRole("link", { name: "Abrir PDF" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Baixar PDF" })).toHaveAttribute("download", "DANFE-previa-614-serie-1.pdf");
    expect(screen.getByText(/Não substitui o DANFE original/)).toBeInTheDocument();
    unmount();
    expect(mocks.revogarUrl).toHaveBeenCalledWith("blob:danfe");
  });

  it("permite tentar de novo quando a geração falha", async () => {
    mocks.gerar.mockRejectedValueOnce(new Error("Falha"));
    render(<DanfeNotaFiscal nota={nota} />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("link", { name: "Baixar PDF" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar gerar novamente" }));
    await screen.findByTitle("DANFE da NF-e 614 — série 1");
    expect(mocks.gerar).toHaveBeenCalledTimes(2);
  });

  it("não cria arquivo temporário se o formulário fechar antes de gerar", async () => {
    let concluir!: (blob: Blob) => void;
    mocks.gerar.mockReturnValue(new Promise<Blob>((resolve) => { concluir = resolve; }));
    const { unmount } = render(<DanfeNotaFiscal nota={nota} />);
    unmount();
    concluir(new Blob(["PDF"]));
    await Promise.resolve();
    expect(mocks.criarUrl).not.toHaveBeenCalled();
  });

  it("troca o documento quando muda a série ou a nota", async () => {
    mocks.criarUrl.mockReturnValueOnce("blob:primeira").mockReturnValueOnce("blob:segunda");
    const { rerender } = render(<DanfeNotaFiscal nota={nota} />);
    await screen.findByTitle("DANFE da NF-e 614 — série 1");
    rerender(<DanfeNotaFiscal nota={{ ...nota, serie: "2" }} />);
    await waitFor(() => expect(screen.getByTitle("DANFE da NF-e 614 — série 2")).toHaveAttribute("src", "blob:segunda"));
    expect(mocks.revogarUrl).toHaveBeenCalledWith("blob:primeira");
    expect(screen.getByRole("link", { name: "Baixar PDF" })).toHaveAttribute("download", "DANFE-previa-614-serie-2.pdf");
  });
});
