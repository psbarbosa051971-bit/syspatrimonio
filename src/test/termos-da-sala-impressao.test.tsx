import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), salvar: vi.fn(), entregas: [] as Record<string, unknown>[] }));
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
  mocks.salvar.mockImplementation(async (dados: Record<string, unknown>) => {
    const registro = { ...dados };
    mocks.entregas = [registro];
    return { data: registro, error: null };
  });
  mocks.from.mockImplementation((tabela: string) => {
    const query: Record<string, unknown> = {};
    let dadosSalvar: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "order"]) query[method] = () => query;
    query.range = () => Promise.resolve({ data: termos, error: null });
    query.in = () => Promise.resolve({ data: tabela === "entregas_termos" ? mocks.entregas : [], error: null });
    query.upsert = (dados: Record<string, unknown>) => { dadosSalvar = dados; return query; };
    query.single = () => mocks.salvar(dadosSalvar);
    return query;
  });
});

describe("impressão em Termos criados da sala", () => {
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
    expect(cabecalhos.at(-2)).toHaveTextContent("Tipo de bem");
    expect(cabecalhos.at(-1)).toHaveTextContent("Impressão");
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
