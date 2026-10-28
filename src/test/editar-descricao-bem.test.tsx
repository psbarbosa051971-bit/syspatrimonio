import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({ atualizar: vi.fn(), eq: vi.fn(), gravar: vi.fn(), sucesso: vi.fn(), erro: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ update: (dados: unknown) => {
    mocks.atualizar(dados);
    return { eq: (...args: unknown[]) => {
      mocks.eq(...args);
      return { select: () => ({ single: mocks.gravar }) };
    } };
  } }) },
}));
vi.mock("@/lib/pdf-parse", () => ({ limparDescricao: (descricao: string) => descricao }));
vi.mock("sonner", () => ({ toast: { success: mocks.sucesso, error: mocks.erro } }));
import { EditarDescricaoBem } from "@/components/EditarDescricaoBem";

const bem = { id: "bem-1", codigo_red: "123", descricao: "MESA", sala_id: "sala-1" } as Tables<"bens">;
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.gravar.mockResolvedValue({ data: { ...bem, descricao: "VEÍCULO FIAT" }, error: null });
});

async function abrir(onSaved = vi.fn()) {
  render(<EditarDescricaoBem bem={bem} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar descrição do bem — 123" }));
  return screen.getByLabelText("Descrição do bem");
}

describe("edição da descrição do bem", () => {
  it("salva a descrição no bem correto e atualiza a listagem", async () => {
    const onSaved = vi.fn();
    const campo = await abrir(onSaved);
    expect(campo).toHaveValue("MESA");
    fireEvent.change(campo, { target: { value: " VEÍCULO FIAT " } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ descricao: "VEÍCULO FIAT" })));
    expect(mocks.atualizar).toHaveBeenCalledWith({ descricao: "VEÍCULO FIAT" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "bem-1");
    expect(mocks.sucesso).toHaveBeenCalledWith("Dados do bem e dos termos de responsabilidade da sala atualizados.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("mantém o texto digitado após falha e permite tentar novamente", async () => {
    mocks.gravar.mockResolvedValueOnce({ data: null, error: { message: "Falha" } });
    const onSaved = vi.fn();
    const campo = await abrir(onSaved);
    fireEvent.change(campo, { target: { value: "VEÍCULO FIAT" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(mocks.erro).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
    expect(campo).toHaveValue("VEÍCULO FIAT");
    expect(screen.getByRole("button", { name: "Salvar descrição" })).toBeEnabled();
  });

  it("informa que o salvamento também atualiza os termos já criados da mesma sala", async () => {
    await abrir();
    expect(screen.getByText(/nos termos de responsabilidade da mesma sala, inclusive os já criados/)).toBeInTheDocument();
  });

  it("salva mesmo sem mudar o texto para permitir sincronizar um termo desatualizado", async () => {
    mocks.gravar.mockResolvedValueOnce({ data: bem, error: null });
    const onSaved = vi.fn();
    await abrir(onSaved);
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(bem));
    expect(mocks.atualizar).toHaveBeenCalledWith({ descricao: "MESA" });
  });

  it("não aceita uma descrição vazia", async () => {
    const campo = await abrir();
    fireEvent.change(campo, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Salvar descrição" })).toBeDisabled();
    expect(mocks.atualizar).not.toHaveBeenCalled();
  });
});

describe("edição do valor do bem", () => {
  it("salva o valor digitado em reais", async () => {
    await abrir();
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "R$ 3.459,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(mocks.atualizar).toHaveBeenCalledWith({ descricao: "MESA", valor: 3459 }));
  });
});

describe("edição da incorporação e do tipo do bem", () => {
  const bemComDados = { ...bem, incorporacao: "07/12/2009", tipo: "Doação" } as Tables<"bens">;

  function abrirComDados() {
    render(<EditarDescricaoBem bem={bemComDados} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar descrição do bem — 123" }));
  }

  it("mostra a incorporação e o tipo já cadastrados", () => {
    abrirComDados();
    expect(screen.getByLabelText("Incorporação")).toHaveValue("07/12/2009");
    expect(screen.getByLabelText("Tipo")).toHaveValue("Doação");
  });

  it("salva a incorporação digitada com máscara e o tipo escolhido", async () => {
    abrirComDados();
    fireEvent.change(screen.getByLabelText("Incorporação"), { target: { value: "15022020" } });
    expect(screen.getByLabelText("Incorporação")).toHaveValue("15/02/2020");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "Aquisição" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(mocks.atualizar).toHaveBeenCalledWith(
      { descricao: "MESA", incorporacao: "15/02/2020", tipo: "Aquisição" },
    ));
  });

  it("não salva quando a data de incorporação é inválida", async () => {
    abrirComDados();
    fireEvent.change(screen.getByLabelText("Incorporação"), { target: { value: "33132020" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(mocks.erro).toHaveBeenCalled());
    expect(mocks.atualizar).not.toHaveBeenCalled();
  });
});

