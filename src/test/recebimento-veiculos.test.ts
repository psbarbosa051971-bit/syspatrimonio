import { describe, expect, it } from "vitest";
import { descricaoDetalhada, ehVeiculo, gruposChecklist, lerDadosRecebimento } from "@/lib/recebimento-veiculos";

describe("recebimento de veículos", () => {
  it.each([
    "VEÍCULO MARCA FIAT MOTOR 123 CHASSI 456", "AUTOMÓVEL PALIO", "CAMINHONETE", "ÔNIBUS", "MOTOCICLETA",
  ])("identifica o veículo %s", (descricao) => {
    expect(ehVeiculo({ descricao, tipo: "Aquisição" })).toBe(true);
  });

  it.each([
    "MESA DE ESCRITÓRIO", "CARRO PARA CURATIVO", "CARRO DE EMERGÊNCIA ESTRUTURA EM AÇO INOX",
    "CARRO DE MÃO", "PNEU PARA VEÍCULO", "MOTOR DE AUTOMÓVEL", "MINIATURA DE CARRO",
  ])("não exibe recebimento para %s", (descricao) => {
    expect(ehVeiculo({ descricao, tipo: "Aquisição" })).toBe(false);
  });

  it("concatena somente os detalhes preenchidos, sem valores indefinidos", () => {
    expect(descricaoDetalhada({ ano_modelo: "2025/2026", chassi: " ABC ", placa: "SIS4D13", km: "0" }))
      .toBe("Ano/modelo: 2025/2026 • Chassi: ABC • Placa: SIS4D13 • KM: 0");
    expect(descricaoDetalhada({})).toBe("");
  });

  it("lê somente valores de texto do registro salvo", () => {
    expect(lerDadosRecebimento({ placa: "ABC1234", triangulo: "Sim", extra: {}, numero: 10 }))
      .toEqual({ placa: "ABC1234", triangulo: "Sim" });
    expect(lerDadosRecebimento(null)).toEqual({});
    expect(lerDadosRecebimento([])).toEqual({});
  });

  it("inclui os quatro grupos e todas as opções do modelo", () => {
    expect(gruposChecklist.map((grupo) => grupo.titulo)).toEqual([
      "Acessórios/equipamentos", "Acessórios especiais", "Ferramentas", "Estado do veículo",
    ]);
    expect(gruposChecklist.flatMap((grupo) => grupo.campos)).toHaveLength(34);
    const chaves = gruposChecklist.flatMap((grupo) => grupo.campos.map((campo) => campo.chave));
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
