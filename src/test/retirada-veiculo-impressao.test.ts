import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { htmlRetiradaVeiculo } from "@/lib/retirada-veiculo-impressao";

const bem: Tables<"bens"> = {
  id: "veiculo", user_id: "usuario", sala_id: "sala", codigo_red: "74652",
  descricao: "VEÍCULO TOYOTA HILUX ANO/MOD 2024/2024 PLACA TCS3H06 KM 0",
  valor: 269990, created_at: "2026-10-17T12:00:00Z", conferido: true,
  observacao: null, incorporacao: "02/10/2024", tipo: "Aquisição",
  importacao_id: null, conferencia_finalizada: false,
};
const termo: Tables<"recebimentos_veiculos"> = {
  bem_id: bem.id, numero: 3, ano: 2026, criado_em: "2026-10-17T12:00:00Z",
  atualizado_em: "2026-10-17T12:00:00Z", atualizado_por: "usuario",
  dados: {
    secretaria: "142 - TRANSPORTE DA SAÚDE", pedido: "2013", portaria: "144/2025",
    retirada_endereco: "RUA CONSELHEIRO JOAQUIM DELFINO, 173",
    retirada_estado: "NOVO", retirada_data: "2026-10-17",
    retirada_diretor: "Diretor de Patrimônio", retirada_responsavel: "Responsável da Saúde",
    retirada_documento: "12345", retirada_crv: "Sim", chave_reserva: "Sim", manual: "Sim",
  },
};

describe("relatório de retirada do veículo", () => {
  it("monta o modelo em A4 paisagem com dados patrimoniais, totais e assinaturas", () => {
    const html = htmlRetiradaVeiculo(bem, termo, "Almoxarifado");
    for (const texto of [
      "size: A4 landscape", 'src="/images/cabecalho-recebimento-veiculos.jpg"',
      "TERMO DE RESPONSABILIDADE Nº 003/2026", "142 - TRANSPORTE DA SAÚDE",
      "RUA CONSELHEIRO JOAQUIM DELFINO, 173", "VEÍCULO TOYOTA HILUX", "2024/2024", "TCS3H06",
      "2013", "Aquisição", "02/10/2024", "NOVO", "LISTADO(S) POR GRUPO:",
      "VALOR POR GRUPO:", "VALOR TOTAL:", "DIRETOR DE MATERIAL E PATRIMÔNIO",
      "Diretor de Patrimônio", "Responsável da Saúde", "Matrícula / documento: 12345",
      "DATA DE RECEBIMENTO 17/10/2026", "CRV/RECIBO, CHAVE RESERVA, MANUAL DO PROPRIETÁRIO",
      "Portaria nº 144/2025", "Decreto nº 8342/2021", "artigo 70, parágrafo único",
      "ATENÇÃO: CONFERIR NO ATO DO RECEBIMENTO.", "Imprimir / Salvar em PDF",
    ]) expect(html).toContain(texto);
    expect(html).toContain(bem.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
    expect(html).not.toContain("Almoxarifado</h1>");
    expect(html).toContain("window.addEventListener('beforeprint', ajustarPagina)");
    expect(html).toContain("<title></title>");
  });

  it("usa o Local Físico como destino quando a secretaria não foi informada", () => {
    const html = htmlRetiradaVeiculo(bem, { ...termo, dados: {} }, "Almoxarifado central");
    expect(html).toContain("<h1>Almoxarifado central</h1>");
    expect(html).toContain("ASSINATURA DO RESPONSÁVEL PELA RETIRADA");
    expect(html).toContain("DATA DE RECEBIMENTO ____ / ____ / ________");
    expect(html).not.toContain("juntamente com:");
    expect(html).not.toContain("CRV/RECIBO");
    expect(html).not.toContain("undefined");
  });

  it("não declara como entregues documentos ou acessórios sem confirmação", () => {
    const html = htmlRetiradaVeiculo(bem, { ...termo, dados: {
      retirada_crv: "Não", manual: "Não", chave_reserva: "Sim",
    } });
    expect(html).toContain("juntamente com: CHAVE RESERVA,");
    expect(html).not.toContain("CRV/RECIBO");
    expect(html).not.toContain("MANUAL DO PROPRIETÁRIO");
  });

  it("escapa o conteúdo dos campos e usa os detalhes revisados no formulário", () => {
    const html = htmlRetiradaVeiculo(bem, { ...termo, dados: {
      secretaria: '<script>alert("x")</script>', retirada_responsavel: "Nome <b>Teste</b>",
      modelo_veiculo: "HILUX & AMBULÂNCIA", placa: "ABC1D23", km: "145",
    } });
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("Nome &lt;b&gt;Teste&lt;/b&gt;");
    expect(html).toContain("HILUX &amp; AMBULÂNCIA");
    expect(html).toContain("ABC1D23");
    expect(html).toContain("<strong>KM:</strong> 145");
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).not.toContain("TCS3H06");
  });
});
