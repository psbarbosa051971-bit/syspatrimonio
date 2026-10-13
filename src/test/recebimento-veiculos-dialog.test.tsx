import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({ carregar: vi.fn(), gravar: vi.fn(), upsert: vi.fn(), erro: vi.fn(), sucesso: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "usuario" } }, error: null }) },
    from: (tabela: string) => tabela === "recebimentos_veiculos" ? {
      select: () => ({ eq: () => ({ maybeSingle: mocks.carregar }) }),
      upsert: (...args: unknown[]) => {
        mocks.upsert(...args);
        return { select: () => ({ single: mocks.gravar }) };
      },
    } : {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { nome: "12 SECRETARIA" }, error: null }) }),
        order: () => ({ range: async () => ({ data: [{ nome: "12 SECRETARIA" }], error: null }) }),
      }),
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.sucesso, error: mocks.erro } }));
import { BotaoRecebimentoVeiculo, RecebimentoVeiculosDialog } from "@/components/RecebimentoVeiculosDialog";

const bem: Tables<"bens"> = {
  id: "bem-1", user_id: "usuario", sala_id: "sala-1", codigo_red: "123",
  descricao: "VEÍCULO MARCA FIAT", valor: 10000, created_at: "2026-10-13T12:00:00Z",
  conferido: true, observacao: null, incorporacao: "13/10/2026", tipo: "Aquisição",
  importacao_id: null, conferencia_finalizada: false,
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.carregar.mockResolvedValue({ data: null, error: null });
  mocks.gravar.mockResolvedValue({ data: { bem_id: bem.id }, error: null });
});

async function aguardarCarga() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Salvar recebimento e check-list" })).toBeEnabled());
}

describe("formulário de recebimento de veículos", () => {
  it("fica oculto até clicar no carrinho e não aparece para outros bens", async () => {
    const { rerender } = render(<BotaoRecebimentoVeiculo bem={{ ...bem, descricao: "Mesa" }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<BotaoRecebimentoVeiculo bem={bem} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recebimento de Veículos — 123" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await aguardarCarga();
  });

  it("preenche os dados do bem, concatena os detalhes e salva o check-list junto", async () => {
    const onClose = vi.fn();
    render(<RecebimentoVeiculosDialog bem={bem} onClose={onClose} />);
    await aguardarCarga();
    expect(screen.getByLabelText("Data cadastro")).toHaveValue("13/10/2026");
    expect(screen.getByLabelText("Modelo do veículo")).toHaveValue("VEÍCULO MARCA FIAT");
    expect(screen.getByLabelText("Incorporação")).toHaveValue("Aquisição");
    expect(screen.getByLabelText("Secretaria")).toHaveValue("12 SECRETARIA");
    fireEvent.change(screen.getByLabelText("Ano/modelo"), { target: { value: "2025/2026" } });
    fireEvent.change(screen.getByLabelText("Placa"), { target: { value: "ABC1234" } });
    expect(screen.getByLabelText("Descrição detalhada do veículo")).toHaveValue("Ano/modelo: 2025/2026 • Placa: ABC1234");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Check-list" }), { button: 0, ctrlKey: false });
    fireEvent.change(await screen.findByLabelText("Triângulo"), { target: { value: "Sim" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar recebimento e check-list" }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      bem_id: bem.id, atualizado_por: "usuario", dados: expect.objectContaining({
        secretaria: "12 SECRETARIA", ano_modelo: "2025/2026", placa: "ABC1234", triangulo: "Sim",
      }),
    }), { onConflict: "bem_id" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("recupera o recebimento salvo sem substituir a secretaria digitada", async () => {
    mocks.carregar.mockResolvedValue({ data: { dados: { secretaria: "Outra secretaria", placa: "XYZ1234", pintura: "Regular" } }, error: null });
    render(<RecebimentoVeiculosDialog bem={bem} onClose={vi.fn()} />);
    await aguardarCarga();
    expect(screen.getByLabelText("Secretaria")).toHaveValue("Outra secretaria");
    expect(screen.getByLabelText("Placa")).toHaveValue("XYZ1234");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Check-list" }), { button: 0, ctrlKey: false });
    expect(await screen.findByLabelText("Pintura")).toHaveValue("Regular");
  });

  it("bloqueia a gravação após falha ao carregar e permite tentar novamente", async () => {
    mocks.carregar.mockResolvedValueOnce({ data: null, error: { message: "Falha" } });
    render(<RecebimentoVeiculosDialog bem={bem} onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar o recebimento.");
    expect(screen.getByRole("button", { name: "Salvar recebimento e check-list" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await aguardarCarga();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
