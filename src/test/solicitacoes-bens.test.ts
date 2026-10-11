import { describe, expect, it, vi } from "vitest";
import type { SolicitacaoBem } from "@/integrations/supabase/types";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { agruparSolicitacoes, csvSolicitacoes, tituloSolicitacao } from "@/lib/solicitacoes-bens";

const registro = (alteracoes: Partial<SolicitacaoBem> = {}): SolicitacaoBem => ({
  id: "solicitacao-1",
  bem_id: "bem-1",
  sala_id: "sala-1",
  user_id: "usuario-1",
  tipo: "transferencia",
  destino: "201 Escola de destino",
  observacao: "Enviado para outra escola",
  codigo_red: "001234",
  descricao: "CADEIRA ESCOLAR",
  valor: 1234.56,
  local_origem: "200 C.M.E.I. ALEX HONÓRIO DA SILVA (REBOURGEON)",
  ativa: true,
  created_at: "2026-10-10T12:00:00Z",
  updated_at: "2026-10-10T12:00:00Z",
  ...alteracoes,
});

describe("relatórios de transferências e inservíveis", () => {
  it("agrupa por local físico e situação, preservando o destino de cada bem", () => {
    const grupos = agruparSolicitacoes([
      registro(),
      registro({ id: "2", destino: "202 Outro destino" }),
      registro({ id: "3", tipo: "inservivel", destino: null }),
      registro({ id: "4", sala_id: "sala-2", local_origem: "300 Outra escola" }),
    ]);
    expect(grupos).toHaveLength(3);
    expect(grupos[0]!.itens.map((item) => item.destino)).toEqual([
      "201 Escola de destino", "202 Outro destino",
    ]);
    expect(grupos[1]!.tipo).toBe("inservivel");
    expect(grupos[2]!.local).toBe("300 Outra escola");
  });

  it("mantém separados os locais removidos usando os nomes registrados", () => {
    const grupos = agruparSolicitacoes([
      registro({ sala_id: null, local_origem: "Escola A" }),
      registro({ sala_id: null, local_origem: "Escola B" }),
    ]);
    expect(grupos).toHaveLength(2);
  });

  it("exporta origem, código, destino, observação e valor no relatório", () => {
    const csv = csvSolicitacoes([registro({ observacao: 'Entregue ao responsável: "João"' })]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"001234"');
    expect(csv).toContain('"201 Escola de destino"');
    expect(csv).toContain('"1234,56"');
    expect(csv).toContain('"Entregue ao responsável: ""João"""');
    expect(csv).toContain("200 C.M.E.I. ALEX HONÓRIO DA SILVA");
  });

  it("impede que textos do usuário sejam interpretados como fórmulas na planilha", () => {
    const csv = csvSolicitacoes([registro({ destino: '=HYPERLINK("url")', observacao: "+1+1" })]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+1+1");
  });

  it("distingue os títulos dos alertas", () => {
    expect(tituloSolicitacao("transferencia")).toBe("BENS PARA TRANSFERÊNCIA DO LOCAL FÍSICO");
    expect(tituloSolicitacao("inservivel")).toBe("BENS INSERVÍVEIS DO LOCAL FÍSICO");
  });
});
