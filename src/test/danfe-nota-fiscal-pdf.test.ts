import { beforeEach, describe, expect, it, vi } from "vitest";
import autoTable from "jspdf-autotable";
import { gerarPreviaDanfe } from "@/lib/danfe-nota-fiscal";
import type { NotaFiscalXml } from "@/lib/notas-fiscais";

vi.mock("jspdf-autotable", async (importOriginal) => {
  const original = await importOriginal<typeof import("jspdf-autotable")>();
  return { ...original, default: vi.fn(original.default) };
});
beforeEach(() => vi.clearAllMocks());

const nota: NotaFiscalXml = {
  numero: "614", serie: "1", chave: "1".repeat(44), emissao: "2026-10-21T10:00:00-03:00", natureza: "Venda",
  emitente: { nome: "Fornecedor A", documento: "12345678000123", ie: "123", endereco: "Rua A, 10" },
  destinatario: { nome: "Prefeitura", documento: "12345678000124", ie: "", endereco: "Rua B, 20" },
  protocolo: "123456", homologacao: false,
  itens: [{ codigo: "M1", descricao: "Mesa de escritório", ncm: "94033000", cfop: "5102", unidade: "UN", quantidade: "2", unitario: "50", total: "100" }],
  produtos: "100", frete: "10", desconto: "0", icms: "12", ipi: "0", total: "110", adicionais: "Entrega no almoxarifado.",
};

describe("PDF da prévia simplificada do DANFE", () => {
  it("gera um PDF com produtos e informações adicionais do XML", async () => {
    const blob = await gerarPreviaDanfe(nota);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1000);
    const chamadas = vi.mocked(autoTable).mock.calls;
    expect(chamadas[0][1].body).toEqual([[
      "M1\n94033000", "Mesa de escritório", "5102", "UN", "2",
      expect.stringContaining("50,00"), expect.stringContaining("100,00"),
    ]]);
    expect(chamadas[1][1].body).toEqual([["Entrega no almoxarifado."]]);
  });

  it("distribui muitos produtos em várias páginas", async () => {
    const blob = await gerarPreviaDanfe({ ...nota, itens: Array.from({ length: 100 }, (_, i) => ({ ...nota.itens[0], codigo: String(i + 1) })) });
    expect(blob.type).toBe("application/pdf");
    const [pdf, tabela] = vi.mocked(autoTable).mock.calls[0];
    expect(tabela.body).toHaveLength(100);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("aceita nota sem produtos ou informações adicionais", async () => {
    const blob = await gerarPreviaDanfe({ ...nota, itens: [], adicionais: "", protocolo: "", homologacao: true });
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1000);
    expect(autoTable).toHaveBeenCalledTimes(1);
  });
});
