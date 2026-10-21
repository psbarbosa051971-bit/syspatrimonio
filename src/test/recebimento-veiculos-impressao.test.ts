import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { htmlTermoVeiculo, numeroTermoVeiculo } from "@/lib/recebimento-veiculos-impressao";

const bem: Tables<"bens"> = {
  id: "veiculo", user_id: "usuario", sala_id: "sala", codigo_red: "76948",
  descricao: "VEÍCULO CHEVROLET ONIX", valor: 91983,
  created_at: "2026-09-01T12:00:00Z", conferido: true,
  observacao: null, incorporacao: "01/09/2026", tipo: "Aquisição",
  importacao_id: null, conferencia_finalizada: false, ano_pedido: null, pedido: null, ano_empenho: null, empenho: null, nota_fiscal: null, fornecedor: null,
};
const termo: Tables<"recebimentos_veiculos"> = {
  bem_id: bem.id, numero: 2, ano: 2026, criado_em: "2026-09-01T12:00:00Z",
  atualizado_em: "2026-09-01T12:00:00Z", atualizado_por: "usuario",
  dados: {
    nota_fiscal: "107957", emissao: "2026-08-19", data_recebimento: "2026-09-01",
    fornecedor: "Distribuidora de Veículos", pedido: "1737/2026", portaria: "310/2026",
    modelo_veiculo: "CHEVROLET ONIX 1.0 BRANCO", ano_modelo: "2026/2027",
    placa: "UVM4C75", secretaria: "SECRETARIA MUNICIPAL DE OBRAS",
    triangulo: "Sim", pintura: "Bom", cambio: "Manual / mecânico", estepe: "Sim",
    observacoes_gerais: "Conferência concluída, sem avarias.",
    assinante_1: "Presidente da comissão", cargo_1: "Diretor de Patrimônio",
    local_fisico: "Almoxarifado central",
  },
};

