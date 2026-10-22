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
    expect(mocks.atualizar).toHaveBeenCalledWith({ descricao: "VEÍCULO FIAT", valor: null });
    expect(mocks.eq).toHaveBeenCalledWith("id", "bem-1");
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
