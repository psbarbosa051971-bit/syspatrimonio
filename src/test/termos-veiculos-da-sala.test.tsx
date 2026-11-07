import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({ from: vi.fn(), buscar: vi.fn(), imprimir: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/recebimento-veiculos-impressao", () => ({
  numeroTermoVeiculo: (t: { numero: number; ano: number }) => `${String(t.numero).padStart(3, "0")}/${t.ano}`,
  imprimirTermoVeiculo: mocks.imprimir,
}));
vi.mock("@/components/RecebimentoVeiculosDialog", () => ({
  RecebimentoVeiculosDialog: ({ bem, onSaved, onClose }: { bem: Tables<"bens">; onSaved: () => void; onClose: () => void }) =>
    <div role="dialog" aria-label={`Recebimento ${bem.codigo_red}`}><button onClick={onSaved}>Salvar recebimento</button><button onClick={onClose}>Fechar</button></div>,
}));
import { TermosVeiculosDaSala } from "@/components/TermosVeiculosDaSala";

const bem = { id: "veiculo", sala_id: "sala", codigo_red: "123", descricao: "Veículo", valor: 500 } as Tables<"bens">;
const termo = { bem_id: bem.id, numero: 7, ano: 2026, dados: {
  placa: "ABC1D23", secretaria: "Saúde", data_recebimento: "2026-10-20", local_fisico: "Garagem",
} } as Tables<"recebimentos_veiculos">;
const props = {
  salaId: "sala", bensDaSala: [bem], atualizar: 0,
  carregandoBens: false, erroBens: false, onAtualizar: vi.fn(),
};
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.imprimir.mockReturnValue(true);
  mocks.buscar.mockResolvedValue({ data: [termo], error: null });
  mocks.from.mockImplementation(() => ({ select: () => ({ in: mocks.buscar }) }));
});

describe("recebimentos de veículos em Termos criados da sala", () => {
  it("consulta somente os bens da sala e mostra o termo numerado com impressão", async () => {
    const outroBem = { ...bem, id: "outro", sala_id: "outra-sala" };
    render(<TermosVeiculosDaSala {...props} bensDaSala={[bem, outroBem]} />);
    expect(await screen.findByText("007/2026")).toBeInTheDocument();
    expect(mocks.from).toHaveBeenCalledWith("recebimentos_veiculos");
    expect(mocks.buscar).toHaveBeenCalledWith("bem_id", [bem.id]);
    expect(screen.getByText("ABC1D23")).toBeInTheDocument();
    expect(screen.getByText("Saúde")).toBeInTheDocument();
    expect(screen.getByText("20/10/2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Imprimir recebimento de veículos 007/2026" }));
    expect(mocks.imprimir).toHaveBeenCalledWith(bem, termo, "Garagem");
  });

  it("abre o formulário existente e atualiza a lista depois de salvar", async () => {
    render(<TermosVeiculosDaSala {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Editar recebimento de veículos 007/2026" }));
    const dialogo = screen.getByRole("dialog", { name: "Recebimento 123" });
    mocks.buscar.mockResolvedValue({ data: [{ ...termo, dados: { ...termo.dados as object, placa: "XYZ9A87" } }], error: null });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar recebimento" }));
    expect(await screen.findByText("XYZ9A87")).toBeInTheDocument();
  });

  it("não consulta sem sala selecionada nem enquanto os bens estão carregando", () => {
    const { rerender } = render(<TermosVeiculosDaSala {...props} salaId={null} />);
    expect(screen.getByText("Selecione uma sala para consultar os recebimentos de veículos.")).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
    rerender(<TermosVeiculosDaSala {...props} carregandoBens />);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando termos de recebimento");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("permite tentar novamente quando a consulta falha", async () => {
    mocks.buscar.mockResolvedValueOnce({ data: null, error: new Error("Falha") });
    render(<TermosVeiculosDaSala {...props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("007/2026")).toBeInTheDocument();
  });

  it("limpa os termos anteriores ao mudar para uma sala sem recebimentos", async () => {
    const { rerender } = render(<TermosVeiculosDaSala {...props} />);
    await screen.findByText("007/2026");
    rerender(<TermosVeiculosDaSala {...props} salaId="outra" bensDaSala={[]} />);
    await waitFor(() => expect(screen.queryByText("007/2026")).not.toBeInTheDocument());
    expect(screen.getByText("Nenhum termo de recebimento de veículos registrado para os bens desta sala.")).toBeInTheDocument();
  });
});
