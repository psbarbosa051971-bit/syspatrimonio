import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/login.functions", () => ({ entrarComLogin: vi.fn() }));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: {} } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
import { Route } from "@/routes/entrar";

// O mock de createFileRoute expõe as opções sem inicializar o roteador.
const Entrar = (Route as unknown as { component: () => ReactNode }).component;
afterEach(cleanup);

describe("recuperação na tela de login", () => {
  it("abre pelo botão, preenche o e-mail e volta sem manter a senha digitada", () => {
    render(<Entrar />);
    fireEvent.change(screen.getByLabelText("Login ou e-mail"), { target: { value: "pessoa@exemplo.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-antiga" } });
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    expect(screen.getByText("Recuperar senha")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail cadastrado")).toHaveValue("pessoa@exemplo.com");
    expect(screen.queryByRole("button", { name: "Entrar", exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar para entrar" }));
    expect(screen.getByLabelText("Login ou e-mail")).toHaveValue("pessoa@exemplo.com");
    expect(screen.getByLabelText("Senha")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Entrar", exact: true })).toBeInTheDocument();
  });
});
