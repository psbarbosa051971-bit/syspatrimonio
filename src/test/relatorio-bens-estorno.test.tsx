import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GrupoSolicitacoes, SolicitacaoBem } from "@/lib/solicitacoes-bens";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sucesso: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("sonner", () => ({ toast: { success: mocks.sucesso } }));
import { RelatorioBensDialog } from "@/components/RelatorioBensDialog";

function item(id: string): SolicitacaoBem {
  return { id, bem_id: `bem-${id}`, sala_id: "sala-a", local_origem: "Sala A",
    tipo: "inservivel", destino: null, ativa: true, codigo_red: id, descricao: "Mesa",
    valor: 10, observacao: "Preservar observação", user_id: "usuario",
    created_at: "2026-10-10T12:00:00Z", updated_at: "2026-10-10T12:00:00Z" };
}
const grupo: GrupoSolicitacoes = {
  chave: "sala-a-inservivel", local: "Sala A", tipo: "inservivel", itens: [item("1"), item("2")],
};

beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: 1, error: null }); });
afterEach(cleanup);

describe("estorno no relatório de bens inservíveis", () => {
  it("estorna somente os bens marcados, após confirmação", async () => {
    const onEstornados = vi.fn();
    render(<RelatorioBensDialog grupo={grupo} onClose={vi.fn()} onEstornados={onEstornados} />);
    expect(screen.getByRole("button", { name: "Estornar bens" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar bem 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Estornar bens" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar estorno" }));
    await waitFor(() => expect(onEstornados).toHaveBeenCalledWith(["2"]));
    expect(mocks.rpc).toHaveBeenCalledWith("estornar_bens_inserviveis", {
      _solicitacoes: ["2"], _sala_id: "sala-a",
    });
    expect(mocks.sucesso).toHaveBeenCalled();
  });

  it("permite marcar e desmarcar todos e estornar o conjunto", async () => {
    mocks.rpc.mockResolvedValue({ data: 2, error: null });
    const onEstornados = vi.fn();
    render(<RelatorioBensDialog grupo={grupo} onClose={vi.fn()} onEstornados={onEstornados} />);
    const todos = screen.getByRole("checkbox", { name: "Selecionar todos os bens" });
    fireEvent.click(todos);
    expect(screen.getByRole("checkbox", { name: "Selecionar bem 1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Selecionar bem 2" })).toBeChecked();
    fireEvent.click(todos);
    expect(screen.getByRole("button", { name: "Estornar bens" })).toBeDisabled();
    fireEvent.click(todos);
    fireEvent.click(screen.getByRole("button", { name: "Estornar bens" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar estorno" }));
    await waitFor(() => expect(onEstornados).toHaveBeenCalledWith(["1", "2"]));
  });

  it("mantém a seleção e os registros quando o estorno falha", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Bem alterado. Reabra o relatório." } });
    const onEstornados = vi.fn();
    render(<RelatorioBensDialog grupo={grupo} onClose={vi.fn()} onEstornados={onEstornados} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar bem 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Estornar bens" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar estorno" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bem alterado. Reabra o relatório.");
    expect(onEstornados).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Selecionar bem 1" })).toBeChecked();
  });

  it("cancelar a confirmação não altera nenhum bem", () => {
    render(<RelatorioBensDialog grupo={grupo} onClose={vi.fn()} onEstornados={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar bem 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Estornar bens" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirmar estorno" })).not.toBeInTheDocument();
  });

  it("retira somente a solicitação de transferência marcada, após confirmação", async () => {
    const onEstornados = vi.fn();
    const transferencias: GrupoSolicitacoes = { ...grupo, tipo: "transferencia",
      itens: grupo.itens.map((registro) => ({ ...registro, tipo: "transferencia", destino: "Sala B" })) };
    render(<RelatorioBensDialog grupo={transferencias} onClose={vi.fn()} onEstornados={onEstornados} />);
    expect(screen.getByRole("button", { name: "Estornar bens" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar bem 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Estornar bens" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Confirmar estorno" })).toHaveTextContent("Os bens permanecem em Sala A.");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar estorno" }));
    await waitFor(() => expect(onEstornados).toHaveBeenCalledWith(["2"]));
    expect(mocks.rpc).toHaveBeenCalledWith("estornar_solicitacoes_transferencia", {
      _solicitacoes: ["2"], _sala_id: "sala-a",
    });
    expect(mocks.sucesso).toHaveBeenCalledWith(expect.stringContaining("solicitação de transferência foi retirada do relatório"));
  });

  it("mantém os bens para transferência no relatório quando o estorno falha", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Solicitação alterada. Reabra o relatório." } });
    const onEstornados = vi.fn();
    render(<RelatorioBensDialog grupo={{ ...grupo, tipo: "transferencia",
      itens: grupo.itens.map((registro) => ({ ...registro, tipo: "transferencia" })) }}
      onClose={vi.fn()} onEstornados={onEstornados} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar bem 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Estornar bens" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar estorno" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Solicitação alterada. Reabra o relatório.");
    expect(onEstornados).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Selecionar bem 1" })).toBeChecked();
  });

  it("não permite selecionar solicitações sem vínculo com o bem", () => {
    render(<RelatorioBensDialog grupo={{ ...grupo, tipo: "transferencia",
      itens: [{ ...item("1"), tipo: "transferencia", bem_id: null }] }}
      onClose={vi.fn()} onEstornados={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Selecionar bem 1" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Selecionar todos os bens" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Estornar bens" })).toBeDisabled();
  });
});
