import { describe, expect, it } from "vitest";
import { descricaoDetalhada, ehVeiculo, extrairDadosVeiculo, gruposChecklist, lerDadosRecebimento } from "@/lib/recebimento-veiculos";

describe("recebimento de veículos", () => {
  it.each([
    "VEÍCULO MARCA FIAT MOTOR 123 CHASSI 456", "AUTOMÓVEL PALIO", "CAMINHONETE", "ÔNIBUS", "MOTOCICLETA",
    "VEICULO MOTOR 1.8", "VEÍCULOS MOTOR 1.8", "VEICULOS MOTOR 1.8", "  veículos motor flex",
  ])("identifica o veículo %s", (descricao) => {
    expect(ehVeiculo({ descricao, tipo: "Aquisição" })).toBe(true);
  });

  it.each([
    "MESA DE ESCRITÓRIO", "CARRO PARA CURATIVO", "CARRO DE EMERGÊNCIA ESTRUTURA EM AÇO INOX",
    "CARRO DE MÃO", "PNEU PARA VEÍCULO", "MOTOR DE AUTOMÓVEL", "MINIATURA DE CARRO",
  ])("não exibe recebimento para %s", (descricao) => {
    expect(ehVeiculo({ descricao, tipo: "Aquisição" })).toBe(false);
  });

  it("separa os identificadores do exemplo sem retirar a motorização do modelo", () => {
    const descricao = "VEÍCULO MARCA FIAT MODELO UNO MILLE ECON 4 PORTAS ANO/MOD 2010/2010 PLACA HLF-2823 MOTOR ECON. 1.0 FLEX MOTOR Nº 146E1011*9856637 COR BRANCA BANHISA RENAVAM 205414427 / CHASSI Nº 9BD18522AA6449007 SEMIN";
    expect(extrairDadosVeiculo(descricao)).toEqual({
      modelo: "VEÍCULO MARCA FIAT MODELO UNO MILLE ECON 4 PORTAS MOTOR ECON. 1.0 FLEX COR BRANCA BANHISA",
      dados: {
        ano_modelo: "2010/2010", chassi: "9BD18522AA6449007", renavam: "205414427",
        motor: "146E1011*9856637", placa: "HLF-2823",
      },
    });
  });

  it("extrai KM apenas quando informado, preservando zeros dos identificadores", () => {
    expect(extrairDadosVeiculo("VEÍCULO ANO/MODELO: 2020/2021 CHASSI: 9BD18522AA6449007 RENAVAM: 00123456789 MOTOR: ABC12345 PLACA: ABC1D23 KM: 145")).toEqual({
      modelo: "VEÍCULO",
      dados: {
        ano_modelo: "2020/2021", chassi: "9BD18522AA6449007", renavam: "00123456789",
        motor: "ABC12345", placa: "ABC1D23", km: "145",
      },
    });
    expect(extrairDadosVeiculo("VEÍCULO KM: 12.345").dados.km).toBe("12345");
    expect(extrairDadosVeiculo("VEÍCULO MOTOR ECON. 1.0 FLEX")).toEqual({
      modelo: "VEÍCULO MOTOR ECON. 1.0 FLEX", dados: {},
    });
  });

  it("mantém descrições sem identificadores reconhecidos", () => {
    expect(extrairDadosVeiculo("VEÍCULO MARCA FIAT")).toEqual({ modelo: "VEÍCULO MARCA FIAT", dados: {} });
    expect(extrairDadosVeiculo("VEÍCULO MOTOR NOVO 1.0 FLEX")).toEqual({
      modelo: "VEÍCULO MOTOR NOVO 1.0 FLEX", dados: {},
    });
  });

  it("organiza modelo e identificadores em linhas na ordem do exemplo, mantendo campos vazios", () => {
    expect(descricaoDetalhada({ ano_modelo: "2025/2026", chassi: " ABC ", placa: "SIS4D13", km: "0" }, " VEÍCULO MARCA FIAT "))
      .toBe("VEÍCULO/MODELO: VEÍCULO MARCA FIAT\nANO/MOD: 2025/2026\nCHASSI: ABC\nMOTOR Nº: \nRENAVAM: \nPLACA: SIS4D13\nKM: 0");
    expect(descricaoDetalhada({})).toBe("VEÍCULO/MODELO: \nANO/MOD: \nCHASSI: \nMOTOR Nº: \nRENAVAM: \nPLACA: \nKM: ");
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
    expect(gruposChecklist.flatMap((grupo) => grupo.campos)).toHaveLength(37);
    const chaves = gruposChecklist.flatMap((grupo) => grupo.campos.map((campo) => campo.chave));
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