describe("impressão do recebimento de veículos", () => {
  it("formata a sequência com três dígitos sem truncar números maiores", () => {
    expect(numeroTermoVeiculo(termo)).toBe("002/2026");
    expect(numeroTermoVeiculo({ numero: 1234, ano: 2027 })).toBe("1234/2027");
  });

  it("monta o documento A4 com identificação, checklist, conclusão e assinaturas", () => {
    const html = htmlTermoVeiculo(bem, termo);
    for (const texto of [
      "TERMO DE RECEBIMENTO DE VEÍCULOS Nº 002/2026", "size: A4 portrait",
      "107957", "19/08/2026", "Distribuidora de Veículos", "310/2026",
      "CHEVROLET ONIX 1.0 BRANCO", "SECRETARIA MUNICIPAL DE OBRAS",
      "Acessórios/equipamentos", "Acessórios especiais", "Ferramentas",
      "Estado do veículo", "Câmbio", "Estepe", "Conferência concluída, sem avarias.",
      "Diretor de Patrimônio", "Almoxarifado central", "Imprimir / Salvar em PDF",
    ]) expect(html).toContain(texto);
    expect(html.match(/class="assinatura(?: assinatura-central)?"/g)).toHaveLength(5);
    expect(html).toContain("RODRIGO JESUÍNO TRINDADE");
    expect(html).toContain("AGENTE ADMINISTRATIVO");
  });

  it("preenche a conclusão padrão com o veículo do patrimônio e a nova introdução", () => {
    const html = htmlTermoVeiculo(bem, { ...termo, dados: {} });
    expect(html).toContain("Após inspeção realizada pela Comissão de Recebimento, constatou-se que o veículo <strong>CHEVROLET ONIX</strong> encontra-se em perfeito estado de conservação. O bem não apresenta avarias no motor, na lataria, no estofamento e no sistema elétrico, sendo declarado em total conformidade com o pedido de compra.");
    expect(html).toContain("A Comissão de Recebimento de Veículos, designada pela Portaria nº 144/2025 e pelo Decreto nº 8342/2021, reuniu-se na Central de Distribuição e Logística para proceder ao exame de conferência do veículo abaixo descrito:");
    expect(html).not.toContain("Ford Ranger");
  });

  it("usa o modelo informado no recebimento sem substituir conclusões personalizadas", () => {
    const html = htmlTermoVeiculo(bem, { ...termo, dados: {
      modelo_veiculo: "Ford Ranger Limited 2.5 4WD, 5 passageiros, cor preta, motor diesel,",
      observacoes_gerais: " ",
    } });
    expect(html).toContain("o veículo <strong>Ford Ranger Limited 2.5 4WD, 5 passageiros, cor preta, motor diesel</strong> encontra-se em perfeito estado");
    const personalizado = htmlTermoVeiculo(bem, termo);
    expect(personalizado).toContain("Conferência concluída, sem avarias.");
    expect(personalizado).not.toContain("Após inspeção realizada");
  });

  it("inclui o valor total da nota sem substituir o valor unitário do patrimônio", () => {
    const html = htmlTermoVeiculo(bem, { ...termo, dados: { valor: "183966.50" } });
    expect(html).toContain("Valor total da nota fiscal");
    expect(html).toContain((183966.5).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
    expect(html).toContain(bem.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  });

  it("organiza o checklist em duas colunas e ajusta o conteúdo à página A4 antes de imprimir", () => {
    const html = htmlTermoVeiculo(bem, termo);
    expect(html).toContain('class="grupos-checklist"');
    expect(html).toContain('class="conteudo"');
    expect(html).toContain("width: 190mm; height: 276mm;");
    expect(html).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(html).toContain("Math.min(1, (alturaDisponivel - 2) / Math.max(1, altura * escala))");
    expect(html).toContain("var alturaDisponivel = folha.clientHeight - (rodape ? rodape.offsetHeight + 8 : 0)");
    expect(html).toContain("conteudo.style.width = (190 / escala) + 'mm'");
    expect(html).toContain("conteudo.style.setProperty('--recuo-paragrafo', (20 / escala) + 'mm')");
    expect(html).toContain("window.addEventListener('beforeprint', ajustarPaginaUnica)");
    expect(html).not.toContain("text-overflow: ellipsis");
  });

  it("preserva conclusões extensas e acrescenta Rodrigo abaixo das quatro assinaturas", () => {
    const conclusao = "Inspeção detalhada sem avarias. ".repeat(150);
    const html = htmlTermoVeiculo(bem, { ...termo, dados: {
      observacoes_gerais: conclusao,
      assinante_1: "Presidente", assinante_2: "Segundo membro",
      assinante_3: "PAULO SERGIO BARBOSA", assinante_4: "THÔMAS TRINDADE DA SILVA",
    } });
    expect(html).toContain(conclusao.trim());
    for (const nome of ["Presidente", "Segundo membro", "PAULO SERGIO BARBOSA", "THÔMAS TRINDADE DA SILVA"]) {
      expect(html).toContain(nome);
    }
    expect(html.match(/class="assinatura(?: assinatura-central)?"/g)).toHaveLength(5);
    expect(html).toContain('class="assinatura assinatura-central"><strong>RODRIGO JESUÍNO TRINDADE</strong><span>AGENTE ADMINISTRATIVO</span>');
    expect(html.indexOf('class="assinatura assinatura-central"')).toBeGreaterThan(html.indexOf("THÔMAS TRINDADE DA SILVA"));
    expect(html).toContain(".assinatura-central { grid-column: 1 / -1; justify-self: center;");
  });

  it("mantém o cabeçalho, margens de um centímetro e recuo de dois centímetros nos parágrafos", () => {
    const html = htmlTermoVeiculo(bem, termo);
    expect(html).toContain('@page { size: A4 portrait; margin: 0; }');
    expect(html).toContain('padding: 10mm 10mm 11mm;');
    expect(html).toContain('src="/images/cabecalho-recebimento-veiculos.jpg"');
    expect(html).toContain('alt="Cabeçalho da Prefeitura de Itajubá"');
    expect(html).toContain('onload="ajustarPaginaUnica()"');
    expect(html.indexOf('class="cabecalho-institucional"')).toBeLessThan(html.indexOf("<header>"));
    expect(html).toContain('.introducao { margin: 6px 0; font-size: 12px; line-height: 1.4;');
    expect(html).toContain('.observacoes { padding: 6px; font-size: 12px; line-height: 1.4;');
    expect(html).toContain('.introducao, .observacoes { text-indent: var(--recuo-paragrafo, 20mm); }');
    expect(html).not.toContain('class="marca"');
    expect(html).not.toContain('PREFEITURA MUNICIPAL DE ITAJUBÁ');
    expect(html).toContain('transform-origin: top left');
  });

  it("destaca o veículo na conclusão já salva sem alterar o restante do texto", () => {
    const html = htmlTermoVeiculo(bem, { ...termo, dados: {
      observacoes_gerais: "Após inspeção realizada pela Comissão de Recebimento, constatou-se que o veículo FORD RANGER LIMITED 4WD V6 LTDPCD3D4A encontra-se em perfeito estado de conservação.",
    } });
    expect(html).toContain('o veículo <strong>FORD RANGER LIMITED 4WD V6 LTDPCD3D4A</strong> encontra-se em perfeito estado de conservação.');
  });

  it("amplia os campos de identificação em preto e reserva mais espaço para as assinaturas", () => {
    const html = htmlTermoVeiculo(bem, { ...termo, dados: {
      assinante_1: "LUCAS LEONARDO", assinante_2: "IGOR TALLES",
      assinante_3: "PAULO SERGIO", assinante_4: "THÔMAS",
    } });
    expect(html).toContain('.campo span { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: oklch(0 0 0); }');
    expect(html).toContain('.campo strong { display: block; overflow-wrap: anywhere; font-size: 11px; font-weight: 500; color: oklch(0 0 0);');
    expect(html).toContain('gap: 12mm 24px; padding: 12mm 12px 0;');
    for (const nome of ["LUCAS LEONARDO", "IGOR TALLES", "PAULO SERGIO", "THÔMAS"]) {
      expect(html).toContain(`<strong>${nome}</strong>`);
    }
    expect(html.match(/class="assinatura(?: assinatura-central)?"/g)).toHaveLength(5);
  });

  it("destaca os grupos e campos do checklist em maiúsculas, negrito e com bordas pretas", () => {
    const html = htmlTermoVeiculo(bem, termo);
    expect(html).toContain('.grupos-checklist { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 6px; text-transform: uppercase; color: oklch(0 0 0); }');
    expect(html).toContain('.grupos-checklist h2 { font-weight: 700; }');
    expect(html).toContain('.checklist span { font-size: 8px; font-weight: 700; }');
    expect(html).toContain('.checklist b { min-width: 35px; max-width: 55%; padding: 1px 3px; border: 1.25px solid oklch(0 0 0); font-size: 8px; font-weight: 700;');
    expect(html).toContain('section { border: 1.25px solid oklch(0 0 0); }');
    expect(html).toContain('header, h1, h2, .campo, .destino, .assinatura, footer { border-color: oklch(0 0 0); }');
    expect(html).toContain('<b>Manual / mecânico</b>');
    expect(html).toContain('Conferência concluída, sem avarias.');
  });

  it("retira o título extra do navegador e coloca data e hora no rodapé", () => {
    const html = htmlTermoVeiculo(bem, termo);
    expect(html).toContain("<title></title>");
    expect(html).not.toContain("<title>Termo de recebimento");
    expect(html).not.toContain("about:blank");
    expect(html).toMatch(/<span class="data-impressao">\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}<\/span><\/footer>/);
    expect(html).toContain("footer { position: absolute; bottom: 0;");
    expect(html).toContain("if (dataImpressao) dataImpressao.textContent = new Date().toLocaleString('pt-BR'");
    expect(html).toContain("TERMO DE RECEBIMENTO DE VEÍCULOS Nº 002/2026");
  });

  it("escapa conteúdo digitado antes de gerar o documento de impressão", () => {
    const html = htmlTermoVeiculo(bem, { ...termo, dados: {
      endereco_orgao: '<script>alert("x")</script>',
      observacoes_gerais: '<img src=x onerror="alert(1)">',
      assinante_1: "Nome & Sobrenome",
    } });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Nome &amp; Sobrenome");
  });
});
