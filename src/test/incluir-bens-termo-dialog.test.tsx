import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TermoDaSala } from "@/lib/termos-da-sala";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), eq: vi.fn(), range: vi.fn(), sucesso: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock("sonner", () => ({ toast: { success: mocks.sucesso } }));
import { IncluirBensTermoDialog } from "@/components/IncluirBensTermoDialog";

const termo: TermoDaSala = {
  id: "termo-atual", numero: 10, termo_ano: 2026, created_at: "2026-10-10T12:00:00Z",
  arquivo: "teste.html", termo_snapshot: null,
};
const bens = [
  { id: "bem-1", codigo_red: "123456", descricao: "CADEIRA", valor: 100, importacao_id: "termo-anterior" },
  { id: "bem-2", codigo_red: "789", descricao: "MESA", valor: 200, importacao_id: null },
  { id: "bem-3", codigo_red: "999", descricao: "ARMÁRIO", valor: 300, importacao_id: termo.id },
];
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((tabela: string) => {
    const consulta = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((...args: unknown[]) => { mocks.eq(...args); return consulta; }),
      order: vi.fn().mockReturnThis(),
      range: vi.fn(async () => {
        mocks.range(tabela);
        return { data: tabela === "bens" ? bens : [{ ...termo, id: "termo-anterior", numero: 9 }], error: null };
      }),
    };
    return consulta;
  });
  mocks.rpc.mockResolvedValue({ data: { quantidade: 2 }, error: null });
});
async function abrir(onAtualizar = vi.fn()) {
  render(<IncluirBensTermoDialog salaId="sala-1" termo={termo} onAtualizar={onAtualizar} />);
  fireEvent.click(screen.getByRole("button", { name: "Incluir bens ao termo" }));
  await screen.findByText("CADEIRA");
}

describe("inclusão de bens no termo da mesma sala", () => {
  it("limita as consultas à sala e impede selecionar bens já vinculados ao termo", async () => {
    await abrir();
    expect(mocks.eq).toHaveBeenCalledWith("sala_id", "sala-1");
    expect(mocks.range).toHaveBeenCalledWith("bens");
    expect(mocks.range).toHaveBeenCalledWith("importacoes");
    expect(screen.getByRole("checkbox", { name: "Incluir bem 999" })).toBeDisabled();
    expect(screen.getByText("9/2026")).toBeInTheDocument();
    expect(screen.getByText("Sem termo")).toBeInTheDocument();
  });

  it("busca RED com pontuação e mantém a seleção ao buscar outro bem", async () => {
    await abrir();
    const busca = screen.getByLabelText("Buscar código RED ou descrição");
    fireEvent.change(busca, { target: { value: "123.456" } });
    expect(screen.getByText("CADEIRA")).toBeInTheDocument();
    expect(screen.queryByText("MESA")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir bem 123456" }));
    fireEvent.change(busca, { target: { value: "mesa" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir bem 789" }));
    fireEvent.change(busca, { target: { value: "123456, 789" } });
    expect(screen.getByRole("checkbox", { name: "Incluir bem 123456" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Incluir bem 789" })).toBeChecked();
  });

  it("confirma a mudança de vínculo e atualiza a tela somente após salvar", async () => {
    const atualizar = vi.fn();
    await abrir(atualizar);
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir bem 123456" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir bem 789" }));
    fireEvent.click(screen.getByRole("button", { name: "Incluir bens selecionados" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("documento histórico anterior não será alterado");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar inclusão" }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith("incluir_bens_no_termo", {
      _termo: termo.id, _sala: "sala-1", _itens: ["bem-1", "bem-2"],
    });
  });

  it("preserva o formulário e a seleção quando o banco recusa uma alteração", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Um dos bens mudou de sala." } });
    const atualizar = vi.fn();
    await abrir(atualizar);
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir bem 789" }));
    fireEvent.click(screen.getByRole("button", { name: "Incluir bens selecionados" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar inclusão" }));
    await screen.findByText("Um dos bens mudou de sala.");
    expect(atualizar).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Incluir bem 789" })).toBeChecked();
  });
});
