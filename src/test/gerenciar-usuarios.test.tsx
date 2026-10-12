import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GerenciarUsuarios } from "@/components/GerenciarUsuarios";

const acoes = vi.hoisted(() => ({
  editar: vi.fn(), excluir: vi.fn(), senha: vi.fn(), erro: vi.fn(), sucesso: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/gerenciar-usuarios.functions", () => ({
  editarUsuario: acoes.editar, excluirUsuario: acoes.excluir, mudarSenhaUsuario: acoes.senha,
}));
vi.mock("sonner", () => ({ toast: { error: acoes.erro, success: acoes.sucesso } }));

const usuarios = [
  { id: "admin", nome: "Administrador", cpf: "52998224725", email: "admin@exemplo.com", role: "admin" as const },
  { id: "usuario", nome: "Ana Silva", cpf: "11144477735", email: "ana@exemplo.com", role: "visualizador" as const },
];
const atualizar = vi.fn();
function abrir() {
  render(<GerenciarUsuarios usuarios={usuarios} usuarioAtualId="admin" onAtualizar={atualizar} />);
}
function selecionar(id = "usuario") {
  fireEvent.change(screen.getByLabelText("Usuário"), { target: { value: id } });
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("Gerenciar usuários", () => {
  it("permite buscar um usuário por nome, CPF ou e-mail", () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Buscar usuário"), { target: { value: "ana@" } });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: /Ana Silva/ })).toBeInTheDocument();
  });

  it("edita os dados do usuário selecionado", async () => {
    abrir(); selecionar();
    fireEvent.click(screen.getByRole("button", { name: "Editar usuário" }));
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Ana Silva");
    fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Ana Souza" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(acoes.editar).toHaveBeenCalledWith({ data: expect.objectContaining({ id: "usuario", nome: "Ana Souza" }) }));
    await waitFor(() => expect(atualizar).toHaveBeenCalled());
  });

  it("permite editar matrícula e login mantendo o e-mail vazio", async () => {
    render(<GerenciarUsuarios usuarios={[
      { ...usuarios[1]!, email: null, login: "anasilva", matricula: "00123" },
    ]} usuarioAtualId="admin" onAtualizar={atualizar} />);
    selecionar();
    fireEvent.click(screen.getByRole("button", { name: "Editar usuário" }));
    expect(screen.getByLabelText("Matrícula")).toHaveValue("00123");
    expect(screen.getByLabelText("Login")).toHaveValue("anasilva");
    expect(screen.getByLabelText("E-mail de acesso (opcional com login)")).not.toBeRequired();
    fireEvent.change(screen.getByLabelText("Matrícula"), { target: { value: "00456" } });
    fireEvent.change(screen.getByLabelText("Login"), { target: { value: "anasouza" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(acoes.editar).toHaveBeenCalledWith({
      data: expect.objectContaining({ matricula: "00456", login: "anasouza", email: "" }),
    }));
  });

  it("exige confirmação coincidente antes de mudar a senha", async () => {
    abrir(); selecionar();
    fireEvent.click(screen.getByRole("button", { name: "Mudar de senha" }));
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "novaSenha123" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "outraSenha123" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(acoes.senha).not.toHaveBeenCalled();
    expect(acoes.erro).toHaveBeenCalledWith("As senhas não coincidem");
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "novaSenha123" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    await waitFor(() => expect(acoes.senha).toHaveBeenCalledWith({ data: { id: "usuario", senha: "novaSenha123" } }));
  });

  it("pede confirmação para excluir outro usuário", async () => {
    abrir(); selecionar();
    fireEvent.click(screen.getByRole("button", { name: "Excluir usuário" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(acoes.excluir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(acoes.excluir).toHaveBeenCalledWith({ data: { id: "usuario" } }));
    await waitFor(() => expect(atualizar).toHaveBeenCalled());
  });

  it("protege a própria conta contra exclusão e remoção da permissão", () => {
    abrir(); selecionar("admin");
    expect(screen.getByRole("button", { name: "Excluir usuário" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Editar usuário" }));
    expect(screen.getByLabelText("Permissão")).toBeDisabled();
  });
});
