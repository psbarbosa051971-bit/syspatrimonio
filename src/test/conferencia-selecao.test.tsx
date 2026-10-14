import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), erro: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.erro, success: vi.fn() } }));
vi.mock("@/lib/pdf-parse", () => ({ limparDescricao: (texto: string) => texto }));
vi.mock("@/components/ObservacoesBemDialog", () => ({ ObservacoesBemDialog: () => null }));
vi.mock("@/components/RelatoriosBens", () => ({ RelatoriosBens: () => null }));
vi.mock("@/hooks/use-role", () => ({ useRole: () => ({ podeEditar: true }) }));

import { Route } from "@/routes/_authenticated/conferencia";
const Page = Route.options.component as ComponentType;
const bem = (id: string, conferido = false) => ({
  id, codigo_red: id, descricao: `Bem ${id}`, valor: 10, conferido,
  sala_id: "sala", conferencia_finalizada: false,
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((tabela: string) => {
    const resultado = Promise.resolve({ error: null, data: tabela === "salas"
      ? [{ id: "sala", nome: "Sala A", responsavel: "Ana" }]
      : [bem("1"), bem("2")] });
    const consulta = { select: () => consulta, order: () => consulta,
      eq: () => consulta, range: () => resultado, then: resultado.then.bind(resultado) };
    return consulta;
  });
});

async function abrir() {
  render(<Page />);
  await screen.findByRole("checkbox", { name: "Bem 1 localizado" });
  return screen.getByRole("checkbox", { name: "Selecionar todos" }) as HTMLInputElement;
}

async function aguardarMarcacoes() {
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Selecionar todos" })).toBeEnabled());
}

describe("seleção na conferência de bens", () => {
  it("marca e desmarca todos os bens sem finalizar a conferência", async () => {
    const todos = await abrir();
    fireEvent.click(todos);
    await aguardarMarcacoes();
    expect(todos).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bem 1 localizado" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bem 2 localizado" })).toBeChecked();
    expect(mocks.rpc).toHaveBeenCalledWith("marcar_conferido", { _bem_id: "1", _valor: true });
    expect(mocks.rpc).toHaveBeenCalledWith("marcar_conferido", { _bem_id: "2", _valor: true });
    fireEvent.click(todos);
    await aguardarMarcacoes();
    expect(todos).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bem 1 localizado" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bem 2 localizado" })).not.toBeChecked();
    expect(mocks.rpc.mock.calls.every(([nome]) => nome === "marcar_conferido")).toBe(true);
  });

  it("mantém a seleção individual e indica seleção parcial", async () => {
    const todos = await abrir();
    fireEvent.click(screen.getByRole("checkbox", { name: "Bem 1 localizado" }));
    await aguardarMarcacoes();
    expect(todos.indeterminate).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Bem 2 localizado" })).not.toBeChecked();
    mocks.rpc.mockClear();
    fireEvent.click(todos);
    await aguardarMarcacoes();
    expect(todos).toBeChecked();
    expect(todos.indeterminate).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("marcar_conferido", { _bem_id: "2", _valor: true });
  });

  it("restaura apenas o bem que falhou e informa o erro", async () => {
    mocks.rpc.mockImplementation((_nome: string, args: { _bem_id: string }) =>
      args._bem_id === "2" ? Promise.reject(new Error("Falha")) : Promise.resolve({ error: null }));
    const todos = await abrir();
    fireEvent.click(todos);
    await aguardarMarcacoes();
    expect(screen.getByRole("checkbox", { name: "Bem 1 localizado" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bem 2 localizado" })).not.toBeChecked();
    expect(todos.indeterminate).toBe(true);
    expect(mocks.erro).toHaveBeenCalledWith(expect.stringContaining("1 bem(ns)"));
  });

  it("bloqueia alterações e salvamento enquanto as marcações estão sendo gravadas", async () => {
    let concluir!: (value: { error: null }) => void;
    mocks.rpc.mockReturnValue(new Promise((resolve) => { concluir = resolve; }));
    const todos = await abrir();
    fireEvent.click(todos);
    expect(todos).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Bem 1 localizado" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar conferência" })).toBeDisabled();
    concluir({ error: null });
    await aguardarMarcacoes();
  });
});
