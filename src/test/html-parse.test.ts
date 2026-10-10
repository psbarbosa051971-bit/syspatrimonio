import { describe, expect, it } from "vitest";
import { parsearTermoHtml } from "@/lib/html-parse";
import { cpfValido, formatarCpf } from "@/lib/cpf";

const cabecalho = `<table><tr><td>Local Físico:</td><td>58195</td><td>C.I.E.M. PROFESSORA GERALDA CERÁVOLO RODRIGUES</td></tr>
<tr><td>Endereço:</td><td>Rua da Escola, 10</td></tr></table>`;
const colunas = `<tr><th>Cód. RED</th><th>Descrição</th><th>Incorporação</th><th>Tipo</th><th>Valor</th></tr>`;
const bem = (codigo: number) => `<tr><td>${codigo}</td><td>CADEIRA ESCOLAR</td><td>10/05/2020</td><td>Aquisição</td><td>1.234,56</td></tr>`;

describe("importação HTML", () => {
  it("preserva código e nome do local e lê as 888 linhas em várias tabelas", () => {
    const primeira = Array.from({ length: 444 }, (_, i) => bem(100000 + i)).join("");
    const segunda = Array.from({ length: 444 }, (_, i) => bem(100444 + i)).join("");
    const termo = parsearTermoHtml(`${cabecalho}<table>${colunas}${primeira}</table>
      <table>${colunas}${segunda}</table><p>Total de bens: 888</p>`);
    expect(termo.bens).toHaveLength(888);
    expect(termo.cabecalho.local).toBe("58195 C.I.E.M. PROFESSORA GERALDA CERÁVOLO RODRIGUES");
    expect(termo.cabecalho.endereco).toBe("Rua da Escola, 10");
    expect(termo.bens[0]?.valor).toBe(1234.56);
    expect(termo.bens[887]?.codigo_red).toBe("100887");
  });

  it("prioriza o local em negrito acima da Descrição do Bem e ignora os filtros", () => {
    const filtros = `<p>Local Físico: C.I.E.M. PROFESSORA GERALDA CERÁVOLO RODRIGUES; Situação do Bem: Ativo; Parâmetro de Ordenação: Código;</p>`;
    const titulo = `<tr><td colspan="5"><strong>58195  C.I.E.M. PROFESSORA GERALDA CERÁVOLO RODRIGUES</strong></td></tr>`;
    const termo = parsearTermoHtml(`${filtros}<table>${titulo}${colunas.replace("Descrição", "Descrição do Bem")}${bem(100001)}</table>`);
    expect(termo.cabecalho.local).toBe("58195 C.I.E.M. PROFESSORA GERALDA CERÁVOLO RODRIGUES");
    expect(termo.cabecalho.local).not.toContain("Situação");
  });

  it("reúne código e nome em negritos separados", () => {
    const titulo = `<tr><td><b>58195</b></td><td colspan="4"><b>C.I.E.M. PROFESSORA GERALDA CERÁVOLO RODRIGUES</b></td></tr>`;
    const termo = parsearTermoHtml(`<table>${titulo}${colunas}${bem(100001)}</table>`);
    expect(termo.cabecalho.local).toBe("58195 C.I.E.M. PROFESSORA GERALDA CERÁVOLO RODRIGUES");
  });

  it("remove situação e ordenação mesmo sem título em negrito", () => {
    const termo = parsearTermoHtml(`<p>Local Físico: 58195 Escola; Situação do Bem: Ativo; Parâmetro de Ordenação: Código;</p><table>${colunas}${bem(100001)}</table>`);
    expect(termo.cabecalho.local).toBe("58195 Escola");
  });

  it("não mistura dois locais identificados nos títulos", () => {
    expect(() => parsearTermoHtml(`<table><tr><td><b>58195 Escola A</b></td></tr>${colunas}${bem(100001)}</table>
      <table><tr><td><b>58196 Escola B</b></td></tr>${colunas}${bem(100002)}</table>`))
      .toThrow("mais de um Local Físico");
  });

  it("lê a continuação sem repetir o cabeçalho das colunas", () => {
    const termo = parsearTermoHtml(`${cabecalho}<table>${colunas}${bem(100001)}</table>
      <table>${bem(100002)}</table>`);
    expect(termo.bens).toHaveLength(2);
  });

  it("não duplica códigos repetidos por cabeçalhos ou páginas", () => {
    const termo = parsearTermoHtml(`${cabecalho}<table>${colunas}${bem(100001)}${colunas}${bem(100001)}</table>`);
    expect(termo.bens).toHaveLength(1);
  });

  it("interrompe quando o total informado não corresponde aos códigos lidos", () => {
    expect(() => parsearTermoHtml(`${cabecalho}<table>${colunas}${bem(100001)}</table><p>Total de bens: 888</p>`))
      .toThrow("Nada foi importado");
  });

  it("interrompe se uma linha identificada tem valor inválido", () => {
    expect(() => parsearTermoHtml(`${cabecalho}<table>${colunas}${bem(100001)}${bem(100002).replace("1.234,56", "???")}</table>`))
      .toThrow("Nada foi importado");
  });

  it("não executa scripts do arquivo", () => {
    const termo = parsearTermoHtml(`${cabecalho}<script>throw new Error('executado')</script><table>${colunas}${bem(100001)}</table>`);
    expect(termo.bens).toHaveLength(1);
  });
});

describe("CPF", () => {
  it("valida dígitos verificadores e rejeita sequências e números inválidos", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("529.982.247-26")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
  });
});
