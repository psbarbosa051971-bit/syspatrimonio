import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), buscar: vi.fn(), salvar: vi.fn(), entregas: [] as Record<string, unknown>[] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/components/IncluirBensTermoDialog", () => ({ IncluirBensTermoDialog: () => null }));
vi.mock("@/components/TermosResponsabilidadeDialog", () => ({
  TermosResponsabilidadeDialog: ({ salaId, ultimaImportacao, onOpenChange }: {
    salaId: string; ultimaImportacao: string; onOpenChange: (open: boolean) => void;
  }) => <div role="dialog" aria-label="Impressão do termo">
    <p>{salaId}:{ultimaImportacao}</p>
    <button onClick={() => onOpenChange(false)}>Fechar impressão</button>
  </div>,
}));

import { TermosDaSala } from "@/components/TermosDaSala";
import type { Tables } from "@/integrations/supabase/types";

const termos = [
  { id: "novo", numero: 20, termo_ano: 2026, created_at: "2026-10-10T12:00:00Z", arquivo: "novo.html",
    termo_snapshot: { local: "Sala teste", bens: [{ codigo_red: "123", descricao: "Mesa", valor: 10, tipo: "Móvel" }] } },
  { id: "antigo", numero: 15, termo_ano: 2026, created_at: "2026-09-10T12:00:00Z", arquivo: "antigo.html",
    termo_snapshot: { local: "Sala teste", bens: [{ codigo_red: "456", descricao: "Cadeira", valor: 20 }] } },
  { id: "invalido", numero: 10, termo_ano: 2026, created_at: "2026-08-10T12:00:00Z", arquivo: "invalido.html",
    termo_snapshot: null },
];

const props = {
  salaId: "sala", atualizar: 0, selecionado: null, quantidadeBens: 2, valorSala: 30,
  bensDaSala: [
    { id: "mesa", sala_id: "sala", importacao_id: "novo" },
    { id: "cadeira", sala_id: "sala", importacao_id: "antigo" },
    { id: "outro", sala_id: "sala", importacao_id: "invalido" },
  ] as Tables<"bens">[],
  carregandoBens: false, erroBens: false,
  onSelecionar: vi.fn(), onLimpar: vi.fn(), onAtualizar: vi.fn(),
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.entregas = [];
  mocks.buscar.mockImplementation(async (numero: number) => ({ data: termos.filter((termo) => termo.numero === numero), error: null }));
  mocks.salvar.mockImplementation(async (dados: Record<string, unknown>) => {
    const registro = { ...dados };
    mocks.entregas = [registro];
    return { data: registro, error: null };
  });
  mocks.from.mockImplementation((tabela: string) => {
    const query: Record<string, unknown> = {};
    let dadosSalvar: Record<string, unknown> = {};
    let numero: number | undefined;
    let sala: string | undefined;
    for (const method of ["select", "not", "order"]) query[method] = () => query;
    query.eq = (coluna: string, valor: string | number) => {
      if (coluna === "numero") numero = Number(valor);
      if (coluna === "sala_id") sala = String(valor);
      return query;
    };
    query.range = () => numero === undefined ? Promise.resolve({ data: termos, error: null }) : mocks.buscar(numero, sala);
    query.in = (_coluna: string, ids: string[]) => Promise.resolve({
      data: tabela === "entregas_termos" ? mocks.entregas.filter((entrega) => ids.includes(String(entrega.importacao_id))) : [], error: null,
    });
    query.upsert = (dados: Record<string, unknown>) => { dadosSalvar = dados; return query; };
    query.single = () => mocks.salvar(dadosSalvar);
    return query;
  });
});

