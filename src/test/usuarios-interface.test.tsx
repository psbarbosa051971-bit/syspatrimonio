import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), salaId: undefined as string | undefined }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({ salaId: mocks.salaId }) }),
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "admin" } }) }));
vi.mock("@/hooks/use-role", () => ({ useRole: () => ({ role: "admin", loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/usuarios.functions", () => ({ criarUsuario: vi.fn() }));
vi.mock("@/components/GerenciarUsuarios", () => ({
  GerenciarUsuarios: ({ salaInicialId }: { salaInicialId?: string }) => <div data-testid="local-para-edicao">{salaInicialId}</div>,
}));

import { Route } from "@/routes/_authenticated/usuarios";
const Page = Route.options.component as ComponentType;
const nomeLocal = "200 — Administração — Coordenação de Patrimônio e Almoxarifado Central";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.salaId = undefined;
  mocks.from.mockImplementation((tabela: string) => {
    const data = tabela === "profiles" ? [{ id: "ana", nome: "Ana Silva", email: null, cpf: null, matricula: null, login: "ana" }]
      : tabela === "user_roles" ? [{ user_id: "ana", role: "visualizador" }]
      : tabela === "user_salas" ? [{ user_id: "ana", sala_id: "local-1" }]
      : [{ id: "local-1", nome: nomeLocal, unidade: "CENTRAL" }];
    const resultado = Promise.resolve({ data, error: null });
    return { select: () => ({ order: () => resultado, then: resultado.then.bind(resultado) }) };
  });
});

describe("Interface de usuários", () => {
  it("alterna a visibilidade da senha sem perder o valor digitado", async () => {
    render(<Page />);
    await screen.findByText("Ana Silva");
    const senha = screen.getByLabelText("Senha (mín. 6 caracteres)");
    fireEvent.change(senha, { target: { value: "MinhaSenha123" } });
    expect(senha).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(senha).toHaveAttribute("type", "text");
    expect(senha).toHaveValue("MinhaSenha123");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(senha).toHaveAttribute("type", "password");
    expect(senha).toHaveValue("MinhaSenha123");
  });

  it("encaminha o local da navegação e mostra o vínculo completo abaixo do campo ampliado", async () => {
    mocks.salaId = "local-1";
    render(<Page />);
    expect(screen.getByTestId("local-para-edicao")).toHaveTextContent("local-1");
    fireEvent.click(screen.getByRole("button", { name: "Visualizar usuários e permissões" }));
    expect(await screen.findByText(nomeLocal)).toHaveClass("break-words", "whitespace-normal");
    expect(screen.getByRole("table")).toHaveClass("min-w-[960px]", "table-fixed");
  });

  it("inicia com usuários e permissões ocultos e permite visualizar e ocultar novamente", () => {
    render(<Page />);
    const botao = screen.getByRole("button", { name: "Visualizar usuários e permissões" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nome completo do usuário")).toBeVisible();
    fireEvent.click(botao);
    expect(screen.getByRole("table")).toBeVisible();
    expect(botao).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar usuários e permissões" }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(botao).toHaveAttribute("aria-expanded", "false");
  });
});
