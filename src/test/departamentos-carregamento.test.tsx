import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  navigate: vi.fn(),
  responsavel: vi.fn().mockResolvedValue(null),
  atualizarSala: vi.fn(),
  erroToast: vi.fn(),
  papel: { role: "admin", loading: false },
  falharUnidade: false,
  falharSalas: false,
  falharDepartamentos: false,
  salas: [] as { id: string; departamento_id: string; nome: string; endereco: string | null; unidade: string | null }[],
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
  Link: () => null,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.responsavel }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "admin" } }) }));
vi.mock("@/hooks/use-role", () => ({ useRole: () => mocks.papel }));
vi.mock("sonner", () => ({ toast: { error: mocks.erroToast, success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/usuarios.functions", () => ({ responsavelDoLocal: vi.fn() }));
vi.mock("@/lib/pdf-parse", () => ({ limparDescricao: (texto: string) => texto }));
vi.mock("@/components/ExcluirImportacoesDialog", () => ({ ExcluirImportacoesDialog: () => null }));
vi.mock("@/components/TermosResponsabilidadeDialog", () => ({ TermosResponsabilidadeDialog: () => null }));

import { Route } from "@/routes/_authenticated/departamentos";
const Page = Route.options.component as ComponentType;
const departamento = {
  id: "dep", diretor: "Diretor", departamento: "Patrimônio", almoxarifado: "Central",
  local: "", cpd: "", endereco: null,
};
const sala = { id: "sala", departamento_id: "dep", nome: "Sala existente", endereco: null, unidade: null };
const bem = {
  id: "bem", sala_id: "sala", codigo_red: "123", descricao: "Mesa cadastrada", valor: 10,
  incorporacao: "01/2025", tipo: "Mobiliário", observacao: "Conservação regular",
};
const outroBem = {
  id: "outro-bem", sala_id: "sala", codigo_red: "456", descricao: "Cadeira azul", valor: 25.5,
  incorporacao: "02/2024", tipo: "Assento", observacao: null,
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.papel = { role: "admin", loading: false };
  mocks.falharSalas = false;
  mocks.falharDepartamentos = false;
  mocks.falharUnidade = false;
  mocks.salas = [sala];
  mocks.from.mockImplementation((tabela: string) => {
    const falha = (tabela === "salas" && mocks.falharSalas)
      || (tabela === "departamentos" && mocks.falharDepartamentos);
    const resultado = falha
      ? { data: null, error: { message: "Falha de conexão" } }
      : { data: tabela === "departamentos" ? [departamento] : tabela === "salas" ? mocks.salas : [bem, outroBem], error: null };
    const consulta: Record<string, unknown> = {};
    let alteracao: { unidade: string } | null = null;
    let salaId = "";
    for (const metodo of ["select", "order", "in", "range"]) consulta[metodo] = () => consulta;
    consulta["update"] = (dados: { unidade: string }) => { alteracao = dados; return consulta; };
    consulta["eq"] = (coluna: string, valor: string) => {
      if (coluna === "id") salaId = valor;
      return consulta;
    };
    consulta["single"] = async () => {
      mocks.atualizarSala(alteracao, salaId);
      if (mocks.falharUnidade) return { data: null, error: { message: "Falha ao salvar" } };
      const local = mocks.salas.find((s) => s.id === salaId);
      const atualizado = local ? { ...local, ...alteracao } : null;
      if (atualizado) mocks.salas = mocks.salas.map((s) => s.id === salaId ? atualizado : s);
      return { data: atualizado, error: null };
    };
    consulta["then"] = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(resultado).then(resolve, reject);
    return consulta;
  });
});

describe("Carregamento dos registros em Departamentos", () => {
  it.each(["123", "mesa", "01/2025", "mobiliario", "10,00", "conservacao"])(
    "pesquisa bens pelo termo %s sem exigir acentos ou maiúsculas",
    async (termo) => {
      render(<Page />);
      await screen.findByText("Mesa cadastrada");
      fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar bens da sala" }), { target: { value: termo } });
      expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
      expect(screen.queryByText("Cadeira azul")).not.toBeInTheDocument();
      expect(screen.getByText("Quantidade de bens: 1 de 2")).toBeInTheDocument();
    },
  );

  it("seleciona apenas os resultados visíveis e limpa a seleção ao mudar a pesquisa", async () => {
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    const pesquisa = screen.getByRole("searchbox", { name: "Pesquisar bens da sala" });
    fireEvent.change(pesquisa, { target: { value: "cadeira" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
    expect(screen.getByRole("checkbox", { name: "Selecionar 456" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Excluir selecionados" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("1 selecionado(s)");
    fireEvent.change(pesquisa, { target: { value: "inexistente" } });
    expect(screen.getByText("Nenhum bem encontrado para esta pesquisa.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir selecionados" })).toBeDisabled();
    fireEvent.change(pesquisa, { target: { value: "" } });
    expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
    expect(screen.getByText("Cadeira azul")).toBeInTheDocument();
    expect(screen.getByText("Quantidade de bens: 2")).toBeInTheDocument();
  });

  it("mantém o cadastro recolhido e permite abrir e fechar sem perder a sala", async () => {
    render(<Page />);
    expect(await screen.findByText("Mesa cadastrada")).toBeInTheDocument();
    expect(screen.queryByText("Cadastro de Departamento")).not.toBeInTheDocument();
    const botao = screen.getByRole("button", { name: "Departamento", exact: true });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(botao);
    expect(screen.getByLabelText("Departamento")).toHaveValue("Patrimônio");
    expect(screen.getByLabelText("Local Físico")).toHaveValue("Sala existente");
    fireEvent.click(botao);
    expect(screen.queryByLabelText("Departamento")).not.toBeInTheDocument();
    expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
  });

  it("salva a unidade no local selecionado sem filtrar ou trocar a sala", async () => {
    mocks.salas = [
      sala,
      { ...sala, id: "central", nome: "Recepção", unidade: "CENTRAL" },
      { ...sala, id: "saude", nome: "Consultório", unidade: "SAÚDE" },
      { ...sala, id: "educacao", nome: "Escola municipal", unidade: "EDUCAÇÃO" },
    ];
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    const unidade = screen.getByRole("combobox", { name: "Unidade" });
    expect(unidade.parentElement?.previousElementSibling).toContainElement(screen.getByLabelText("Local Físico"));
    expect(unidade).toHaveValue("");
    expect(screen.queryByRole("option", { name: "Todas as unidades" })).not.toBeInTheDocument();
    for (const valor of ["CENTRAL", "SAÚDE", "EDUCAÇÃO"]) {
      fireEvent.change(unidade, { target: { value: valor } });
      await waitFor(() => expect(unidade).toHaveValue(valor));
      await waitFor(() => expect(unidade).toBeEnabled());
      expect(mocks.atualizarSala).toHaveBeenLastCalledWith({ unidade: valor }, "sala");
      expect(screen.getByRole("listbox", { name: "Salas" }).querySelectorAll('[role="option"]')).toHaveLength(4);
      expect(screen.getByText("Quantidade de salas listadas: 4")).toBeInTheDocument();
      expect(screen.getByLabelText("Local Físico")).toHaveValue("Sala existente");
    }
    fireEvent.click(screen.getByRole("button", { name: /^Consultório/ }));
    expect(unidade).toHaveValue("SAÚDE");
    fireEvent.click(screen.getByRole("button", { name: /^Sala existente/ }));
    expect(unidade).toHaveValue("EDUCAÇÃO");
    fireEvent.change(screen.getByPlaceholderText("Buscar sala ou endereço..."), { target: { value: "recep" } });
    expect(screen.getByText("Quantidade de salas listadas: 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Local Físico")).toHaveValue("Sala existente");
  });

  it("mantém a unidade anterior e informa quando o salvamento falha", async () => {
    mocks.salas = [{ ...sala, unidade: "SAÚDE" }];
    mocks.falharUnidade = true;
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    const unidade = screen.getByRole("combobox", { name: "Unidade" });
    fireEvent.change(unidade, { target: { value: "CENTRAL" } });
    await waitFor(() => expect(mocks.erroToast).toHaveBeenCalledWith("Não foi possível salvar a unidade do local. Tente novamente."));
    expect(unidade).toHaveValue("SAÚDE");
    expect(unidade).toBeEnabled();
    expect(screen.getByText("Quantidade de salas listadas: 1")).toBeInTheDocument();
  });

  it("aguarda a confirmação do acesso antes de consultar os departamentos", async () => {
    mocks.papel = { role: "admin", loading: true };
    const view = render(<Page />);
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.papel = { role: "admin", loading: false };
    view.rerender(<Page />);
    expect(await screen.findByText("Mesa cadastrada")).toBeInTheDocument();
  });

  it("mostra falha nas salas sem dizer que não há registros e permite tentar novamente", async () => {
    mocks.falharSalas = true;
    render(<Page />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as salas");
    expect(screen.queryByText("Nenhuma sala encontrada.")).not.toBeInTheDocument();
    mocks.falharSalas = false;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Mesa cadastrada")).toBeInTheDocument();
  });

  it("não oferece cadastro novo como solução para uma falha de carregamento", async () => {
    mocks.falharDepartamentos = true;
    render(<Page />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os departamentos");
    fireEvent.click(screen.getByRole("button", { name: "Departamento", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Novo" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Cadastrar departamento" })).toBeDisabled();
  });
});
