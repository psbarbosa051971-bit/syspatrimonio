import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { aceitarBens, codigosDaBusca, lerTermoTransferencia, type BemTransferencia } from "@/lib/transferencias";

const bem = (id: string, sala_id: string | null = "origem"): BemTransferencia => ({
  id, sala_id, codigo_red: id, descricao: "Mesa", valor: 100, user_id: "usuario",
  created_at: "2026-10-10T12:00:00Z", importacao_id: "html-original",
  incorporacao: null, tipo: "Aquisição", observacao: null, conferido: true, conferencia_finalizada: true,
});

describe("preparação de transferência de bens", () => {
  it("separa códigos por vírgulas, remove espaços e repetidos sem perder zeros", () => {
    expect(codigosDaBusca(" 00123, 456,00123, ,789 ")).toEqual(["00123", "456", "789"]);
  });

  it.each(["", " , ", "123;456", "12a,456", "123 456"])("recusa códigos inválidos: %s", (texto) => {
    expect(() => codigosDaBusca(texto)).toThrow();
  });

  it("limita a quantidade a 500 códigos", () => {
    expect(codigosDaBusca(Array.from({ length: 500 }, (_, i) => String(i)).join(","))).toHaveLength(500);
    expect(() => codigosDaBusca(Array.from({ length: 501 }, (_, i) => String(i)).join(","))).toThrow("500");
  });

  it("aceita somente os marcados e não repete bens já aceitos", () => {
    const primeiro = bem("123");
    const segundo = bem("456");
    expect(aceitarBens([primeiro], [primeiro, segundo, bem("789")], ["123", "456"], "destino"))
      .toEqual([primeiro, segundo]);
  });

  it("não aceita bens que já estão no destino nem modifica a sala antes de salvar", () => {
    const origem = bem("123");
    const noDestino = bem("456", "destino");
    expect(aceitarBens([], [origem, noDestino], ["123", "456"], "destino")).toEqual([origem]);
    expect(origem.sala_id).toBe("origem");
    expect(origem.importacao_id).toBe("html-original");
  });

  it("valida os dados do termo retornado antes da impressão", () => {
    const termo = { id: "termo", numero: 20, termo_ano: 2026, created_at: "2026-10-10T12:00:00Z",
      arquivo: "Transferência de bens", termo_snapshot: { local: "Sala destino", bens: [{ codigo_red: "123", descricao: "Mesa", valor: 100 }] } };
    expect(lerTermoTransferencia(termo)).toEqual(termo);
    expect(() => lerTermoTransferencia(null)).toThrow();
    expect(() => lerTermoTransferencia({ ...termo, termo_snapshot: null })).toThrow();
  });
});