describe("impressão em Termos criados da sala", () => {
  it.each(["00020", "00020/2026"])("abre a baixa por %s e exibe os itens e totais do termo", async (numero) => {
    render(<TermosDaSala {...props} />);
    await screen.findByRole("button", { name: "Status do termo 20/2026" });
    const campo = screen.getByLabelText("Baixa de termo");
    expect(campo).toHaveAttribute("placeholder", "Ex.: 112");
    expect(campo).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(campo, { target: { value: numero } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir termo" }));
    const dialogo = await screen.findByRole("dialog", { name: "Termo de responsabilidade 20/2026" });
    expect(within(dialogo).getByRole("columnheader", { name: "Patrimônio" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("columnheader", { name: "Aquisição" })).toBeInTheDocument();
    expect(within(dialogo).getByText("123")).toBeInTheDocument();
    expect(within(dialogo).getByText("Mesa")).toBeInTheDocument();
    expect(within(dialogo).queryByText("Cadeira")).not.toBeInTheDocument();
    expect(within(dialogo).getByText("ITENS:").parentElement).toHaveTextContent("01");
    expect(within(dialogo).getByText("VALOR:").parentElement).toHaveTextContent(/10,00/);
    for (const campo of ["Entregue por", "Recebido Por", "CPF", "Data Entrega", "Status"]) {
      expect(within(dialogo).getByLabelText(campo)).toBeInTheDocument();
    }
  });

  it("salva a baixa na mesma entrega e recupera os dados ao reabrir pelo número", async () => {
    render(<TermosDaSala {...props} />);
    await screen.findByRole("button", { name: "Status do termo 20/2026" });
    fireEvent.change(screen.getByLabelText("Baixa de termo"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir termo" }));
    fireEvent.change(await screen.findByLabelText("Entregue por"), { target: { value: "Maria" } });
    fireEvent.change(screen.getByLabelText("Recebido Por"), { target: { value: "João" } });
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "52998224725" } });
    fireEvent.change(screen.getByLabelText("Data Entrega"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Entregue" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar entrega" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.salvar).toHaveBeenCalledWith(expect.objectContaining({
      importacao_id: "novo", entregue_por: "Maria", recebido_por: "João", cpf: "52998224725",
      data_entrega: "2026-10-20", status: "Entregue",
    }));
    expect(screen.getByRole("button", { name: "Status do termo 20/2026" }).closest("tr")).toHaveClass("termo-entregue");
    fireEvent.click(screen.getByRole("button", { name: "Abrir termo" }));
    expect(await screen.findByLabelText("Recebido Por")).toHaveValue("João");
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
  });

  it("avisa quando o número é inválido, pertence a outro ano ou não tem itens disponíveis", async () => {
    render(<TermosDaSala {...props} />);
    await screen.findByRole("button", { name: "Status do termo 20/2026" });
    const campo = screen.getByLabelText("Baixa de termo");
    const abrir = screen.getByRole("button", { name: "Abrir termo" });
    fireEvent.change(campo, { target: { value: "abc" } });
    fireEvent.click(abrir);
    expect(screen.getByRole("alert")).toHaveTextContent("Digite o número do termo");
    fireEvent.change(campo, { target: { value: "20/2025" } });
    fireEvent.click(abrir);
    expect(await screen.findByRole("alert")).toHaveTextContent("Termo não encontrado nas salas às quais você tem acesso");
    fireEvent.change(campo, { target: { value: "10" } });
    fireEvent.click(abrir);
    expect(await screen.findByRole("alert")).toHaveTextContent("Os itens deste termo não estão disponíveis");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("limpa a busca e fecha a baixa quando a sala muda", async () => {
    const { rerender } = render(<TermosDaSala {...props} />);
    await screen.findByRole("button", { name: "Status do termo 20/2026" });
    fireEvent.change(screen.getByLabelText("Baixa de termo"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir termo" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    rerender(<TermosDaSala {...props} salaId="outra-sala" />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Baixa de termo")).toHaveValue("");
  });

  it.each(["sala", null])("busca o termo 112 de outra sala sem depender da sala aberta (%s)", async (salaId) => {
    const termoOutraSala = { ...termos[0], id: "termo-outra-sala", numero: 112,
      termo_snapshot: { local: "Outra sala", bens: [{ codigo_red: "789", descricao: "Armário", valor: 50 }] } };
    mocks.buscar.mockResolvedValue({ data: [termoOutraSala], error: null });
    mocks.entregas = [{ importacao_id: "termo-outra-sala", entregue_por: "Ana", recebido_por: "Carlos",
      cpf: "52998224725", data_entrega: "2026-10-20", status: "Entregue" }];
    render(<TermosDaSala {...props} salaId={salaId} erroBens />);
    fireEvent.change(screen.getByLabelText("Baixa de termo"), { target: { value: "112" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir termo" }));
    const dialogo = await screen.findByRole("dialog", { name: "Termo de responsabilidade 112/2026" });
    expect(mocks.buscar).toHaveBeenCalledWith(112, undefined);
    expect(within(dialogo).getByText("Armário")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Recebido Por")).toHaveValue("Carlos");
    fireEvent.change(within(dialogo).getByLabelText("Entregue por"), { target: { value: "Maria" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar entrega" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.salvar).toHaveBeenCalledWith(expect.objectContaining({
      importacao_id: "termo-outra-sala", entregue_por: "Maria", recebido_por: "Carlos", status: "Entregue",
    }));
  });

  it("pede o ano quando a busca global encontra mais de um termo com o mesmo número", async () => {
    mocks.buscar.mockResolvedValue({ data: [termos[0], { ...termos[0], id: "ano-anterior", termo_ano: 2025 }], error: null });
    render(<TermosDaSala {...props} />);
    await screen.findByRole("button", { name: "Status do termo 20/2026" });
    fireEvent.change(screen.getByLabelText("Baixa de termo"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir termo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe também o ano do termo");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Baixa de termo"), { target: { value: "20/2025" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir termo" }));
    expect(await screen.findByRole("dialog", { name: "Termo de responsabilidade 20/2025" })).toBeInTheDocument();
  });

  it("permite repetir a busca global quando ocorre uma falha", async () => {
    mocks.buscar.mockResolvedValueOnce({ data: null, error: { message: "Falha de conexão" } });
    render(<TermosDaSala {...props} />);
    await screen.findByRole("button", { name: "Status do termo 20/2026" });
    fireEvent.change(screen.getByLabelText("Baixa de termo"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir termo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível buscar o termo");
    expect(screen.getByLabelText("Baixa de termo")).toHaveValue("20");
    fireEvent.click(screen.getByRole("button", { name: "Abrir termo" }));
    expect(await screen.findByRole("dialog", { name: "Termo de responsabilidade 20/2026" })).toBeInTheDocument();
  });

  it("oculta termos sem bens atuais mesmo quando o documento salvo contém bens", async () => {
    const { rerender } = render(<TermosDaSala {...props} />);
    await screen.findByRole("button", { name: "Mostrar bens do termo 15/2026" });
    rerender(<TermosDaSala {...props} bensDaSala={[props.bensDaSala[0]]} quantidadeBens={1} />);
    expect(screen.getByRole("button", { name: "Mostrar bens do termo 20/2026" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mostrar bens do termo 15/2026" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Imprimir termo 15/2026" })).not.toBeInTheDocument();
    expect(screen.getByText("Quantidade de termos").parentElement).toHaveTextContent("1");
    rerender(<TermosDaSala {...props} />);
    expect(screen.getByRole("button", { name: "Mostrar bens do termo 15/2026" })).toBeInTheDocument();
  });

  it("mostra em Bens a quantidade atual que será aberta, não a quantidade do documento salvo", async () => {
    render(<TermosDaSala {...props} bensDaSala={[
      props.bensDaSala[0], { ...props.bensDaSala[0], id: "segunda-mesa" },
    ]} />);
    const botao = await screen.findByRole("button", { name: "Mostrar bens do termo 20/2026" });
    expect(within(botao.closest("tr")!).getAllByRole("cell")[1]).toHaveTextContent("002");
  });

  it("informa quando nenhum termo tem bens atuais e não confunde carregamento com lista vazia", async () => {
    const { rerender } = render(<TermosDaSala {...props} bensDaSala={[]} carregandoBens />);
    await waitFor(() => expect(mocks.from).toHaveBeenCalledWith("entregas_termos"));
    expect(screen.getByRole("status")).toHaveTextContent("Carregando termos");
    expect(screen.queryByText("Nenhum termo com bens atualmente nesta sala.")).not.toBeInTheDocument();
    rerender(<TermosDaSala {...props} bensDaSala={[]} />);
    expect(screen.getByText("Nenhum termo com bens atualmente nesta sala.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mostrar bens do termo/ })).not.toBeInTheDocument();
    expect(screen.getByText("Quantidade de termos").parentElement).toHaveTextContent("0");
  });

  it("permite tentar novamente se os bens da sala não puderem ser carregados", async () => {
    render(<TermosDaSala {...props} bensDaSala={[]} erroBens />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(props.onAtualizar).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Nenhum termo com bens atualmente nesta sala.")).not.toBeInTheDocument();
  });

  it("coloca a impressão à direita do tipo de bem e abre o termo da linha clicada", async () => {
    render(<TermosDaSala {...props} />);
    const imprimir = await screen.findByRole("button", { name: "Imprimir termo 15/2026" });
    const cabecalhos = screen.getAllByRole("columnheader");
    expect(cabecalhos.at(-3)).toHaveTextContent("Tipo de bem");
    expect(cabecalhos.at(-2)).toHaveTextContent("Classificação");
    expect(cabecalhos.at(-1)).toHaveTextContent("Impressão");
    const linha = screen.getByRole("button", { name: "Imprimir termo 15/2026" }).closest("tr")!;
    expect(within(linha).getAllByRole("cell").at(-2)).toHaveTextContent("CADEIRA");
    fireEvent.click(imprimir);
    expect(screen.getByRole("dialog", { name: "Impressão do termo" })).toHaveTextContent("sala:antigo");
    expect(props.onSelecionar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Fechar impressão" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Imprimir termo 20/2026" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("sala:novo");
  });

  it("desabilita a impressão de documentos com dados indisponíveis", async () => {
    render(<TermosDaSala {...props} />);
    expect(await screen.findByRole("button", { name: "Imprimir termo 10/2026" })).toBeDisabled();
  });

  it("fecha a impressão ao mudar de sala", async () => {
    const { rerender } = render(<TermosDaSala {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Imprimir termo 15/2026" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    rerender(<TermosDaSala {...props} salaId="outra-sala" />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("abre Status ao lado da impressora e salva a entrega com a linha azul", async () => {
    render(<TermosDaSala {...props} />);
    const botao = await screen.findByRole("button", { name: "Status do termo 20/2026" });
    const linha = botao.closest("tr")!;
    expect(linha).toHaveClass("termo-aguardando");
    expect(within(linha).getByText("Aguardando Entrega")).toBeInTheDocument();
    expect(botao.previousElementSibling).toHaveAccessibleName("Imprimir termo 20/2026");
    fireEvent.click(botao);
    const dialogo = screen.getByRole("dialog", { name: "Entrega do termo 20/2026" });
    fireEvent.change(within(dialogo).getByLabelText("Entregue por"), { target: { value: "Maria" } });
    fireEvent.change(within(dialogo).getByLabelText("Recebido Por"), { target: { value: "João" } });
    fireEvent.change(within(dialogo).getByLabelText("CPF"), { target: { value: "52998224725" } });
    fireEvent.change(within(dialogo).getByLabelText("Data Entrega"), { target: { value: "2026-10-20" } });
    fireEvent.change(within(dialogo).getByLabelText("Status"), { target: { value: "Entregue" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar entrega" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.salvar).toHaveBeenCalledWith(expect.objectContaining({
      importacao_id: "novo", entregue_por: "Maria", recebido_por: "João", cpf: "52998224725",
      data_entrega: "2026-10-20", status: "Entregue",
    }));
    expect(linha).toHaveClass("termo-entregue");
    expect(within(linha).getByText("Entregue")).toBeInTheDocument();
    expect(within(linha).getByText("João")).toBeInTheDocument();
    expect(within(linha).getByText("20/10/2026")).toBeInTheDocument();
    fireEvent.click(botao);
    expect(screen.getByLabelText("Recebido Por")).toHaveValue("João");
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
  });

  it("carrega a entrega já salva e permite voltar para aguardando", async () => {
    mocks.entregas = [{ importacao_id: "novo", entregue_por: "Maria", recebido_por: "João",
      cpf: "52998224725", data_entrega: "2026-10-20", status: "Entregue" }];
    render(<TermosDaSala {...props} />);
    const botao = await screen.findByRole("button", { name: "Status do termo 20/2026" });
    expect(botao.closest("tr")).toHaveClass("termo-entregue");
    fireEvent.click(botao);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Aguardando Entrega" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar entrega" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(botao.closest("tr")).toHaveClass("termo-aguardando");
  });

  it("não salva CPF inválido e mantém o formulário quando ocorre uma falha", async () => {
    render(<TermosDaSala {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Status do termo 20/2026" }));
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "11111111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar entrega" }));
    expect(screen.getByRole("alert")).toHaveTextContent("CPF válido");
    expect(mocks.salvar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "52998224725" } });
    mocks.salvar.mockResolvedValueOnce({ data: null, error: { message: "Falha" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar entrega" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar"));
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
