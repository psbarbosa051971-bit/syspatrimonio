import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  consultarImportacao: vi.fn(),
  navigate: vi.fn(),
  responsavel: vi.fn().mockResolvedValue(null),
  atualizarSala: vi.fn(),
  erroToast: vi.fn(),
  extrairHtml: vi.fn(),
  papel: { role: "admin", loading: false },
  falharUnidade: false,
  falharSalas: false,
  falharDepartamentos: false,
  bens: [] as Record<string, unknown>[],
  termos: [] as Record<string, unknown>[],
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
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: mocks.from,
  rpc: (funcao: string, args: unknown) => funcao === "consultar_bens_importacao"
    ? mocks.consultarImportacao(args) : mocks.rpc(funcao, args),
} }));
vi.mock("@/lib/usuarios.functions", () => ({ responsavelDoLocal: vi.fn() }));
vi.mock("@/lib/pdf-parse", () => ({
  limparDescricao: (texto: string) => texto,
  extrairTermoDePdf: mocks.extrairHtml,
}));
vi.mock("@/components/ExcluirImportacoesDialog", () => ({ ExcluirImportacoesDialog: () => null }));
vi.mock("@/components/TermosResponsabilidadeDialog", () => ({ TermosResponsabilidadeDialog: () => null }));

import { Route } from "@/routes/_authenticated/departamentos";
import { correspondePesquisaDinamica } from "@/lib/pesquisa-dinamica";
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
  mocks.consultarImportacao.mockResolvedValue({ data: [], error: null });
  mocks.papel = { role: "admin", loading: false };
  mocks.falharSalas = false;
  mocks.falharDepartamentos = false;
  mocks.falharUnidade = false;
  mocks.salas = [sala];
  mocks.bens = [bem, outroBem];
  mocks.termos = [];
  mocks.rpc.mockImplementation((_funcao: string, { _termo }: { _termo: string }) => ({
    range: async (inicio: number, fim: number) => {
      if (mocks.falharSalas) return { data: null, error: { message: "Falha de conexão" } };
      const data = mocks.bens.flatMap((item: Record<string, unknown>) => {
        const local = mocks.salas.find((s) => s.id === item["sala_id"]);
        if (!local || !correspondePesquisaDinamica({
          codigo_red: String(item["codigo_red"]), descricao: String(item["descricao"]), valor: Number(item["valor"]),
        }, _termo)) return [];
        return [{ bem: item, local_nome: local.nome }];
      }).slice(inicio, fim + 1);
      return { data, error: null };
    },
  }));
  mocks.from.mockImplementation((tabela: string) => {
    const falha = (tabela === "salas" && mocks.falharSalas)
      || (tabela === "departamentos" && mocks.falharDepartamentos);
    const resultado = falha
      ? { data: null, error: { message: "Falha de conexão" } }
      : { data: tabela === "departamentos" ? [departamento] : tabela === "salas" ? mocks.salas : tabela === "importacoes" ? mocks.termos : tabela === "entregas_termos" ? [] : mocks.bens, error: null };
    const consulta: Record<string, unknown> = {};
    let alteracao: { unidade: string } | null = null;
    let salaId = "";
    let filtroSala: string | null = null;
    let filtroDepartamento: string | null = null;
    let intervalo: [number, number] = [0, 499];
    for (const metodo of ["select", "order", "in", "not"]) consulta[metodo] = () => consulta;
    consulta["range"] = (inicio: number, fim: number) => { intervalo = [inicio, fim]; return consulta; };
    consulta["update"] = (dados: { unidade: string }) => { alteracao = dados; return consulta; };
    consulta["eq"] = (coluna: string, valor: string) => {
      if (coluna === "id") salaId = valor;
      if (coluna === "sala_id") filtroSala = valor;
      if (coluna === "departamento_id") filtroDepartamento = valor;
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
    consulta["then"] = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      let dados: Record<string, unknown>[] | null = resultado.data;
      if (dados && tabela === "bens" && filtroSala) dados = dados.filter((b) => b["sala_id"] === filtroSala);
      if (dados && tabela === "salas" && filtroDepartamento) dados = dados.filter((s) => s["departamento_id"] === filtroDepartamento);
      return Promise.resolve({ ...resultado, data: dados?.slice(intervalo[0], intervalo[1] + 1) ?? null }).then(resolve, reject);
    };
    return consulta;
  });
});

async function importarParaLiberarUnidade() {
  mocks.extrairHtml.mockResolvedValue({
    cabecalho: { local: "Sala existente", endereco: "", data: "", historico: "" },
    bens: [{ codigo_red: "123", descricao: "Mesa cadastrada", valor: 10 }],
  });
  mocks.rpc.mockResolvedValueOnce({
    data: { importacao_id: "importacao", termo_numero: "1/2026", novos: 0, repetidos: 1 }, error: null,
  });
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [new File(["%PDF-"], "termo.pdf", { type: "application/pdf" })] },
  });
  const dialogo = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialogo).getByRole("button", { name: "Sim" }));
  const numeracao = await screen.findByRole("alertdialog", { name: "Deseja gerar um número de termo?" });
  fireEvent.click(within(numeracao).getByRole("button", { name: "Sim" }));
  const pergunta = await screen.findByRole("alertdialog", { name: "Deseja imprimir o termo de Responsabilidade dessa importação?" });
  fireEvent.click(within(pergunta).getByRole("button", { name: "Cancelar" }));
  const unidade = screen.getByRole("combobox", { name: "Unidade" });
  await waitFor(() => expect(unidade).toBeEnabled());
  await waitFor(() => expect(unidade).toHaveFocus());
  expect(screen.queryByText("Selecione a Unidade", { selector: "p" })).toBeNull();
}

