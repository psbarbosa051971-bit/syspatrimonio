import { describe, expect, it } from "vitest";
import { dadosDaChave, dadosDoXmlNfe, extrairChaveNfe } from "@/lib/checklist-veiculos";

function chaveValida() {
  const base = "31" + "2610" + "12345678000195" + "55" + "001" + "000045593" + "1" + "12345678";
  let soma = 0;
  for (let i = 42, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) soma += Number(base[i]) * peso;
  const resto = soma % 11;
  return base + (resto < 2 ? 0 : 11 - resto);
}

describe("leitura da NF-e no checklist antes da importação", () => {
  it("extrai número da nota e CNPJ sem inventar fornecedor, pedido, empenho ou data exata", () => {
    const chave = chaveValida();
    expect(dadosDaChave(chave)).toEqual({ chave_acesso: chave, nota_fiscal: "45593", cnpj_fornecedor: "12345678000195" });
    expect(extrairChaveNfe(chave.match(/.{1,4}/g)!.join(" "))).toBe(chave);
  });

  it("rejeita chaves incompletas ou com dígito verificador incorreto", () => {
    expect(() => extrairChaveNfe("123")).toThrow("44 dígitos");
    const chave = chaveValida();
    expect(() => extrairChaveNfe(chave.slice(0, 43) + ((Number(chave[43]) + 1) % 10))).toThrow("inválida");
    expect(() => extrairChaveNfe("0".repeat(44))).toThrow();
  });

  it("lê o nome do emitente, a emissão e o valor total do XML com namespace", () => {
    const xml = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${chaveValida()}"><ide><nNF>45593</nNF><dhEmi>2026-10-14T10:00:00-03:00</dhEmi></ide><emit><xNome>FORNECEDOR DE VEÍCULOS LTDA</xNome></emit><total><ICMSTot><vNF>91983.50</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
    expect(dadosDoXmlNfe(xml)).toMatchObject({ nota_fiscal: "45593", emissao: "2026-10-14", fornecedor: "FORNECEDOR DE VEÍCULOS LTDA", chave_acesso: chaveValida(), valor: "91983.50" });
  });

  it("não inventa valor quando o XML não informa o total", () => {
    const xml = `<NFe><infNFe Id="NFe${chaveValida()}"><ide><nNF>45593</nNF></ide><emit><xNome>Fornecedor</xNome></emit></infNFe></NFe>`;
    expect(dadosDoXmlNfe(xml)).not.toHaveProperty("valor");
    expect(dadosDaChave(chaveValida())).not.toHaveProperty("valor");
  });

  it("rejeita valor total inválido no XML", () => {
    const xml = `<NFe><infNFe Id="NFe${chaveValida()}"><ide><nNF>45593</nNF></ide><emit><xNome>Fornecedor</xNome></emit><total><ICMSTot><vNF>-100.00</vNF></ICMSTot></total></infNFe></NFe>`;
    expect(() => dadosDoXmlNfe(xml)).toThrow("valor total");
  });

  it("rejeita XML malformado ou que não seja uma nota completa", () => {
    expect(() => dadosDoXmlNfe("<NFe>")).toThrow("XML inválido");
    expect(() => dadosDoXmlNfe("<resNFe></resNFe>")).toThrow("dados completos");
  });
});
