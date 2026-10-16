import { describe, expect, it } from "vitest";
import { htmlDoTermo, lerDadosTermo, numeroDoTermo, type TermoResponsabilidade } from "@/lib/termo-responsabilidade";

const registro = (alteracoes: Partial<TermoResponsabilidade> = {}): TermoResponsabilidade => ({
  id: "importacao-1", numero: 2561, termo_ano: 2026,
  created_at: "2026-10-10T12:00:00Z", arquivo: "relatorio.html",
  termo_snapshot: {
    local: "200 C.M.E.I. ALEX HONÓRIO DA SILVA", endereco: "Rua Joana Anibelli Romano, 370",
    historico: "Bens da educação", data_origem: "10/10/2026", departamento: "Secretaria de Educação",
    diretor: "Diretor cadastrado", almoxarifado: "Central de Distribuição", endereco_departamento: "",
    responsavel: "Responsável cadastrado", cpf: "12345678900",
    bens: [
      { codigo_red: "73542", descricao: "CADEIRA ESCOLAR", tipo: "AQUISIÇÃO", incorporacao: "26/04/2024", valor: 275 },
      { codigo_red: "73541", descricao: "CADEIRA ESCOLAR", tipo: "AQUISIÇÃO", incorporacao: "26/04/2024", valor: 275 },
      { codigo_red: "90000", descricao: "MESA", tipo: "DOAÇÃO", incorporacao: null, valor: 100 },
    ],
  },
  ...alteracoes,
});

describe("termo de responsabilidade por importação HTML", () => {
  it("formata a numeração sequencial com o ano guardado", () => {
    expect(numeroDoTermo(registro())).toBe("2561/2026");
    expect(numeroDoTermo(registro({ termo_ano: 2025 }))).toBe("2561/2025");
  });

  it("considera o ano de Brasília quando não há ano guardado", () => {
    expect(numeroDoTermo(registro({ termo_ano: null, created_at: "2027-01-01T01:00:00Z" }))).toBe("2561/2026");
  });

  it("renderiza os bens sem subtotais de grupo, em paisagem, com total e assinaturas", () => {
    const html = htmlDoTermo(registro());
    expect(html).toContain("TERMO DE RESPONSABILIDADE Nº 2561/2026");
    expect(html).toContain("200 C.M.E.I. ALEX HONÓRIO DA SILVA");
    expect(html).not.toContain("LISTADO(S) POR GRUPO");
    expect(html).not.toContain("VALOR POR GRUPO");
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain("max-width: 273mm");
    expect(html).toContain("LISTADO(S) GERAL: 3");
    expect(html.replace(/\u00a0/g, " ")).toContain("R$ 650,00");
    expect(html.indexOf("73541")).toBeLessThan(html.indexOf("73542"));
    expect(html).toContain("Responsável cadastrado");
    expect(html).toContain("123.456.789-00");
    expect(html).toContain("DATA DE RECEBIMENTO ____/____/________");
  });

  it("não executa conteúdo do arquivo nem interpreta nomes como HTML", () => {
    const termo = registro();
    const dados = lerDadosTermo(termo.termo_snapshot);
    const html = htmlDoTermo({ ...termo, arquivo: '<img src=x onerror="alert(1)">',
      termo_snapshot: { ...dados, local: "<script>alert(1)</script>",
        bens: [{ ...dados.bens[0]!, descricao: "<iframe src='x'>" }] } });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<iframe src=");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x");
  });

  it("imprime o responsável da sala separado de quem recebe e de quem entrega", () => {
    const termo = registro();
    const dados = lerDadosTermo(termo.termo_snapshot);
    const html = htmlDoTermo({ ...termo, termo_snapshot: {
      ...dados, responsavel_recebimento: "Maria Recebedora <teste>", cpf_recebimento: "52998224725", entregador: "João Operador <teste>",
    } });
    expect(html).toContain("ENTREGUE POR");
    expect(html).toContain("João Operador &lt;teste&gt;");
    expect(html).toContain("Responsável cadastrado");
    expect(html).toContain("123.456.789-00");
    expect(html).toContain("Responsável pela Sala");
    expect(html).toContain("Maria Recebedora &lt;teste&gt;");
    expect(html).toContain("529.982.247-25");
    expect(html).toContain("Responsável pelo Recebimento");
    expect(html).not.toContain("Diretor cadastrado");
    expect(html).toContain("DATA DE RECEBIMENTO ____/____/________");
  });

  it("recusa termos sem dados ou com valores inválidos", () => {
    expect(() => lerDadosTermo(null)).toThrow();
    expect(() => lerDadosTermo({ bens: [] })).toThrow();
    expect(() => lerDadosTermo({ bens: [{ codigo_red: "123", descricao: "MESA", valor: "100" }] })).toThrow();
  });
});
