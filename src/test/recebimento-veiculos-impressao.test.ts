import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { htmlTermoVeiculo, numeroTermoVeiculo } from "@/lib/recebimento-veiculos-impressao";

const bem: Tables<"bens"> = {
  id: "veiculo", user_id: "usuario", sala_id: "sala", codigo_red: "76948",
  descricao: "VEÍCULO CHEVROLET ONIX", valor: 91983,
  created_at: "2026-09-01T12:00:00Z", conferido: true,
  observacao: null, incorporacao: "01/09/2026", tipo: "Aquisição",
  importacao_id: null, conferencia_finalizada: false,
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
    expect(html.match(/class="assinatura"/g)).toHaveLength(4);
  });

  it("preenche a conclusão padrão com o veículo do patrimônio e a nova introdução", () => {
    const html = htmlTermoVeiculo(bem, { ...termo, dados: {} });
    expect(html).toContain("Após inspeção realizada pela Comissão de Recebimento, constatou-se que o veículo CHEVROLET ONIX encontra-se em perfeito estado de conservação. O bem não apresenta avarias no motor, na lataria, no estofamento e no sistema elétrico, sendo declarado em total conformidade com o pedido de compra.");
    expect(html).toContain("A Comissão de Recebimento de Veículos, designada pela Portaria nº 144/2025 e pelo Decreto nº 8342/2021, reuniu-se na Central de Distribuição e Logística para proceder ao exame de conferência do veículo abaixo descrito:");
    expect(html).not.toContain("Ford Ranger");
  });

  it("usa o modelo informado no recebimento sem substituir conclusões personalizadas", () => {
    const html = htmlTermoVeiculo(bem, { ...termo, dados: {
      modelo_veiculo: "Ford Ranger Limited 2.5 4WD, 5 passageiros, cor preta, motor diesel,",
      observacoes_gerais: " ",
    } });
    expect(html).toContain("o veículo Ford Ranger Limited 2.5 4WD, 5 passageiros, cor preta, motor diesel encontra-se em perfeito estado");
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

  it("escapa conteúdo digitado antes de gerar o documento de impressão", () => {
    const html = htmlTermoVeiculo(bem, { ...termo, dados: {
      orgao: '<script>alert("x")</script>',
      observacoes_gerais: '<img src=x onerror="alert(1)">',
      assinante_1: "Nome & Sobrenome",
    } });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Nome &amp; Sobrenome");
  });
});
