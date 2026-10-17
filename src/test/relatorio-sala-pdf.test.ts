import { describe, expect, it } from "vitest";
import { gerarRelatorioSalaPdf } from "@/lib/relatorio-sala-pdf";
import type { Tables } from "@/integrations/supabase/types";

const sala = { nome: "Sala da Saúde / 01", endereco: "Rua Central", unidade: "SAÚDE", responsavel: "Maria" };
const bem: Tables<"bens"> = {
  id: "bem", user_id: "usuario", sala_id: "sala", codigo_red: "60651", descricao: "Mesa de escritório",
  valor: 120.5, created_at: "2026-10-17T12:00:00Z", conferido: true, conferencia_finalizada: true,
  observacao: null, incorporacao: "2026", tipo: "Mobiliário", importacao_id: null,
};

describe("Arquivo PDF do relatório da sala", () => {
  it("gera um PDF com nome seguro para anexar no WhatsApp", async () => {
    const arquivo = await gerarRelatorioSalaPdf({ sala, departamento: "Patrimônio", responsavel: "Maria", bens: [bem] });
    expect(arquivo).toBeInstanceOf(File);
    expect(arquivo.type).toBe("application/pdf");
    expect(arquivo.name).toBe("Relatorio-Sala-da-Saude-01.pdf");
    expect(arquivo.size).toBeGreaterThan(1000);
  });

  it("permite gerar o relatório de uma sala sem bens", async () => {
    const arquivo = await gerarRelatorioSalaPdf({ sala, departamento: "", responsavel: "", bens: [] });
    expect(arquivo.type).toBe("application/pdf");
    expect(arquivo.size).toBeGreaterThan(1000);
  });
});
