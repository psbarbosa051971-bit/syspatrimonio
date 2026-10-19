import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), sucesso: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.sucesso } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock("@/components/IncluirBensTermoDialog", () => ({ IncluirBensTermoDialog: () => null }));
vi.mock("@/components/EntregaTermoDialog", () => ({ EntregaTermoDialog: () => null }));
vi.mock("@/components/TermosResponsabilidadeDialog", () => ({ TermosResponsabilidadeDialog: () => null }));

import { TermosDaSala } from "@/components/TermosDaSala";
import { ExcluirTermoDialog } from "@/components/ExcluirTermoDialog";

const termo = {
  id: "termo", numero: 20, termo_ano: 2026, created_at: "2026-10-10T12:00:00Z", arquivo: "Transferência 20",
  termo_snapshot: { local: "Sala teste", bens: [{ codigo_red: "123", descricao: "Mesa", valor: 10 }] },
};
const props = {
  salaId: "sala", atualizar: 0, selecionado: "termo", quantidadeBens: 1, valorSala: 10,
  onSelecionar: vi.fn(), onLimpar: vi.fn(), onAtualizar: vi.fn(),
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: { devolvidos: 1, desvinculados: 0 }, error: null });
  mocks.from.mockImplementation(() => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "order"]) query[method] = () => query;
    query.range = () => Promise.resolve({ data: [termo], error: null });
    query.in = () => Promise.resolve({ data: [], error: null });
    return query;
  });
});

describe("exclusão de termos da sala", () => {
  it("mostra Excluir à direita de Status e exige confirmação sem apagar bens no navegador", async () => {
    render(<TermosDaSala {...props} />);
    const excluir = await screen.findByRole("button", { name: "Excluir termo 20/2026" });
    expect(excluir.previousElementSibling).toHaveAccessibleName("Status do termo 20/2026");
    fireEvent.click(excluir);
    expect(screen.getByRole("dialog", { name: "Excluir termo 20/2026" })).toBeInTheDocument();
    expect(screen.getByText(/retornam às respectivas salas de origem/)).toBeInTheDocument();
    expect(screen.getByText(/Bens importados ou anexados/)).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("exclui pelo procedimento seguro, limpa o filtro e atualiza os bens e termos", async () => {
    render(<TermosDaSala {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Excluir termo 20/2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(props.onAtualizar).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith("excluir_termo_sala", { _termo: "termo", _sala: "sala" });
    expect(props.onLimpar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Excluir termo 20/2026" })).not.toBeInTheDocument();
    expect(mocks.sucesso).toHaveBeenCalled();
  });

  it("mantém o termo quando o banco bloqueia a exclusão por uma movimentação posterior", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Bem movimentado para outro termo" } });
    render(<TermosDaSala {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Excluir termo 20/2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Bem movimentado para outro termo"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(props.onAtualizar).not.toHaveBeenCalled();
    expect(props.onLimpar).not.toHaveBeenCalled();
    expect(mocks.sucesso).not.toHaveBeenCalled();
  });

  it("impede envios duplicados enquanto aguarda a exclusão", async () => {
    let resolver!: (value: { data: null; error: null }) => void;
    mocks.rpc.mockReturnValueOnce(new Promise((resolve) => { resolver = resolve; }));
    const onExcluir = vi.fn();
    render(<ExcluirTermoDialog salaId="sala" termo={termo} onExcluir={onExcluir} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir termo 20/2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    expect(screen.getByRole("button", { name: "Excluindo..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Excluindo..." }));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    resolver({ data: null, error: null });
    await waitFor(() => expect(onExcluir).toHaveBeenCalledTimes(1));
  });
});
