import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { ResponsavelSala } from "@/components/ResponsavelSala";

const sala: Tables<"salas"> = {
  id: "sala-1", nome: "Sala administrativa", responsavel: null, cpf_responsavel: null,
  created_at: "2026-01-01", data_termo: null, departamento_id: null, endereco: null,
  unidade: "CENTRAL", user_id: "admin",
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: () => ({ single: mocks.single }) });
  mocks.single.mockResolvedValue({ data: { ...sala, responsavel: "Maria Silva", cpf_responsavel: "52998224725" }, error: null });
});

describe("Responsável informado diretamente na sala", () => {
  it("salva nome e CPF sem perfil ou cadastro de usuário", async () => {
    const onSaved = vi.fn();
    render(<ResponsavelSala sala={sala} perfil={null} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Responsável pela sala"), { target: { value: " Maria Silva " } });
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "52998224725" } });
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
    fireEvent.click(screen.getByRole("button", { name: "Salvar responsável" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ responsavel: "Maria Silva", cpf_responsavel: "52998224725" })));
    expect(mocks.from).toHaveBeenCalledWith("salas");
    expect(mocks.from).not.toHaveBeenCalledWith("profiles");
    expect(mocks.update).toHaveBeenCalledWith({ responsavel: "Maria Silva", cpf_responsavel: "52998224725" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "sala-1");
  });

  it("prioriza o responsável manual mesmo havendo usuário vinculado", () => {
    render(<ResponsavelSala sala={{ ...sala, responsavel: "Maria Silva", cpf_responsavel: "52998224725" }}
      perfil={{ nome: "Outro usuário", cpf: "11144477735" }} onSaved={vi.fn()} />);
    expect(screen.getByLabelText("Responsável pela sala")).toHaveValue("Maria Silva");
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
  });

  it("mantém o preenchimento do usuário vinculado nos locais ainda não editados", () => {
    render(<ResponsavelSala sala={sala} perfil={{ nome: "Ana", cpf: "11144477735" }} onSaved={vi.fn()} />);
    expect(screen.getByLabelText("Responsável pela sala")).toHaveValue("Ana");
    expect(screen.getByLabelText("CPF")).toHaveValue("111.444.777-35");
  });

  it("não substitui a digitação quando a consulta do perfil termina", () => {
    const onSaved = vi.fn();
    const { rerender } = render(<ResponsavelSala sala={sala} perfil={null} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Responsável pela sala"), { target: { value: "Maria Silva" } });
    rerender(<ResponsavelSala sala={sala} perfil={{ nome: "Ana", cpf: "11144477735" }} onSaved={onSaved} />);
    expect(screen.getByLabelText("Responsável pela sala")).toHaveValue("Maria Silva");
  });

  it("recusa CPF inválido sem perder o nome digitado", () => {
    render(<ResponsavelSala sala={sala} perfil={null} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Responsável pela sala"), { target: { value: "Maria Silva" } });
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "11111111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar responsável" }));
    expect(mocks.error).toHaveBeenCalledWith("Informe um CPF válido ou deixe o campo em branco");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Responsável pela sala")).toHaveValue("Maria Silva");
  });

  it("mantém a edição para tentar novamente quando não é possível salvar", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "Falha de conexão" } });
    const onSaved = vi.fn();
    render(<ResponsavelSala sala={sala} perfil={null} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Responsável pela sala"), { target: { value: "Maria Silva" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar responsável" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Responsável pela sala")).toHaveValue("Maria Silva");
    expect(screen.getByRole("button", { name: "Salvar responsável" })).toBeEnabled();
  });

  it("desabilita os campos enquanto não houver sala selecionada", () => {
    render(<ResponsavelSala sala={null} perfil={null} onSaved={vi.fn()} />);
    expect(screen.getByLabelText("Responsável pela sala")).toBeDisabled();
    expect(screen.getByLabelText("CPF")).toBeDisabled();
  });
});
