import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { carregarStatusTermosRelatorio } from "@/lib/status-termos-relatorio";

const bem = { id: "bem-1", sala_id: "sala-1", importacao_id: "termo-1" } as Tables<"bens">;
const termo = {
  id: "termo-1", sala_id: "sala-1", numero: 1, termo_ano: 2026,
  created_at: "2026-01-01T00:00:00Z", arquivo: "Importação", termo_snapshot: { bens: [] },
};
function preparar(termos: typeof termo[], entregas: { importacao_id: string; status: string }[] = [], falha = false) {
  mocks.from.mockImplementation((tabela: string) => {
    let dados: Record<string, unknown>[] = tabela === "importacoes" ? termos : entregas;
    const consulta = {
      select: () => consulta,
      not: () => consulta,
      order: () => consulta,
      in: (campo: string, valores: string[]) => {
        dados = dados.filter((registro) => valores.includes(String(registro[campo])));
        return consulta;
      },
      range: async (inicio: number, fim: number) => ({
        data: falha ? null : dados.slice(inicio, fim + 1),
        error: falha ? new Error("Falha de conexão") : null,
      }),
    };
    return consulta;
  });
}
beforeEach(() => vi.clearAllMocks());

describe("Status dos termos no relatório filtrado", () => {
  it("usa Entregue e Aguardando Entrega conforme os termos, não a localização dos bens", async () => {
    preparar([termo, { ...termo, id: "termo-2" }], [{ importacao_id: "termo-1", status: "Entregue" }]);
    const resultado = await carregarStatusTermosRelatorio([
      { ...bem, status: "NÃO LOCALIZADO" },
      { ...bem, id: "bem-2", importacao_id: "termo-2", status: "LOCALIZADO" },
    ]);
    expect(resultado).toEqual({ "bem-1": "Entregue", "bem-2": "Aguardando Entrega" });
  });

  it("identifica bens de novo termo pelos IDs mesmo mantendo a importação anterior", async () => {
    const novo = { ...termo, id: "novo", termo_snapshot: { bens: [], tipo_documento: "novo_termo", bem_ids: [bem.id] } };
    preparar([novo], [{ importacao_id: "novo", status: "Entregue" }]);
    expect(await carregarStatusTermosRelatorio([bem])).toEqual({ "bem-1": "Entregue" });
  });

  it("não atribui status de termo de outra sala a um bem transferido", async () => {
    preparar([termo], [{ importacao_id: termo.id, status: "Entregue" }]);
    expect(await carregarStatusTermosRelatorio([{ ...bem, sala_id: "sala-2" }]))
      .toEqual({ "bem-1": "Sem termo" });
  });

  it("considera o termo selecionado quando há histórico de mais de um termo", async () => {
    const novo = { ...termo, id: "novo", termo_snapshot: { bens: [], tipo_documento: "novo_termo", bem_ids: [bem.id] } };
    preparar([novo, termo], [{ importacao_id: termo.id, status: "Entregue" }]);
    expect(await carregarStatusTermosRelatorio([bem], termo)).toEqual({ "bem-1": "Entregue" });
    expect(await carregarStatusTermosRelatorio([bem])).toEqual({ "bem-1": "Aguardando Entrega" });
  });

  it("identifica bens sem termo e não consulta o banco para uma lista vazia", async () => {
    preparar([]);
    expect(await carregarStatusTermosRelatorio([])).toEqual({});
    expect(mocks.from).not.toHaveBeenCalled();
    expect(await carregarStatusTermosRelatorio([bem])).toEqual({ "bem-1": "Sem termo" });
  });

  it("não confunde uma falha de consulta com um termo aguardando entrega", async () => {
    preparar([], [], true);
    await expect(carregarStatusTermosRelatorio([bem])).rejects.toThrow("Falha de conexão");
  });
});