describe("Carregamento dos registros em Departamentos", () => {
  it("aceita somente PDF e rejeita HTML antes de ler ou gravar dados", async () => {
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    const input = screen.getByLabelText("Arquivo PDF do Sonner");
    expect(input).toHaveAttribute("accept", ".pdf,application/pdf");
    expect(screen.queryByRole("button", { name: "Importar HTML do Sonner" })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File(["<html></html>"], "termo.html", { type: "text/html" })] } });
    expect(mocks.erroToast).toHaveBeenCalledWith("Selecione somente um arquivo PDF.");
    expect(mocks.extrairHtml).not.toHaveBeenCalled();
    expect(mocks.consultarImportacao).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("envia vários locais separados em uma única importação após todas as confirmações", async () => {
    const locais = [
      { cabecalho: { local: "58195 Escola A", endereco: "Rua A", data: "", historico: "" },
        bens: [{ codigo_red: "100001", descricao: "Mesa A", valor: 10 }] },
      { cabecalho: { local: "58196 Escola B", endereco: "Rua B", data: "", historico: "" },
        bens: [{ codigo_red: "100002", descricao: "Mesa B", valor: 20 }] },
    ];
    mocks.extrairHtml.mockResolvedValue({ ...locais[0], bens: locais.flatMap((l) => l.bens), locais });
    mocks.rpc.mockResolvedValue({ data: locais.map((l, i) => ({
      sala: { ...sala, id: `nova-${i}`, nome: l.cabecalho.local, endereco: l.cabecalho.endereco },
      importacao_id: null, novos: 1, transferidos: 0,
    })), error: null });
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["%PDF-"], "locais.pdf", { type: "application/pdf" })] },
    });
    const primeira = await screen.findByRole("alertdialog", { name: /1\/2 — 58195 Escola A/ });
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(within(primeira).getByRole("button", { name: "Sim" }));
    const segunda = await screen.findByRole("alertdialog", { name: /2\/2 — 58196 Escola B/ });
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(within(segunda).getByRole("button", { name: "Sim" }));
    const numeracao = await screen.findByRole("alertdialog", { name: "Deseja gerar um número de termo?" });
    fireEvent.click(within(numeracao).getByRole("button", { name: "Não" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("importar_bens_html_multiplos_locais", {
      _departamento_id: "dep", _arquivo: "locais.pdf", _gerar_termo: false,
      _locais: locais.map((l) => ({ ...l, sala_id: null, existentes: [] })),
    }));
    expect(mocks.atualizarSala).not.toHaveBeenCalled();
  });

  it("cancelar a confirmação de qualquer local não grava nenhum deles", async () => {
    const locais = ["58195 Escola A", "58196 Escola B"].map((local, i) => ({
      cabecalho: { local, endereco: "", data: "", historico: "" },
      bens: [{ codigo_red: `10000${i}`, descricao: "Mesa", valor: 10 }],
    }));
    mocks.extrairHtml.mockResolvedValue({ ...locais[0], bens: locais.flatMap((l) => l.bens), locais });
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["%PDF-"], "locais.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(within(await screen.findByRole("alertdialog", { name: /1\/2 —/ })).getByRole("button", { name: "Sim" }));
    fireEvent.click(within(await screen.findByRole("alertdialog", { name: /2\/2 —/ })).getByRole("button", { name: "Não" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.atualizarSala).not.toHaveBeenCalled();
  });

  it("reúne as ações acima dos painéis e reserva mais espaço para os termos", async () => {
    const { container } = render(<Page />);
    await screen.findByText("Mesa cadastrada");
    const acoes = screen.getByRole("region", { name: "Ações da sala" });
    const botoes = within(acoes).getAllByRole("button");
    expect(botoes.slice(0, 6).map((botao) => botao.textContent?.trim())).toEqual([
      "Anexar PDF do Sonner", "Importar por fornecedor", "Gerar transferência",
      "Estornar transferência", "Termo de Responsabilidade", "Imprimir termo de Responsabilidade",
    ]);
    const compartilhar = within(acoes).getByRole("button", { name: "Compartilhar Relatório" });
    expect(compartilhar.nextElementSibling).toBe(
      within(acoes).getByRole("button", { name: "Excluir sala vazia" }),
    );
    const painelBens = container.querySelector("#bens-da-sala");
    expect(acoes.nextElementSibling).toBe(painelBens);
    expect(painelBens).toContainElement(screen.getByRole("combobox", { name: "Ano de incorporação" }));
    expect(painelBens?.querySelector('[class~="h-[234px]"]')).toBeInTheDocument();
    expect(container.querySelector("main")).toHaveClass("lg:grid-cols-[minmax(0,1fr)_360px]", "items-stretch");
    expect(container.querySelector('[class~="max-h-[416px]"]')).toBeInTheDocument();
    expect(screen.queryByText(/Clique no número do termo para mostrar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vermelho: Aguardando Entrega/)).not.toBeInTheDocument();
  });

  it("oculta termos sem bens na sala mesmo com bens no documento salvo", async () => {
    mocks.termos = [
      { id: "termo-vazio", numero: 34, termo_ano: 2026, created_at: "2026-10-17T12:00:00Z", arquivo: "termo34.html",
        termo_snapshot: { local: "Sala existente", bens: [
          { codigo_red: "123", descricao: "Mesa cadastrada", valor: 10 },
          { codigo_red: "456", descricao: "Cadeira azul", valor: 20 },
        ] } },
      { id: "termo-atual", numero: 49, termo_ano: 2026, created_at: "2026-10-18T12:00:00Z", arquivo: "termo49.html",
        termo_snapshot: { local: "Sala existente", bens: [{ codigo_red: "123", descricao: "Mesa cadastrada", valor: 10 }] } },
    ];
    mocks.bens = [{ ...bem, importacao_id: "termo-atual" }];
    render(<Page />);
    await screen.findByRole("button", { name: "Mostrar bens do termo 49/2026" });
    expect(screen.queryByRole("button", { name: "Mostrar bens do termo 34/2026" })).not.toBeInTheDocument();
    expect(screen.getByText("Quantidade de termos").parentElement).toHaveTextContent("1");
  });

  it("mostra os bens do termo clicado e permite voltar à sala inteira", async () => {
    mocks.termos = [{
      id: "termo-1", numero: 29, termo_ano: 2026, created_at: "2026-10-17T12:00:00Z", arquivo: "termo.html",
      termo_snapshot: { local: "Sala existente", bens: [{ codigo_red: "123", descricao: "Mesa cadastrada", valor: 10 }] },
    }];
    mocks.bens = [{ ...bem, importacao_id: "termo-1" }, { ...outroBem, importacao_id: null }];
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    expect(screen.getByRole("button", { name: "Compartilhar Relatório" })).toBeEnabled();
    fireEvent.click(await screen.findByRole("button", { name: "Mostrar bens do termo 29/2026" }));
    expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
    expect(screen.queryByText("Cadeira azul")).not.toBeInTheDocument();
    expect(screen.getByText("Termo 29/2026 — 1 bem(ns) ainda nesta sala.")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Mostrar todos os bens da sala" })[0]!);
    expect(screen.getByText("Cadeira azul")).toBeInTheDocument();
  });

  it("direciona o ícone da sala para gerenciar seus usuários em vez de abrir os registros", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Gerenciar usuários de Sala existente" }));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/usuarios", search: { salaId: "sala" } });
    expect(screen.queryByText("Registros — Sala existente")).not.toBeInTheDocument();
  });

  it("mantém o gerenciamento de usuários restrito ao administrador", async () => {
    mocks.papel = { role: "operador", loading: false };
    render(<Page />);
    expect(await screen.findByRole("button", { name: "Gerenciar usuários de Sala existente" })).toBeDisabled();
  });

  it("exibe o cabeçalho dos bens como o modelo e preserva as seleções em lote acima da tabela", async () => {
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    const cabecalho = screen.getByRole("columnheader", { name: "SEL." }).closest("thead")!;
    expect(within(cabecalho).getAllByRole("columnheader").map((coluna) => coluna.textContent)).toEqual([
      "SEL.", "TRAN", "PATRIMÔNIO", "DESCRIÇÃO DO BEM", "INCORPORAÇÃO", "TIPO", "STATUS", "VALOR", "",
    ]);
    expect(cabecalho).toHaveClass("bg-room-assets-header", "[&_th]:text-[10px]");
    expect(cabecalho.closest("table")).toHaveClass("text-xs", "[&_td]:text-xs");
    expect(within(cabecalho).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo termo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
    expect(screen.getByRole("button", { name: "Novo termo" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Selecionar 123" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Selecionar 456" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Excluir selecionados" })).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos para transferência" }));
    expect(screen.getByLabelText("Códigos RED para transferência (2 bens)")).toHaveValue("123, 456, ");
  });

  it("libera Novo termo ao marcar um item em SEL. e usa somente o item selecionado", async () => {
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar 456" }));
    const botao = screen.getByRole("button", { name: "Novo termo" });
    expect(botao).toBeEnabled();
    fireEvent.click(botao);
    const dialogo = await screen.findByRole("dialog", { name: "Novo termo de responsabilidade" });
    expect(within(dialogo).getByText("Cadeira azul")).toBeInTheDocument();
    expect(within(dialogo).queryByText("Mesa cadastrada")).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Criar termo" })).toBeEnabled();
  });

  it("libera Novo termo na pesquisa dinâmica e consulta a sala dos bens selecionados", async () => {
    mocks.salas = [sala, { ...sala, id: "outra-sala", departamento_id: "outro-dep", nome: "Arquivo central" }];
    mocks.bens = [bem, {
      ...outroBem, id: "bem-distante", sala_id: "outra-sala", codigo_red: "987654", descricao: "Módulo de aço",
    }];
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.change(screen.getByRole("searchbox", { name: "PESQUISA DINÂMICA" }), { target: { value: "987654" } });
    fireEvent.click(screen.getByRole("button", { name: "Localizar" }));
    await screen.findByText("Módulo de aço");
    expect(screen.getByRole("button", { name: "Novo termo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar 987654" }));
    const botao = screen.getByRole("button", { name: "Novo termo" });
    expect(botao).toBeEnabled();
    fireEvent.click(botao);
    const dialogo = await screen.findByRole("dialog", { name: "Novo termo de responsabilidade" });
    expect(within(dialogo).getByText("Local Físico: Arquivo central")).toBeInTheDocument();
    expect(within(dialogo).getByText("Módulo de aço")).toBeInTheDocument();
    expect(within(dialogo).queryByText("Mesa cadastrada")).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Criar termo" })).toBeEnabled();
  });

  it("orienta a selecionar o mesmo local quando SEL. contém bens de salas diferentes", async () => {
    mocks.salas = [sala, { ...sala, id: "outra-sala", departamento_id: "outro-dep", nome: "Arquivo central" }];
    mocks.bens = [bem, { ...outroBem, sala_id: "outra-sala", descricao: "Mesa antiga" }];
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.change(screen.getByRole("searchbox", { name: "PESQUISA DINÂMICA" }), { target: { value: "mesa" } });
    fireEvent.click(screen.getByRole("button", { name: "Localizar" }));
    await screen.findByText("Mesa antiga");
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
    fireEvent.click(screen.getByRole("button", { name: "Novo termo" }));
    expect(mocks.erroToast).toHaveBeenCalledWith(expect.stringContaining("selecione apenas bens do mesmo Local Físico"));
    expect(screen.queryByRole("dialog", { name: "Novo termo de responsabilidade" })).not.toBeInTheDocument();
  });

  it.each([
    ["PATRIMÔNIO", ["2", "10"]],
    ["DESCRIÇÃO DO BEM", ["2", "10"]],
    ["INCORPORAÇÃO", ["2", "10"]],
    ["TIPO", ["2", "10"]],
    ["STATUS", ["10", "2"]],
  ] as const)("classifica %s nos dois sentidos sem perder seleções", async (campo, esperados) => {
    mocks.bens = [
      { ...bem, codigo_red: "10", conferido: true },
      { ...outroBem, codigo_red: "2", conferido: false },
    ];
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar 10" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Copiar RED 10 para transferência" }));
    const cabecalho = screen.getByRole("columnheader", { name: new RegExp(campo) });
    const tabela = cabecalho.closest("table")!;
    const codigos = () => within(tabela).getAllByRole("row").slice(1).map((linha) =>
      within(linha).getByRole("checkbox", { name: /^Selecionar / }).getAttribute("aria-label")?.replace("Selecionar ", ""));
    if (campo !== "PATRIMÔNIO") {
      fireEvent.click(screen.getByRole("button", { name: `Classificar ${campo} em ordem crescente` }));
    }
    expect(cabecalho).toHaveAttribute("aria-sort", "ascending");
    expect(codigos()).toEqual(esperados);
    fireEvent.click(screen.getByRole("button", { name: `Classificar ${campo} em ordem decrescente` }));
    expect(cabecalho).toHaveAttribute("aria-sort", "descending");
    expect(codigos()).toEqual([...esperados].reverse());
    fireEvent.click(screen.getByRole("button", { name: `Classificar ${campo} em ordem crescente` }));
    expect(codigos()).toEqual(esperados);
    expect(screen.getByRole("checkbox", { name: "Selecionar 10" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Copiar RED 10 para transferência" })).toBeChecked();
    expect(screen.getByText("Quantidade de bens: 2")).toBeInTheDocument();
  });

  it("mantém a pesquisa ao classificar os bens", async () => {
    mocks.bens = [bem, outroBem, { ...outroBem, id: "terceiro", codigo_red: "789", descricao: "Mesa antiga" }];
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar bens da sala" }), { target: { value: "Mesa" } });
    fireEvent.click(screen.getByRole("button", { name: "Classificar DESCRIÇÃO DO BEM em ordem crescente" }));
    expect(screen.queryByText("Cadeira azul")).not.toBeInTheDocument();
    expect(screen.getByText("Mesa antiga")).toBeInTheDocument();
    expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
  });

  it("separa seleção de exclusão da transferência e preenche os códigos mascarados no formulário", async () => {
    mocks.bens = [{ ...bem, codigo_red: "60651" }, { ...outroBem, codigo_red: "60785" }];
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    expect(screen.getByRole("button", { name: "60.651" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Copiar RED 60.651 para transferência" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Copiar RED 60.785 para transferência" }));
    expect(screen.getByLabelText("Códigos RED para transferência (2 bens)")).toHaveValue("60.651, 60.785, ");
    expect(screen.getByRole("checkbox", { name: "Selecionar 60651" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Excluir selecionados" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Copiar RED 60.651 para transferência" }));
    expect(screen.getByLabelText("Códigos RED para transferência (1 bens)")).toHaveValue("60.785, ");
    fireEvent.click(screen.getByRole("button", { name: "Gerar transferência" }));
    expect(await screen.findByLabelText("Códigos RED separados por vírgulas")).toHaveValue("60.785, ");
    expect(screen.getByRole("button", { name: "Filtrar" })).toBeDisabled();
  });

  it("exibe a pesquisa dinâmica no cabeçalho ao lado do nome do sistema", async () => {
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    const cabecalho = screen.getByRole("banner");
    expect(within(cabecalho).getByText("SysPatrimônio")).toBeInTheDocument();
    expect(within(cabecalho).getByRole("searchbox", { name: "PESQUISA DINÂMICA" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).queryByRole("searchbox", { name: "PESQUISA DINÂMICA" })).not.toBeInTheDocument();
  });

  it.each(["Sim", "Não"])("aguarda a confirmação personalizada da importação PDF e respeita %s", async (resposta) => {
    const nomeLocal = "142 TRANSPORTE DA SAÚDE";
    mocks.salas = [{ ...sala, nome: nomeLocal }];
    const extraidos = Array.from({ length: 105 }, (_, i) => ({ codigo_red: String(i), descricao: "Mesa", valor: 10 }));
    mocks.extrairHtml.mockResolvedValue({
      cabecalho: { local: nomeLocal, endereco: "", data: "", historico: "" },
      bens: extraidos,
    });
    const { container } = render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["%PDF-"], "termo.pdf", { type: "application/pdf" })] },
    });
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveAccessibleName(`LOCAL IMPORTADO: ${nomeLocal}`);
    expect(within(dialogo).getByText("105 BEM(NS) SERÃO IMPORTADOS!")).toBeInTheDocument();
    expect(within(dialogo).getByText("DESEJA CONTINUAR? (Os Bens que já existem na sala não serão duplicados)")).toBeInTheDocument();
    expect(mocks.atualizarSala).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    if (resposta === "Sim") {
      mocks.rpc.mockResolvedValueOnce({
        data: { importacao_id: "importacao", termo_numero: "1/2026", novos: 105, repetidos: 0 }, error: null,
      });
    }
    fireEvent.click(within(dialogo).getByRole("button", { name: resposta }));
    if (resposta === "Sim") {
      const numeracao = await screen.findByRole("alertdialog", { name: "Deseja gerar um número de termo?" });
      expect(mocks.atualizarSala).not.toHaveBeenCalled();
      fireEvent.click(within(numeracao).getByRole("button", { name: "Sim" }));
      const pergunta = await screen.findByRole("alertdialog", { name: "Deseja imprimir o termo de Responsabilidade dessa importação?" });
      fireEvent.click(within(pergunta).getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("dialog", { name: "Dados do recebimento" })).not.toBeInTheDocument();
    }
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Anexar PDF do Sonner" })).toBeEnabled());
    if (resposta === "Sim") {
      expect(mocks.rpc).toHaveBeenCalledWith("importar_bens_html_com_opcao", expect.objectContaining({
        _sala_id: "sala", _arquivo: "termo.pdf", _bens: extraidos, _existentes: [], _gerar_termo: true,
      }));
      const unidade = screen.getByRole("combobox", { name: "Unidade" });
      expect(unidade).toBeEnabled();
      await waitFor(() => expect(unidade).toHaveFocus());
      expect(screen.queryByText("Selecione a Unidade", { selector: "p" })).toBeNull();
    } else {
      expect(mocks.atualizarSala).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(screen.getByRole("combobox", { name: "Unidade" })).toBeDisabled();
      expect(screen.queryByText("Selecione a Unidade", { selector: "p" })).not.toBeInTheDocument();
    }
  });

  it.each(["OK", "Cancelar"])("avisa sobre RED em outras salas antes de importar e respeita %s", async (resposta) => {
    const existentes = [
      { id: "bem-origem", sala_id: "outra-sala", codigo_red: "60.651", sala_nome: "58195 - Arquivo central" },
      { id: "bem-origem-2", sala_id: "outra-sala-2", codigo_red: "60785", sala_nome: "Saúde - Depósito" },
    ];
    const extraidos = [
      { codigo_red: "60651", descricao: "Mesa", valor: 10 },
      { codigo_red: "60785", descricao: "Cadeira", valor: 20 },
    ];
    mocks.consultarImportacao.mockResolvedValue({ data: existentes, error: null });
    mocks.extrairHtml.mockResolvedValue({
      cabecalho: { local: sala.nome, endereco: "", data: "", historico: "" }, bens: extraidos,
    });
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["%PDF-"], "termo.pdf", { type: "application/pdf" })] },
    });
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("ATENÇÃO: os bens abaixo já existem em outra sala.")).toBeInTheDocument();
    expect(within(dialogo).getByText("RED 60.651 — 58195 - Arquivo central")).toBeInTheDocument();
    expect(within(dialogo).getByText("RED 60.785 — Saúde - Depósito")).toBeInTheDocument();
    expect(mocks.atualizarSala).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    if (resposta === "OK") {
      mocks.rpc.mockResolvedValueOnce({
        data: { importacao_id: "importacao", termo_numero: "1/2026", novos: 0, repetidos: 2, transferidos: 2 }, error: null,
      });
    }
    fireEvent.click(within(dialogo).getByRole("button", { name: resposta }));
    if (resposta === "OK") {
      const numeracao = await screen.findByRole("alertdialog", { name: "Deseja gerar um número de termo?" });
      fireEvent.click(within(numeracao).getByRole("button", { name: "Sim" }));
      const pergunta = await screen.findByRole("alertdialog", { name: "Deseja imprimir o termo de Responsabilidade dessa importação?" });
      fireEvent.click(within(pergunta).getByRole("button", { name: "Cancelar" }));
    }
    await waitFor(() => expect(screen.getByRole("button", { name: "Anexar PDF do Sonner" })).toBeEnabled());
    if (resposta === "OK") {
      expect(mocks.rpc).toHaveBeenCalledWith("importar_bens_html_com_opcao", expect.objectContaining({
        _sala_id: "sala", _bens: extraidos, _existentes: existentes, _gerar_termo: true,
      }));
    } else {
      expect(mocks.atualizarSala).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  });

  it.each(["Não", "Cancelar"])("respeita %s na escolha de gerar número de termo", async (resposta) => {
    const extraidos = [{ codigo_red: "123", descricao: "Mesa cadastrada", valor: 10 }];
    mocks.extrairHtml.mockResolvedValue({
      cabecalho: { local: sala.nome, endereco: "", data: "", historico: "" }, bens: extraidos,
    });
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["%PDF-"], "termo.pdf", { type: "application/pdf" })] },
    });
    const confirmacao = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirmacao).getByRole("button", { name: "Sim" }));
    const numeracao = await screen.findByRole("alertdialog", { name: "Deseja gerar um número de termo?" });
    expect(mocks.atualizarSala).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    if (resposta === "Não") {
      mocks.rpc.mockResolvedValueOnce({
        data: { importacao_id: null, numero: null, termo_numero: null, novos: 0, repetidos: 1, transferidos: 0 }, error: null,
      });
    }
    fireEvent.click(within(numeracao).getByRole("button", { name: resposta }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Anexar PDF do Sonner" })).toBeEnabled());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Dados do recebimento" })).not.toBeInTheDocument();
    if (resposta === "Não") {
      expect(mocks.rpc).toHaveBeenCalledWith("importar_bens_html_com_opcao", expect.objectContaining({
        _sala_id: "sala", _arquivo: "termo.pdf", _bens: extraidos, _existentes: [], _gerar_termo: false,
      }));
      expect(mocks.atualizarSala).toHaveBeenCalled();
      expect(screen.getByRole("combobox", { name: "Unidade" })).toBeEnabled();
    } else {
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.atualizarSala).not.toHaveBeenCalled();
    }
    expect(mocks.erroToast).not.toHaveBeenCalled();
  });

  it("interrompe a importação se não conseguir consultar códigos existentes", async () => {
    mocks.consultarImportacao.mockResolvedValue({ data: null, error: { message: "Falha ao verificar os códigos RED" } });
    mocks.extrairHtml.mockResolvedValue({
      cabecalho: { local: sala.nome, endereco: "", data: "", historico: "" },
      bens: [{ codigo_red: "123", descricao: "Mesa", valor: 10 }],
    });
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["%PDF-"], "termo.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(mocks.erroToast).toHaveBeenCalledWith("Falha ao verificar os códigos RED"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.atualizarSala).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["987", "dulo de a", "1250,75", "1.250,75"])(
    "pesquisa em outros departamentos por %s e restaura a sala com o mesmo botão",
    async (termo) => {
      mocks.salas = [sala, { ...sala, id: "outra-sala", departamento_id: "outro-dep", nome: "Arquivo central" }];
      mocks.bens = [bem, outroBem, {
        ...bem, id: "bem-distante", sala_id: "outra-sala", codigo_red: "987654",
        descricao: "Módulo de aço", valor: 1250.75,
      }];
      render(<Page />);
      await screen.findByText("Mesa cadastrada");
      expect(screen.queryByText("Módulo de aço")).not.toBeInTheDocument();
      const campo = screen.getByRole("searchbox", { name: "PESQUISA DINÂMICA" });
      fireEvent.change(campo, { target: { value: termo } });
      expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Localizar" }));
      expect(await screen.findByText("Módulo de aço")).toBeInTheDocument();
      expect(screen.getByText("Local Físico: Arquivo central")).toBeInTheDocument();
      expect(screen.queryByText("Mesa cadastrada")).not.toBeInTheDocument();
      expect(screen.getByText("Quantidade de bens: 1")).toBeInTheDocument();
      expect(campo).toBeDisabled();
      expect(campo).toHaveValue("");
      expect(campo).toHaveAttribute("autocomplete", "off");
      expect(campo.closest("form")).toHaveAttribute("autocomplete", "off");
      expect(screen.getByText("Bens da sala — Sala existente")).toBeInTheDocument();
      expect(screen.queryByText(/Preenchido manualmente ou pela leitura do HTML/)).not.toBeInTheDocument();
      const atualizar = screen.getByRole("button", { name: "Atualizar" });
      const imprimir = screen.getByRole("button", { name: "Imprimir resultado em A4" });
      expect(atualizar.nextElementSibling).toBe(imprimir);
      const documento = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
      const abrirJanela = vi.spyOn(window, "open").mockReturnValue({ document: documento, opener: null } as unknown as Window);
      fireEvent.click(imprimir);
      expect(abrirJanela).toHaveBeenCalledWith("", "_blank");
      expect(documento.write).toHaveBeenCalledWith(expect.stringContaining("size: A4 landscape"));
      const html = documento.write.mock.calls[0][0] as string;
      expect(html).toContain("Módulo de aço");
      expect(html).toContain("Arquivo central");
      expect(html).not.toContain("Mesa cadastrada");
      abrirJanela.mockRestore();
      fireEvent.click(atualizar);
      expect(await screen.findByText("Mesa cadastrada")).toBeInTheDocument();
      expect(screen.queryByText("Módulo de aço")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Imprimir resultado em A4" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Local Físico")).toHaveValue("Sala existente");
      expect(campo).toHaveValue("");
      expect(campo).toBeEnabled();
      expect(screen.getByRole("button", { name: "Localizar" })).toBeDisabled();
    },
  );

  it("mostra pesquisa sem resultados e permite voltar pelo botão Atualizar", async () => {
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    fireEvent.change(screen.getByRole("searchbox", { name: "PESQUISA DINÂMICA" }), { target: { value: "inexistente" } });
    fireEvent.click(screen.getByRole("button", { name: "Localizar" }));
    expect(await screen.findByText("Nenhum bem encontrado para esta pesquisa em todas as salas.")).toBeInTheDocument();
    expect(screen.getByText("Quantidade de bens: 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imprimir resultado em A4" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(await screen.findByText("Mesa cadastrada")).toBeInTheDocument();
  });

  it("preserva os bens da sala se a pesquisa em todas as salas falhar", async () => {
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    mocks.falharSalas = true;
    fireEvent.change(screen.getByRole("searchbox", { name: "PESQUISA DINÂMICA" }), { target: { value: "mesa" } });
    fireEvent.click(screen.getByRole("button", { name: "Localizar" }));
    await waitFor(() => expect(mocks.erroToast).toHaveBeenCalledWith("Não foi possível realizar a pesquisa em todas as salas. Tente novamente."));
    expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "PESQUISA DINÂMICA" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Localizar" })).toBeDisabled();
  });

  it.each(["admin", "operador"])(
    "mostra status em vermelho ou azul sem substituir o tipo importado para %s",
    async (role) => {
      mocks.papel = { role, loading: false };
      mocks.bens = [
        { ...bem, tipo: "Aquisição", conferido: false, conferencia_finalizada: true },
        { ...outroBem, tipo: "Aquisição", conferido: true, conferencia_finalizada: true },
        { ...bem, id: "pendente", codigo_red: "789", descricao: "Armário a conferir", tipo: "Aquisição", conferido: false, conferencia_finalizada: false },
      ];
      render(<Page />);
      const descricao = await screen.findByText("Mesa cadastrada");
      const linhaNaoLocalizada = descricao.closest("tr")!;
      expect(linhaNaoLocalizada).toHaveClass("bem-nao-localizado");
      expect(within(linhaNaoLocalizada).getByText("NÃO LOCALIZADO")).toBeInTheDocument();
      expect(within(linhaNaoLocalizada).getByText("Aquisição")).toBeInTheDocument();
      const linhaLocalizada = screen.getByText("Cadeira azul").closest("tr")!;
      expect(linhaLocalizada).toHaveClass("bem-localizado");
      expect(within(linhaLocalizada).getByText("LOCALIZADO")).toBeInTheDocument();
      expect(within(linhaLocalizada).getByText("Aquisição")).toBeInTheDocument();
      const linhaPendente = screen.getByText("Armário a conferir").closest("tr")!;
      expect(linhaPendente).toHaveClass("bem-nao-localizado");
      expect(within(linhaPendente).getByText("NÃO LOCALIZADO")).toBeInTheDocument();
      expect(within(linhaPendente).getByText("Aquisição")).toBeInTheDocument();
      fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar bens da sala" }), {
        target: { value: "nao localizado" },
      });
      expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
      expect(screen.queryByText("Cadeira azul")).not.toBeInTheDocument();
      expect(screen.getByText("Armário a conferir")).toBeInTheDocument();
      expect(screen.getByText("Quantidade de bens: 2 de 3")).toBeInTheDocument();
    },
  );

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

  it("filtra pelo ano de incorporação, combina com a pesquisa e restaura todos os anos", async () => {
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    const ano = screen.getByRole("combobox", { name: "Ano de incorporação" });
    expect(within(ano).getAllByRole("option").map((opcao) => opcao.textContent))
      .toEqual(["Todos os anos", "2025", "2024"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
    fireEvent.change(ano, { target: { value: "2025" } });
    expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
    expect(screen.queryByText("Cadeira azul")).not.toBeInTheDocument();
    expect(screen.getByText("Quantidade de bens: 1 de 2")).toBeInTheDocument();
    expect(screen.getByText("Total filtrado: R$ 10,00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir selecionados" })).toBeDisabled();
    const pesquisa = screen.getByRole("searchbox", { name: "Pesquisar bens da sala" });
    fireEvent.change(pesquisa, { target: { value: "cadeira" } });
    expect(screen.getByText("Nenhum bem encontrado para esta pesquisa.")).toBeInTheDocument();
    fireEvent.change(pesquisa, { target: { value: "" } });
    fireEvent.change(ano, { target: { value: "2024" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
    expect(screen.getByRole("checkbox", { name: "Selecionar 456" })).toBeChecked();
    expect(screen.queryByText("Mesa cadastrada")).not.toBeInTheDocument();
    fireEvent.change(ano, { target: { value: "" } });
    expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
    expect(screen.getByText("Cadeira azul")).toBeInTheDocument();
    expect(screen.getByText("Quantidade de bens: 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir selecionados" })).toBeDisabled();
  });

  it("reconhece o ano em datas brasileiras e ISO sem incluir bens sem data no filtro", async () => {
    mocks.bens = [
      { ...bem, incorporacao: "15/03/2025" },
      { ...outroBem, incorporacao: "2025-09-20" },
      { ...bem, id: "sem-data", codigo_red: "789", descricao: "Armário sem data", incorporacao: null },
    ];
    render(<Page />);
    await screen.findByText("Armário sem data");
    const ano = screen.getByRole("combobox", { name: "Ano de incorporação" });
    expect(within(ano).getAllByRole("option")).toHaveLength(2);
    fireEvent.change(ano, { target: { value: "2025" } });
    expect(screen.getByText("Mesa cadastrada")).toBeInTheDocument();
    expect(screen.getByText("Cadeira azul")).toBeInTheDocument();
    expect(screen.queryByText("Armário sem data")).not.toBeInTheDocument();
    expect(screen.getByText("Quantidade de bens: 2 de 3")).toBeInTheDocument();
  });

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
    const botao = screen.getByRole("button", { name: "Departamento" });
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
    expect(unidade.parentElement?.parentElement?.previousElementSibling).toContainElement(screen.getByLabelText("Local Físico"));
    expect(unidade).toHaveValue("");
    expect(unidade).toBeDisabled();
    expect(screen.queryByText("Selecione a Unidade", { selector: "p" })).not.toBeInTheDocument();
    fireEvent.change(unidade, { target: { value: "CENTRAL" } });
    expect(mocks.atualizarSala).not.toHaveBeenCalled();
    expect(within(unidade).queryByRole("option", { name: "Todas as unidades" })).not.toBeInTheDocument();
    await importarParaLiberarUnidade();
    mocks.atualizarSala.mockClear();
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
    expect(unidade).toBeDisabled();
    expect(screen.queryByText("Selecione a Unidade", { selector: "p" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Sala existente/ }));
    expect(unidade).toHaveValue("EDUCAÇÃO");
    expect(unidade).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Buscar sala ou endereço..."), { target: { value: "recep" } });
    expect(screen.getByText("Quantidade de salas listadas: 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Local Físico")).toHaveValue("Sala existente");
  });

  it("filtra a lista pela unidade sem alterar o cadastro e combina com a busca", async () => {
    mocks.salas = [
      sala,
      { ...sala, id: "central", nome: "Recepção", unidade: "CENTRAL" },
      { ...sala, id: "saude", nome: "Consultório", unidade: "SAÚDE" },
      { ...sala, id: "educacao", nome: "Escola municipal", endereco: "Rua das Flores", unidade: "EDUCAÇÃO" },
    ];
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    const filtro = screen.getByRole("combobox", { name: "Filtrar por unidade" });
    const lista = within(screen.getByRole("listbox", { name: "Salas" }));
    expect(filtro).toHaveValue("");
    expect(lista.getAllByRole("option")).toHaveLength(4);
    for (const [valor, nome] of [["CENTRAL", "Recepção"], ["SAÚDE", "Consultório"], ["EDUCAÇÃO", "Escola municipal"]]) {
      fireEvent.change(filtro, { target: { value: valor } });
      expect(lista.getAllByRole("option")).toHaveLength(1);
      expect(lista.getByRole("button", { name: new RegExp(`^${nome}`) })).toBeInTheDocument();
      expect(screen.getByText("Quantidade de salas listadas: 1")).toBeInTheDocument();
    }
    const pesquisa = screen.getByPlaceholderText("Buscar sala ou endereço...");
    fireEvent.change(pesquisa, { target: { value: "Flores" } });
    expect(lista.getAllByRole("option")).toHaveLength(1);
    fireEvent.change(pesquisa, { target: { value: "Recepção" } });
    expect(lista.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Nenhuma sala encontrada.")).toBeInTheDocument();
    expect(screen.getByText("Quantidade de salas listadas: 0")).toBeInTheDocument();
    fireEvent.change(pesquisa, { target: { value: "" } });
    fireEvent.change(filtro, { target: { value: "" } });
    expect(lista.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByLabelText("Local Físico")).toHaveValue("Sala existente");
    expect(screen.getByRole("combobox", { name: "Unidade" })).toHaveValue("");
    expect(mocks.atualizarSala).not.toHaveBeenCalled();
  });

  it("mantém a unidade anterior e informa quando o salvamento falha", async () => {
    mocks.salas = [{ ...sala, unidade: "SAÚDE" }];
    render(<Page />);
    await screen.findByText("Mesa cadastrada");
    const unidade = screen.getByRole("combobox", { name: "Unidade" });
    expect(unidade).toBeDisabled();
    await importarParaLiberarUnidade();
    mocks.falharUnidade = true;
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
    fireEvent.click(screen.getByRole("button", { name: "Departamento" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Novo" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Cadastrar departamento" })).toBeDisabled();
  });
});
