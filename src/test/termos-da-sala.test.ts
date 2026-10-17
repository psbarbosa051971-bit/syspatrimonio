import { describe, expect, it } from "vitest";
import { resumoTermoDaSala, type TermoDaSala } from "@/lib/termos-da-sala";

const termo: TermoDaSala = {
  id: "termo", numero: 29, termo_ano: 2026, created_at: "2026-10-17T12:00:00Z", arquivo: "termo.html",
  termo_snapshot: { local: "Sala", responsavel: "Responsável da sala", responsavel_recebimento: "Recebedor",
    bens: [
      { codigo_red: "123", descricao: "Mesa", valor: 10, tipo: "Mobiliário" },
      { codigo_red: "456", descricao: "Cadeira", valor: 25.5, tipo: "Mobiliário" },
    ] },
};
describe("Resumo dos termos da sala", () => {
  it("totaliza os itens do documento original e elimina tipos repetidos", () => {
    const resumo = resumoTermoDaSala(termo);
    expect(resumo.quantidade).toBe(2);
    expect(resumo.total).toBe(35.5);
    expect(resumo.tipos).toBe("Mobiliário");
    expect(resumo.dados?.responsavel_recebimento).toBe("Recebedor");
  });
  it("não inventa recebedor a partir do responsável da sala", () => {
    const resumo = resumoTermoDaSala({ ...termo, termo_snapshot: {
      responsavel: "Responsável da sala", bens: [{ codigo_red: "123", descricao: "Mesa", valor: 10 }],
    } });
    expect(resumo.dados?.responsavel).toBe("Responsável da sala");
    expect(resumo.dados?.responsavel_recebimento).toBe("");
  });
  it("trata documentos ausentes ou inválidos sem interromper a listagem", () => {
    expect(resumoTermoDaSala({ ...termo, termo_snapshot: null })).toEqual({ dados: null, quantidade: 0, total: 0, tipos: "—" });
    expect(resumoTermoDaSala({ ...termo, termo_snapshot: { bens: [{}] } }).dados).toBeNull();
  });
});
