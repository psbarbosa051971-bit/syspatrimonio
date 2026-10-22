import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DanfeOriginalNotaFiscal } from "@/components/DanfeOriginalNotaFiscal";
import type { NotaFiscalXml } from "@/lib/notas-fiscais";

const mocks = vi.hoisted(() => ({ consultar: vi.fn(), inserir: vi.fn(), enviar: vi.fn(), baixar: vi.fn(), criarUrl: vi.fn(), revogarUrl: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.consultar }) }), insert: mocks.inserir }),
  storage: { from: () => ({ upload: mocks.enviar, download: mocks.baixar }) },
} }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "usuario" } }) }));
vi.mock("@/components/DanfeNotaFiscal", () => ({ DanfeNotaFiscal: () => <p>Prévia simplificada</p> }));
const nota: NotaFiscalXml = {
  numero: "614", serie: "1", chave: "1".repeat(44), emissao: "2026-10-21", natureza: "Venda",
  emitente: { nome: "Fornecedor A", documento: "12345678000123", ie: "", endereco: "Rua A" },
  destinatario: { nome: "Prefeitura", documento: "", ie: "", endereco: "Rua B" },
  protocolo: "123", homologacao: false, itens: [], produtos: "100", frete: "0",
  desconto: "0", icms: "0", ipi: "0", total: "100", adicionais: "",
};
function arquivo() {
  const file = new File(["%PDF-1.7 original"], "nota-original.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "slice", { value: () => ({ arrayBuffer: async () => new TextEncoder().encode("%PDF-1.7 original").buffer }) });
  return file;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.consultar.mockResolvedValue({ data: null, error: null });
  mocks.inserir.mockResolvedValue({ error: null });
  mocks.enviar.mockResolvedValue({ error: null });
  mocks.baixar.mockResolvedValue({ data: new Blob(["%PDF-1.7 original"], { type: "application/pdf" }), error: null });
  mocks.criarUrl.mockReturnValue("blob:original");
  vi.stubGlobal("URL", { createObjectURL: mocks.criarUrl, revokeObjectURL: mocks.revogarUrl });
  vi.stubGlobal("crypto", { randomUUID: () => "id-arquivo" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("DANFE original", () => {
  it("exibe o PDF armazenado sem recriar o documento e libera a URL ao fechar", async () => {
    mocks.consultar.mockResolvedValue({ data: { arquivo_path: "nota/original.pdf", arquivo_nome: "original.pdf" }, error: null });
    const { unmount } = render(<DanfeOriginalNotaFiscal nota={nota} notaId="nota" />);
    expect(await screen.findByTitle("DANFE original da NF-e 614 — série 1")).toHaveAttribute("src", "blob:original");
    expect(mocks.baixar).toHaveBeenCalledWith("nota/original.pdf");
    expect(screen.getByRole("link", { name: "Baixar original" })).toHaveAttribute("download", "original.pdf");
    expect(screen.getByRole("link", { name: "Abrir / Imprimir original" })).toHaveAttribute("target", "_blank");
    expect(screen.queryByText("Prévia simplificada")).not.toBeInTheDocument();
    unmount();
    expect(mocks.revogarUrl).toHaveBeenCalledWith("blob:original");
  });

  it("pede para salvar o XML antes de anexar o original", () => {
    render(<DanfeOriginalNotaFiscal nota={nota} notaId="" />);
    expect(screen.getByText(/Salve primeiro o XML/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Anexar PDF original/)).not.toBeInTheDocument();
    expect(mocks.consultar).not.toHaveBeenCalled();
  });

  it("exige confirmação da nota e envia o arquivo sem conversão", async () => {
    const file = arquivo();
    render(<DanfeOriginalNotaFiscal nota={nota} notaId="nota" />);
    fireEvent.change(await screen.findByLabelText(/Anexar PDF original/), { target: { files: [file] } });
    const salvar = await screen.findByRole("button", { name: "Salvar DANFE original" });
    expect(salvar).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(salvar);
    await waitFor(() => expect(mocks.enviar).toHaveBeenCalledWith("nota/id-arquivo.pdf", file, { contentType: "application/pdf", upsert: false }));
    expect(mocks.inserir).toHaveBeenCalledWith({ nota_fiscal_id: "nota", arquivo_path: "nota/id-arquivo.pdf", arquivo_nome: "nota-original.pdf", criado_por: "usuario" });
  });

  it("recusa arquivo grande ou com extensão diferente sem enviar", async () => {
    render(<DanfeOriginalNotaFiscal nota={nota} notaId="nota" />);
    const input = await screen.findByLabelText(/Anexar PDF original/);
    fireEvent.change(input, { target: { files: [new File(["xml"], "nota.xml")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Selecione o PDF original de até 15 MB");
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("permite repetir apenas o registro se o PDF já foi enviado", async () => {
    mocks.inserir.mockResolvedValueOnce({ error: { message: "Falha no registro" } });
    render(<DanfeOriginalNotaFiscal nota={nota} notaId="nota" />);
    fireEvent.change(await screen.findByLabelText(/Anexar PDF original/), { target: { files: [arquivo()] } });
    await screen.findByRole("button", { name: "Salvar DANFE original" });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar DANFE original" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha no registro");
    fireEvent.click(screen.getByRole("button", { name: "Salvar DANFE original" }));
    await waitFor(() => expect(mocks.inserir).toHaveBeenCalledTimes(2));
    expect(mocks.enviar).toHaveBeenCalledOnce();
  });
});
