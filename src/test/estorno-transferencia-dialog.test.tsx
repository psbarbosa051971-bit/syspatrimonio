import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { EstornoTransferenciaDialog } from "@/components/EstornoTransferenciaDialog";
import { codigoParaEstorno, lerTransferenciaEstorno } from "@/lib/estornos-transferencias";

const transferencia = {
  id: "transferencia-1", numero: 20, ano: 2026, data: "2026-10-11T12:00:00Z", destino: "Sala B",
  itens: [
    { id: "bem-1", codigo_red: "123", descricao: "Mesa", valor: 10, origem: "Sala A", estornado_em: null, impedimento: null },
    { id: "bem-2", codigo_red: "456", descricao: "Cadeira", valor: 20, origem: "Sala C", estornado_em: null, impedimento: null },
    { id: "bem-3", codigo_red: "789", descricao: "Armário", valor: 30, origem: "Sala A", estornado_em: null, impedimento: "Bem movimentado após esta transferência" },
  ],
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation(async (nome: string) => nome === "buscar_ultima_transferencia"
    ? { data: transferencia, error: null }
    : { data: { quantidade: 1 }, error: null });
});

async function buscar() {
  fireEvent.change(screen.getByLabelText("Código RED"), { target: { value: "123" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar transferência" }));
  await screen.findByRole("checkbox", { name: "Selecionar RED 123" });
}

async function confirmar() {
  fireEvent.click(screen.getByRole("button", { name: "Estornar selecionados" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar estorno" }));
}

describe("estorno de transferências", () => {
  it("aceita somente um código RED e valida a resposta do histórico", () => {
    expect(codigoParaEstorno(" 00123 ")).toBe("00123");
    for (const codigo of ["", "123,456", "123 456", "abc", "1.2"]) {
      expect(() => codigoParaEstorno(codigo)).toThrow("apenas um código");
    }
    expect(lerTransferenciaEstorno(null)).toBeNull();
    expect(lerTransferenciaEstorno(transferencia)).toEqual(transferencia);
    expect(() => lerTransferenciaEstorno({ id: "incompleto" })).toThrow();
  });

  it("busca por um código, mostra o lote inteiro e devolve somente os marcados", async () => {
    const onSaved = vi.fn();
    render(<EstornoTransferenciaDialog onClose={vi.fn()} onSaved={onSaved} />);
    await buscar();
    expect(mocks.rpc).toHaveBeenCalledWith("buscar_ultima_transferencia", { _codigo: "123" });
    expect(screen.getByText("Mesa")).toBeInTheDocument();
    expect(screen.getByText("Cadeira")).toBeInTheDocument();
    expect(screen.getByText("Armário")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Selecionar RED 789" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar RED 456" }));
    await confirmar();
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenLastCalledWith("estornar_transferencia", {
      _transferencia: "transferencia-1", _itens: ["bem-2"], _pedido: expect.any(String),
    });
    expect(screen.getByRole("checkbox", { name: "Selecionar RED 456" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Selecionar RED 123" })).not.toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("1 bem(ns) devolvido(s)");
  });

  it("seleciona todos os disponíveis, sem incluir itens bloqueados", async () => {
    render(<EstornoTransferenciaDialog onClose={vi.fn()} onSaved={vi.fn()} />);
    await buscar();
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos os disponíveis" }));
    expect(screen.getByRole("checkbox", { name: "Selecionar RED 789" })).not.toBeChecked();
    await confirmar();
    await waitFor(() => expect(mocks.rpc).toHaveBeenLastCalledWith("estornar_transferencia", {
      _transferencia: "transferencia-1", _itens: ["bem-1", "bem-2"], _pedido: expect.any(String),
    }));
  });

  it("não consulta o banco quando mais de um código é digitado", async () => {
    render(<EstornoTransferenciaDialog onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Código RED"), { target: { value: "123,456" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar transferência" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("apenas um código RED");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("informa quando não existe transferência registrada", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    render(<EstornoTransferenciaDialog onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Código RED"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar transferência" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Nenhuma transferência registrada");
    expect(screen.queryByRole("button", { name: "Estornar selecionados" })).not.toBeInTheDocument();
  });

  it("não marca como estornado quando o banco rejeita a operação", async () => {
    const onSaved = vi.fn();
    render(<EstornoTransferenciaDialog onClose={vi.fn()} onSaved={onSaved} />);
    await buscar();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Um item já foi movimentado" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar RED 123" }));
    await confirmar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Um item já foi movimentado");
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Selecionar RED 123" })).not.toBeDisabled();
  });

  it("repete o mesmo pedido após falha de conexão para não duplicar o estorno", async () => {
    const onSaved = vi.fn();
    render(<EstornoTransferenciaDialog onClose={vi.fn()} onSaved={onSaved} />);
    await buscar();
    mocks.rpc.mockRejectedValueOnce(new Error("Conexão interrompida"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar RED 123" }));
    await confirmar();
    const verificar = await screen.findByRole("button", { name: "Verificar estorno" });
    expect(screen.getByRole("button", { name: "Fechar" })).toBeDisabled();
    expect(screen.getByLabelText("Código RED")).toBeDisabled();
    fireEvent.click(verificar);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[2]);
  });
});
