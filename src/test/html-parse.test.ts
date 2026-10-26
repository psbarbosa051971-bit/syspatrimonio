import { describe, expect, it } from "vitest";
import { parsearTermoHtml } from "@/lib/html-parse";
import { cpfValido, formatarCpf } from "@/lib/cpf";

const cabecalho = `<table><tr><td>Local Físico:</td><td>58195</td><td>C.I.E.M. PROFESSORA GERALDA CERÁVOLO RODRIGUES</td></tr>
<tr><td>Endereço:</td><td>Rua da Escola, 10</td></tr></table>`;
const colunas = `<tr><th>Cód. RED</th><th>Descrição</th><th>Incorporação</th><th>Tipo</th><th>Valor</th></tr>`;
const bem = (codigo: number) => `<tr><td>${codigo}</td><td>CADEIRA ESCOLAR</td><td>10/05/2020</td><td>Aquisição</td><td>1.234,56</td></tr>`;

describe("importação HTML", () => {
  it("lê o layout Sonner com filtro, Código Red.: e grade diferente na continuação", () => {
    const termo = parsearTermoHtml(`<p><b>Local Físico: 1º LEILÃO DE INSERVÍVEIS 2026; Situação do Bem: Ativo; Parâmetro de Ordenação: Código;</b></p>
      <table><tr><td></td><td colspan="2"><b>Local Físico:</b></td><td><b>58536</b></td><td colspan="10"><b>1º LEILÃO DE INSERVÍVEIS 2026</b></td><td></td></tr>
      <tr><td></td><td colspan="2">Código Red.:</td><td colspan="6">Descrição do bem</td><td>Incorporação</td><td>Tipo</td><td colspan="4">Valor</td><td></td></tr>
      <tr><td></td><td colspan="2">181</td><td colspan="6" rowspan="2">CADEIRA ESTOFADO DE COURVIM PRETO PRETO</td><td>31/12/1994</td><td>Aquisição</td><td colspan="2">R$ 10,00</td><td></td></tr>
      <tr><td></td><td colspan="2"></td><td></td><td></td><td colspan="2"></td><td></td></tr></table>
      <table><tr><td></td><td>2174</td><td rowspan="2">CADEIRA DE ACO</td><td>31/12/1994</td><td>Aquisição</td><td>R$ 15,00</td><td></td></tr>
      <tr><td>Total de Bens Sem Código:</td><td>0</td></tr><tr><td>Total de Bens:</td><td>2</td></tr></table>`);
    expect(termo.locais).toHaveLength(1);
    expect(termo.cabecalho.local).toBe("58536 1º LEILÃO DE INSERVÍVEIS 2026");
    expect(termo.bens.map((b) => [b.codigo_red, b.valor, b.incorporacao, b.tipo])).toEqual([
      ["181", 10, "31/12/1994", "Aquisição"], ["2174", 15, "31/12/1994", "Aquisição"],
    ]);
  });

  it("não deixa passar linhas incompletas em páginas sem cabeçalho", () => {
    expect(() => parsearTermoHtml(`${cabecalho}<table>${colunas}${bem(100001)}</table>
      <table>${bem(100002).replace("1.234,56", "???")}</table>`)).toThrow("Nada foi importado");
  });

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

  it("separa os patrimônios de cada local identificado nos títulos", () => {
    const termo = parsearTermoHtml(`<table><tr><td><b>58195 Escola A</b></td></tr>${colunas}${bem(100001)}</table>
      <table><tr><td><b>58196 Escola B</b></td></tr>${colunas}${bem(100002)}</table>`);
    expect(termo.locais.map((local) => [local.cabecalho.local, local.bens.map((b) => b.codigo_red)]))
      .toEqual([["58195 Escola A", ["100001"]], ["58196 Escola B", ["100002"]]]);
    expect(termo.bens).toHaveLength(2);
  });

  it("separa locais dentro da mesma tabela e reúne páginas do mesmo local", () => {
    const titulo = (local: string) => `<tr><td colspan="5"><b>${local}</b></td></tr>`;
    const termo = parsearTermoHtml(`<table>${titulo("58195 Escola A")}${colunas}${bem(100001)}
      ${titulo("58196 Escola B")}${colunas}${bem(100002)}
      ${titulo("58195 Escola A")}${colunas}${bem(100003)}</table><p>Total de bens: 3</p>`);
    expect(termo.locais).toHaveLength(2);
    expect(termo.locais[0]?.bens.map((b) => b.codigo_red)).toEqual(["100001", "100003"]);
    expect(termo.locais[1]?.bens.map((b) => b.codigo_red)).toEqual(["100002"]);
  });

  it("recusa um patrimônio atribuído a dois locais diferentes", () => {
    expect(() => parsearTermoHtml(`<table><tr><td><b>58195 Escola A</b></td></tr>${colunas}${bem(100001)}
      <tr><td><b>58196 Escola B</b></td></tr>${colunas}${bem(100001)}</table>`))
      .toThrow("patrimônio 100001 aparece em mais de um Local Físico");
  });

  it("separa locais rotulados sem negrito e preserva seus endereços", () => {
    const termo = parsearTermoHtml(`${cabecalho}<table>${colunas}${bem(100001)}</table>
      <table><tr><td>Local Físico:</td><td>58196</td><td>Escola B</td></tr>
      <tr><td>Endereço:</td><td>Rua B, 20</td></tr>${colunas}${bem(100002)}</table>`);
    expect(termo.locais.map((l) => [l.cabecalho.local, l.cabecalho.endereco, l.bens[0]?.codigo_red]))
      .toEqual([["58195 C.I.E.M. PROFESSORA GERALDA CERÁVOLO RODRIGUES", "Rua da Escola, 10", "100001"],
        ["58196 Escola B", "Rua B, 20", "100002"]]);
  });

  it("separa locais indicados em parágrafos sem negrito", () => {
    const termo = parsearTermoHtml(`<p>Local Físico: 58195 Escola A; Situação do Bem: Ativo;</p>
      <table>${colunas}${bem(100001)}</table>
      <p>Local Físico: 58196 Escola B; Situação do Bem: Ativo;</p>
      <table>${colunas}${bem(100002)}</table>`);
    expect(termo.locais.map((l) => l.cabecalho.local)).toEqual(["58195 Escola A", "58196 Escola B"]);
    expect(termo.locais[1]?.bens[0]?.codigo_red).toBe("100002");
  });

  it("não ignora bens que estejam antes do primeiro local identificado", () => {
    expect(() => parsearTermoHtml(`<table>${colunas}${bem(100000)}
      <tr><td><b>58195 Escola A</b></td></tr>${colunas}${bem(100001)}
      <tr><td><b>58196 Escola B</b></td></tr>${colunas}${bem(100002)}</table>`))
      .toThrow("patrimônios sem Local Físico identificado");
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
