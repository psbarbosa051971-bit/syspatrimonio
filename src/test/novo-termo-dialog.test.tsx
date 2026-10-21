import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sucesso: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.sucesso } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/components/ImprimirImportacaoDialog", () => ({
  ImprimirImportacaoDialog: ({ origem }: { origem: string }) => <p>Impressão: {origem}</p>,
}));

import { NovoTermoDialog } from "@/components/NovoTermoDialog";
import { bensAtuaisDoTermo, type TermoDaSala } from "@/lib/termos-da-sala";

const sala = { id: "sala", nome: "Sala existente" } as Tables<"salas">;
const bens = [
  { id: "bem-1", sala_id: "sala", importacao_id: "anterior", codigo_red: "123", descricao: "Mesa", valor: 10 },
  { id: "bem-2", sala_id: "sala", importacao_id: "anterior", codigo_red: "456", descricao: "Cadeira", valor: 20 },
] as Tables<"bens">[];
const termo = {
  id: "novo", numero: 21, termo_ano: 2026, created_at: "2026-10-21T12:00:00Z",
  arquivo: "Novo termo de responsabilidade",
  termo_snapshot: { tipo_documento: "novo_termo", bem_ids: ["bem-1"],
    bens: [{ codigo_red: "123", descricao: "Mesa", valor: 10 }] },
} satisfies TermoDaSala;

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: termo, error: null });
});

describe("novo termo sem movimentar bens", () => {
  it("permite cancelar sem criar termo", () => {
    const onClose = vi.fn();
    render(<NovoTermoDialog sala={sala} bens={bens} onClose={onClose} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("envia apenas os IDs selecionados e abre o recebimento do novo termo", async () => {
    const onSaved = vi.fn();
    render(<NovoTermoDialog sala={sala} bens={[bens[0]]} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Criar termo" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("novo"));
    expect(mocks.rpc).toHaveBeenCalledWith("criar_termo_bens_sala", {
      _sala: "sala", _itens: ["bem-1"], _pedido: expect.any(String),
    });
    expect(screen.getByText("Impressão: novo-termo")).toBeInTheDocument();
    expect(bens[0].importacao_id).toBe("anterior");
  });

  it("reutiliza o mesmo pedido após falha de comunicação", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("Rede indisponível"));
    render(<NovoTermoDialog sala={sala} bens={bens} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Criar termo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Verificar criação" }));
    await screen.findByText("Impressão: novo-termo");
    expect(mocks.rpc.mock.calls[0][1]).toEqual(mocks.rpc.mock.calls[1][1]);
  });

  it("bloqueia bens de outra sala", () => {
    render(<NovoTermoDialog sala={sala} bens={[{ ...bens[0], sala_id: "outra" }]} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Criar termo" })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("filtra os bens do novo termo sem substituir o vínculo do termo anterior", () => {
    expect(bensAtuaisDoTermo(bens, termo).map((bem) => bem.id)).toEqual(["bem-1"]);
    expect(bensAtuaisDoTermo(bens, { ...termo, id: "anterior", termo_snapshot: null })).toEqual(bens);
  });
});
