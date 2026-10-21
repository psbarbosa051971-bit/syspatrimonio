import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { lerNotaFiscalXml, normalizarNumeroNota } from "@/lib/notas-fiscais";
import { DocumentoNotaFiscal } from "@/components/DocumentoNotaFiscal";

const chave = "35260112345678000123550010000006141234567890";
const xml = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${chave}">
<ide><mod>55</mod><nNF>000614</nNF><serie>1</serie><dhEmi>2026-01-15T10:30:00-03:00</dhEmi><natOp>Venda</natOp><tpAmb>1</tpAmb></ide>
<emit><xNome>Fornecedor A</xNome><CNPJ>12345678000123</CNPJ><IE>123</IE><enderEmit><xLgr>Rua Central</xLgr><nro>10</nro><xMun>Itajubá</xMun><UF>MG</UF></enderEmit></emit>
<dest><xNome>Prefeitura</xNome><CNPJ>99999999000199</CNPJ></dest>
<det nItem="1"><prod><cProd>ABC</cProd><xProd>Mesa &amp; cadeira</xProd><NCM>94033000</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>100.50</vUnCom><vProd>201.00</vProd></prod></det>
<total><ICMSTot><vProd>201.00</vProd><vFrete>10.00</vFrete><vDesc>1.00</vDesc><vICMS>0.00</vICMS><vIPI>0.00</vIPI><vNF>210.00</vNF></ICMSTot></total>
<infAdic><infCpl>Entrega no almoxarifado</infCpl></infAdic>
</infNFe></NFe><protNFe><infProt><nProt>1234567</nProt></infProt></protNFe></nfeProc>`;

describe("Notas fiscais por XML", () => {
  it("normaliza zeros à esquerda sem confundir números diferentes", () => {
    expect(normalizarNumeroNota(" 000000614 ")).toBe("614");
    expect(normalizarNumeroNota("000")).toBe("0");
    expect(normalizarNumeroNota("6140")).toBe("6140");
  });
  it("lê NF-e com namespace, emitente, itens, totais e protocolo", () => {
    const nota = lerNotaFiscalXml(xml);
    expect(nota.numero).toBe("614");
    expect(nota.chave).toBe(chave);
    expect(nota.serie).toBe("1");
    expect(nota.emitente.nome).toBe("Fornecedor A");
    expect(nota.emitente.endereco).toContain("Itajubá");
    expect(nota.itens[0]).toMatchObject({ descricao: "Mesa & cadeira", quantidade: "2.0000", total: "201.00" });
    expect(nota.total).toBe("210.00");
    expect(nota.protocolo).toBe("1234567");
  });
  it("rejeita XML inválido, lotes, modelos diferentes e chave ausente", () => {
    expect(() => lerNotaFiscalXml("<NFe>")).toThrow();
    expect(() => lerNotaFiscalXml("<xml />")).toThrow(/única NF-e/);
    expect(() => lerNotaFiscalXml(`<lote>${xml}${xml}</lote>`)).toThrow(/única NF-e/);
    expect(() => lerNotaFiscalXml(xml.replace("<mod>55</mod>", "<mod>65</mod>"))).toThrow(/modelo 55/);
    expect(() => lerNotaFiscalXml(xml.replace(`Id="NFe${chave}"`, ""))).toThrow(/chave/);
  });
  it("bloqueia entidades externas e arquivos acima do limite", () => {
    expect(() => lerNotaFiscalXml(`<!DOCTYPE nfe [<!ENTITY x SYSTEM "file:///etc/passwd">]>${xml}`)).toThrow(/não permitidas/);
    expect(() => lerNotaFiscalXml("a".repeat(2 * 1024 * 1024 + 1))).toThrow(/2 MB/);
  });
  it("mostra uma nota legível e trata dados com marcação como texto", () => {
    const nota = lerNotaFiscalXml(xml.replace("Mesa &amp; cadeira", "&lt;img src=x onerror=alert(1)&gt;"));
    const { container } = render(<DocumentoNotaFiscal nota={nota} />);
    expect(screen.getByText("NF-e nº 614")).toBeInTheDocument();
    expect(screen.getByText("Fornecedor A")).toBeInTheDocument();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/15\/01\/2026/)).toBeInTheDocument();
  });
  it("identifica notas de homologação sem valor fiscal", () => {
    expect(lerNotaFiscalXml(xml.replace("<tpAmb>1</tpAmb>", "<tpAmb>2</tpAmb>")).homologacao).toBe(true);
  });
});
