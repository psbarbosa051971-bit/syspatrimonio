import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({ locais: vi.fn(), situacao: vi.fn(), rpc: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.locais }));
vi.mock("@/lib/locais-fisicos.functions", () => ({ listarLocaisFisicosDestino: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.situacao }) }) }) }),
    rpc: mocks.rpc,
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ObservacoesBemDialog } from "@/components/ObservacoesBemDialog";

const bem: Tables<"bens"> = {
  id: "bem-1", user_id: "usuario-1", sala_id: "origem", codigo_red: "123", descricao: "Mesa",
  valor: 10, created_at: "2026-10-12T12:00:00Z", conferido: true, observacao: "Mover mesa",
  incorporacao: null, tipo: null, importacao_id: null, conferencia_finalizada: false, ano_pedido: null, pedido: null, ano_empenho: null, empenho: null, nota_fiscal: null, fornecedor: null,
};
const locais = [
  { id: "origem", nome: "12 SECRETARIA", unidade: "CENTRAL" },
  { id: "destino", nome: "25 EDUCAÇÃO", unidade: "EDUCAÇÃO" },
];

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.situacao.mockResolvedValue({ data: null, error: null });
  mocks.locais.mockResolvedValue(locais);
  mocks.rpc.mockResolvedValue({ error: null });
});

async function abrirTransferencia() {
  const opcao = screen.getByRole("checkbox", { name: "TRANSFERÊNCIA" });
  await waitFor(() => expect(opcao).toBeEnabled());
  fireEvent.click(opcao);
  return screen.findByRole("combobox", { name: "Local de destino da transferência" });
}

describe("destino nas observações do visualizador", () => {
  it("seleciona um local cadastrado e encaminha seu nome ao administrador", async () => {
    const onSaved = vi.fn();
    render(<ObservacoesBemDialog bem={bem} onClose={vi.fn()} onSaved={onSaved} />);
    const campo = await abrirTransferencia();
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "educacao" } });
    expect(screen.queryByRole("option", { name: /SECRETARIA/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /25 EDUCAÇÃO/ }));
    expect(campo).toHaveValue("25 EDUCAÇÃO");
    fireEvent.click(screen.getByRole("button", { name: "Salvar observação e situação" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("salvar_observacao_solicitacao", {
      _bem_id: "bem-1", _obs: "Mover mesa", _tipo: "transferencia", _destino: "25 EDUCAÇÃO",
    }));
    expect(onSaved).toHaveBeenCalledWith("bem-1", "Mover mesa");
  });

  it("não salva um texto pesquisado sem selecionar um destino", async () => {
    render(<ObservacoesBemDialog bem={bem} onClose={vi.fn()} onSaved={vi.fn()} />);
    const campo = await abrirTransferencia();
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "Local não cadastrado" } });
    fireEvent.blur(campo);
    fireEvent.click(screen.getByRole("button", { name: "Salvar observação e situação" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preserva o destino informado em registros anteriores", async () => {
    mocks.situacao.mockResolvedValue({ data: { tipo: "transferencia", destino: "Antigo local" }, error: null });
    render(<ObservacoesBemDialog bem={bem} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByRole("combobox", { name: "Local de destino da transferência" })).toHaveValue("Antigo local");
    fireEvent.click(screen.getByRole("button", { name: "Salvar observação e situação" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("salvar_observacao_solicitacao", expect.objectContaining({ _destino: "Antigo local" })));
  });

  it("bloqueia o salvamento se a lista falhar e permite tentar novamente", async () => {
    mocks.locais.mockRejectedValueOnce(new Error("Falha de conexão"));
    render(<ObservacoesBemDialog bem={bem} onClose={vi.fn()} onSaved={vi.fn()} />);
    const opcao = screen.getByRole("checkbox", { name: "TRANSFERÊNCIA" });
    await waitFor(() => expect(opcao).toBeEnabled());
    fireEvent.click(opcao);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os locais físicos.");
    expect(screen.getByRole("button", { name: "Salvar observação e situação" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("combobox", { name: "Local de destino da transferência" })).toBeEnabled();
  });
});
