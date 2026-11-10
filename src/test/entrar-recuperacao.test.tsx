import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: {} as { retorno?: "/checklist" },
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => mocks.navigate,
  useSearch: () => mocks.search,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/login.functions", () => ({ entrarComLogin: vi.fn() }));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: { signInWithOAuth: mocks.signInWithOAuth } } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signInWithPassword: mocks.signInWithPassword } } }));
import { Route } from "@/routes/entrar";

// O mock de createFileRoute expõe as opções sem inicializar o roteador.
const Entrar = (Route as unknown as { component: () => ReactNode }).component;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = {};
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signInWithOAuth.mockResolvedValue({ error: null, redirected: false });
});
afterEach(cleanup);

describe("acesso ao checklist pelo celular", () => {
  async function entrarComSenha() {
    render(<Entrar />);
    fireEvent.change(screen.getByLabelText("Login ou e-mail"), { target: { value: "pessoa@exemplo.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-teste" } });
    fireEvent.submit(screen.getByRole("button", { name: "Entrar", exact: true }).closest("form")!);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
  }

  it("volta automaticamente ao checklist após entrar com senha", async () => {
    mocks.search = { retorno: "/checklist" };
    await entrarComSenha();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/checklist" });
  });

  it("preserva a entrada habitual na página de departamentos", async () => {
    await entrarComSenha();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/departamentos" });
  });

  it("mantém o destino do checklist ao entrar com Google", async () => {
    mocks.search = { retorno: "/checklist" };
    render(<Entrar />);
    fireEvent.click(screen.getByRole("button", { name: "Entrar com Google" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/checklist" }));
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith("google", {
      redirect_uri: new URL("/checklist", window.location.origin).href,
    });
  });

  it("não aceita endereços externos como destino após o login", () => {
    const validar = (Route as unknown as {
      validateSearch: (search: Record<string, unknown>) => { retorno?: string };
    }).validateSearch;
    expect(validar({ retorno: "/checklist" })).toEqual({ retorno: "/checklist" });
    expect(validar({ retorno: "https://outro-site.exemplo" })).toEqual({});
  });
});

describe("recuperação na tela de login", () => {
  it("abre pelo botão, preenche o e-mail e volta sem manter a senha digitada", () => {
    render(<Entrar />);
    fireEvent.change(screen.getByLabelText("Login ou e-mail"), { target: { value: "pessoa@exemplo.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-antiga" } });
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    expect(screen.getByText("Recuperar senha")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail cadastrado")).toHaveValue("pessoa@exemplo.com");
    expect(screen.queryByRole("button", { name: "Entrar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar para entrar" }));
    expect(screen.getByLabelText("Login ou e-mail")).toHaveValue("pessoa@exemplo.com");
    expect(screen.getByLabelText("Senha")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });
});
