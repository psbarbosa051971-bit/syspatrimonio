import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { htmlPesquisaDinamica } from "@/lib/pesquisa-dinamica-impressao";

const bem = {
  id: "bem-1", codigo_red: "987654", descricao: "Mesa de aço", valor: 1250.75,
  sala_id: "sala-1", incorporacao: "2026", tipo: "Aquisição", conferido: false,
  status: "NÃO LOCALIZADO",
} as Tables<"bens">;
const resultado = { termo: "mesa", bens: [bem], locais: { "sala-1": "Arquivo central" } };

describe("Relatório A4 da pesquisa dinâmica", () => {
  it("inclui os resultados recebidos, local, status, quantidade e valor total", () => {
    const html = htmlPesquisaDinamica(resultado);
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain("RELATÓRIO DA PESQUISA DINÂMICA");
    expect(html).toContain("987.654");
    expect(html).toContain("Mesa de aço");
    expect(html).toContain("Arquivo central");
    expect(html).toContain("NÃO LOCALIZADO");
    expect(html).toContain("QUANTIDADE DE BENS: 1");
    expect(html).toContain("1.250,75");
    expect(html).toContain("window.print()");
    expect(html).toContain("display: table-header-group");
  });

  it("respeita os bens já filtrados e identifica os filtros adicionais", () => {
    const html = htmlPesquisaDinamica({ ...resultado, bens: [] }, { busca: "azul", ano: "2026" });
    expect(html).toContain("Filtro dos bens:</strong> azul");
    expect(html).toContain("Ano de incorporação:</strong> 2026");
    expect(html).toContain("QUANTIDADE DE BENS: 0");
    expect(html).toContain("Nenhum bem encontrado para os filtros aplicados.");
    expect(html).not.toContain("Mesa de aço");
  });

  it("agrupa bens intercalados por sala, com subtotais e total geral", () => {
    const html = htmlPesquisaDinamica({
      ...resultado,
      bens: [bem,
        { ...bem, id: "bem-2", sala_id: "sala-2", descricao: "Cadeira", valor: 100 },
        { ...bem, id: "bem-3", descricao: "Armário", valor: 250 },
      ],
      locais: { ...resultado.locais, "sala-2": "Secretaria de Educação" },
    });
    const grupos = [...html.matchAll(/<section class="sala">([\s\S]*?)<\/section>/g)]
      .map((grupo) => grupo[1]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toContain("<h3>Arquivo central</h3>");
    expect(grupos[0]).toContain("Mesa de aço");
    expect(grupos[0]).toContain("Armário");
    expect(grupos[0]).not.toContain("Cadeira");
    expect(grupos[0]).toContain("02 ITEM(NS)");
    expect(grupos[0]).toContain("VALOR TOTAL DA SALA:");
    expect(grupos[0]).toContain("1.500,75");
    expect(grupos[1]).toContain("<h3>Secretaria de Educação</h3>");
    expect(grupos[1]).toContain("Cadeira");
    expect(grupos[1]).toContain("01 ITEM(NS)");
    expect(grupos[1]).toContain("100,00");
    expect(html).not.toContain("<th>LOCAL FÍSICO</th>");
    expect(html).toContain("QUANTIDADE DE BENS: 3");
    expect(html).toContain("1.600,75");
  });

  it("repete o nome da sala no cabeçalho e mantém cada bloco junto na impressão", () => {
    const html = htmlPesquisaDinamica({ ...resultado,
      bens: [
        { ...bem, codigo_red: "76743", sala_id: "educacao", valor: 3341.73 },
        { ...bem, id: "bem-2", codigo_red: "76267", sala_id: "social", valor: 3341.73 },
      ],
      locais: {
        educacao: "12 SECRETARIA MUNICIPAL DE EDUCAÇÃO - SEMED",
        social: "9 SECRETARIA MUNICIPAL DE DESENVOLVIMENTO SOCIAL - SEMDES",
      },
    });
    const documento = new DOMParser().parseFromString(html, "text/html");
    const grupos = [...documento.querySelectorAll("section.sala")];
    expect(grupos).toHaveLength(2);
    expect(grupos[0].querySelector("thead h3")?.textContent)
      .toBe("12 SECRETARIA MUNICIPAL DE EDUCAÇÃO - SEMED");
    expect(grupos[1].querySelector("thead h3")?.textContent)
      .toBe("9 SECRETARIA MUNICIPAL DE DESENVOLVIMENTO SOCIAL - SEMDES");
    expect(grupos[0].querySelector("tbody")?.textContent).toContain("76.743");
    expect(grupos[0].querySelector("tbody")?.textContent).not.toContain("76.267");
    expect(grupos[1].querySelector("tbody")?.textContent).toContain("76.267");
    for (const grupo of grupos) {
      expect(grupo.querySelectorAll("thead th")).toHaveLength(7);
      expect(grupo.querySelector(".subtotal")?.textContent).toContain("01 ITEM(NS)");
      expect(grupo.querySelector(".subtotal")?.textContent).toContain("3.341,73");
    }
    expect(documento.querySelector(".total-geral")?.textContent).toContain("6.683,46");
    expect(html).toContain(".sala { margin-top: 24px; margin-bottom: 22mm; break-inside: avoid; page-break-inside: avoid;");
    expect(html).toContain(".subtotal { break-before: avoid; page-break-before: avoid;");
  });

  it("mantém salas distintas separadas mesmo com o mesmo nome", () => {
    const html = htmlPesquisaDinamica({ ...resultado,
      bens: [bem, { ...bem, id: "bem-2", sala_id: "sala-2" }],
      locais: { "sala-1": "Arquivo", "sala-2": "Arquivo" },
    });
    expect(html.match(/<section class="sala">/g)).toHaveLength(2);
    expect(html.match(/01 ITEM\(NS\)/g)).toHaveLength(2);
  });

  it("escapa o conteúdo da pesquisa e dos locais antes de criar o documento", () => {
    const html = htmlPesquisaDinamica({ ...resultado, termo: '<img src=x onerror="alert(1)">',
      locais: { "sala-1": "Arquivo <script>alert(1)</script>" },
    });
    expect(html).toContain("&lt;img");
    expect(html).toContain("Arquivo &lt;script&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
