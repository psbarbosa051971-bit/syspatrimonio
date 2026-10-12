import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(), getSession: vi.fn(), updateUser: vi.fn(),
  signOut: vi.fn(), unsubscribe: vi.fn(), onAuthStateChange: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: mocks } }));
import { RecuperarSenha } from "@/components/RecuperarSenha";
import { RedefinirSenha } from "@/components/RedefinirSenha";

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/redefinir-senha");
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "usuario" } } }, error: null });
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mocks.unsubscribe } } });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

async function preencherSenhas(senha = "NovaSenha123", confirmacao = senha) {
  await screen.findByLabelText("Nova senha");
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: senha } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: confirmacao } });
  fireEvent.submit(screen.getByRole("button", { name: "Salvar nova senha" }).closest("form")!);
}

describe("recuperação de senha", () => {
  it("envia o link para o e-mail e apresenta uma confirmação sem revelar contas existentes", async () => {
    render(<RecuperarSenha emailInicial="pessoa@exemplo.com" onVoltar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Se este e-mail estiver cadastrado");
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("pessoa@exemplo.com", {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    expect(screen.getByRole("status")).toHaveTextContent("spam");
  });

  it("orienta contas sem e-mail a procurar o administrador e permite voltar", () => {
    const voltar = vi.fn();
    render(<RecuperarSenha emailInicial="PSBARBOSA" onVoltar={voltar} />);
    expect(screen.getByLabelText("E-mail cadastrado")).toHaveValue("");
    expect(screen.getByText(/Solicite ao administrador/)).toHaveTextContent("login ou matrícula");
    fireEvent.click(screen.getByRole("button", { name: "Voltar para entrar" }));
    expect(voltar).toHaveBeenCalledOnce();
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("permite tentar novamente se o envio falhar", async () => {
    mocks.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: "rate limit" } });
    render(<RecuperarSenha emailInicial="pessoa@exemplo.com" onVoltar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Aguarde alguns minutos");
    expect(screen.getByRole("button", { name: "Enviar link de recuperação" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("não permite salvar sem uma sessão válida", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    render(<RedefinirSenha />);
    expect(await screen.findByRole("alert")).toHaveTextContent("expirou ou já foi utilizado");
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejeita o link expirado mesmo se já houver uma sessão aberta", async () => {
    window.history.replaceState(null, "", "/redefinir-senha#error=access_denied&error_code=otp_expired");
    render(<RedefinirSenha />);
    expect(await screen.findByRole("alert")).toHaveTextContent("O link é inválido");
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });

  it("valida o tamanho e a confirmação antes de salvar", async () => {
    render(<RedefinirSenha />);
    await preencherSenhas("123");
    expect(screen.getByRole("alert")).toHaveTextContent("pelo menos 6 caracteres");
    await preencherSenhas("NovaSenha123", "Diferente123");
    expect(screen.getByRole("alert")).toHaveTextContent("não coincidem");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("atualiza a senha, encerra a sessão local e oferece retorno ao login", async () => {
    const { unmount } = render(<RedefinirSenha />);
    await preencherSenhas();
    expect(await screen.findByRole("status")).toHaveTextContent("Senha atualizada com sucesso");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "NovaSenha123" });
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(screen.getByRole("link", { name: "Voltar para entrar" })).toHaveAttribute("href", "/entrar");
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("não anuncia sucesso se a atualização for recusada", async () => {
    mocks.updateUser.mockResolvedValueOnce({ error: { code: "same_password" } });
    render(<RedefinirSenha />);
    await preencherSenhas();
    expect(await screen.findByRole("alert")).toHaveTextContent("diferente da anterior");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salvar nova senha" })).toBeEnabled();
  });
});
