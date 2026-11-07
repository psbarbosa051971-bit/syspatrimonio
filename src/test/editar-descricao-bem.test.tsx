import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({
  atualizar: vi.fn(), eq: vi.fn(), gravar: vi.fn(), sucesso: vi.fn(), erro: vi.fn(), salvarEntrega: vi.fn(),
  termos: [] as Record<string, unknown>[], entrega: null as Record<string, unknown> | null,
  carregarSala: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/components/ImprimirImportacaoDialog", () => ({
  ImprimirImportacaoDialog: ({ importacaoId, onClose }: { importacaoId: string; onClose: () => void }) =>
    <div><p>Termo criado: {importacaoId}</p><button onClick={onClose}>Fechar novo termo</button></div>,
}));
vi.mock("@/lib/entregas-termos.functions", () => ({ confirmarSenhaEntrega: vi.fn(), salvarEntregaConfirmada: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: (tabela: string) => {
    if (tabela === "salas") {
      const query = { select: () => query, eq: () => query, single: mocks.carregarSala };
      return query;
    }
    if (tabela === "importacoes") {
      const query = { select: () => query, eq: () => query, not: () => query, order: () => query,
        range: () => Promise.resolve({ data: mocks.termos, error: null }) };
      return query;
    }
    if (tabela === "entregas_termos") {
      let dados: unknown;
      const query = { select: () => query, eq: () => query,
        maybeSingle: () => Promise.resolve({ data: mocks.entrega, error: null }),
        upsert: (registro: unknown) => { dados = registro; return query; },
        single: () => mocks.salvarEntrega(dados) };
      return query;
    }
    return { update: (dados: unknown) => {
      mocks.atualizar(dados);
      return { eq: (...args: unknown[]) => {
        mocks.eq(...args);
        return { select: () => ({ single: mocks.gravar }) };
      } };
    } };
  } },
}));
vi.mock("@/lib/pdf-parse", () => ({ limparDescricao: (descricao: string) => descricao }));
vi.mock("sonner", () => ({ toast: { success: mocks.sucesso, error: mocks.erro } }));
import { EditarDescricaoBem } from "@/components/EditarDescricaoBem";

const bem = { id: "bem-1", codigo_red: "123", descricao: "MESA", sala_id: "sala-1" } as Tables<"bens">;
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.termos = [];
  mocks.entrega = null;
  mocks.carregarSala.mockResolvedValue({ data: { id: "sala-1", nome: "Sala do bem" }, error: null });
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.salvarEntrega.mockImplementation(async (dados: Record<string, unknown>) => ({ data: dados, error: null }));
  mocks.gravar.mockResolvedValue({ data: { ...bem, descricao: "VEÍCULO FIAT" }, error: null });
});

async function abrir(onSaved = vi.fn()) {
  render(<EditarDescricaoBem bem={bem} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar descrição do bem — 123" }));
  return screen.getByLabelText("Descrição do bem");
}

describe("edição da descrição do bem", () => {
  it("salva a descrição no bem correto e atualiza a listagem", async () => {
    const onSaved = vi.fn();
    const campo = await abrir(onSaved);
    expect(campo).toHaveValue("MESA");
    fireEvent.change(campo, { target: { value: " VEÍCULO FIAT " } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ descricao: "VEÍCULO FIAT" })));
    expect(mocks.atualizar).toHaveBeenCalledWith({ descricao: "VEÍCULO FIAT" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "bem-1");
    expect(mocks.sucesso).toHaveBeenCalledWith("Dados do bem e dos termos de responsabilidade da sala atualizados.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("mantém o texto digitado após falha e permite tentar novamente", async () => {
    mocks.gravar.mockResolvedValueOnce({ data: null, error: { message: "Falha" } });
    const onSaved = vi.fn();
    const campo = await abrir(onSaved);
    fireEvent.change(campo, { target: { value: "VEÍCULO FIAT" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(mocks.erro).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
    expect(campo).toHaveValue("VEÍCULO FIAT");
    expect(screen.getByRole("button", { name: "Salvar descrição" })).toBeEnabled();
  });

  it("informa que o salvamento também atualiza os termos já criados da mesma sala", async () => {
    await abrir();
    expect(screen.getByText(/nos termos de responsabilidade da mesma sala, inclusive os já criados/)).toBeInTheDocument();
  });

  it("salva mesmo sem mudar o texto para permitir sincronizar um termo desatualizado", async () => {
    mocks.gravar.mockResolvedValueOnce({ data: bem, error: null });
    const onSaved = vi.fn();
    await abrir(onSaved);
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(bem));
    expect(mocks.atualizar).toHaveBeenCalledWith({ descricao: "MESA" });
  });

  it("não aceita uma descrição vazia", async () => {
    const campo = await abrir();
    fireEvent.change(campo, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Salvar descrição" })).toBeDisabled();
    expect(mocks.atualizar).not.toHaveBeenCalled();
  });
});

describe("edição do valor do bem", () => {
  it("salva o valor digitado em reais", async () => {
    await abrir();
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "R$ 3.459,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(mocks.atualizar).toHaveBeenCalledWith({ descricao: "MESA", valor: 3459 }));
  });
});

describe("edição da incorporação e do tipo do bem", () => {
  const bemComDados = { ...bem, incorporacao: "07/12/2009", tipo: "Doação" } as Tables<"bens">;

  function abrirComDados() {
    render(<EditarDescricaoBem bem={bemComDados} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar descrição do bem — 123" }));
  }

  it("mostra a incorporação e o tipo já cadastrados", () => {
    abrirComDados();
    expect(screen.getByLabelText("Incorporação")).toHaveValue("07/12/2009");
    expect(screen.getByLabelText("Tipo")).toHaveValue("Doação");
  });

  it("salva a incorporação digitada com máscara e o tipo escolhido", async () => {
    abrirComDados();
    fireEvent.change(screen.getByLabelText("Incorporação"), { target: { value: "15022020" } });
    expect(screen.getByLabelText("Incorporação")).toHaveValue("15/02/2020");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "Aquisição" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(mocks.atualizar).toHaveBeenCalledWith(
      { descricao: "MESA", incorporacao: "15/02/2020", tipo: "Aquisição" },
    ));
  });

  it("não salva quando a data de incorporação é inválida", async () => {
    abrirComDados();
    fireEvent.change(screen.getByLabelText("Incorporação"), { target: { value: "33132020" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar descrição" }));
    await waitFor(() => expect(mocks.erro).toHaveBeenCalled());
    expect(mocks.atualizar).not.toHaveBeenCalled();
  });
});

const termoDoBem = {
  id: "termo-118", numero: 118, termo_ano: 2026, created_at: "2026-10-20T12:00:00Z", arquivo: "termo.html",
  termo_snapshot: { tipo_documento: "novo_termo", bem_ids: ["bem-1"], local: "Sala", bens: [{ codigo_red: "123", descricao: "MESA", valor: 10 }] },
};

describe("dados da entrega na edição do bem", () => {
  it("mostra e salva os campos no termo vinculado, sem alterar a descrição", async () => {
    mocks.termos = [termoDoBem];
    await abrir();
    expect(await screen.findByLabelText("Entregue por")).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("Aguardando Entrega");
    fireEvent.change(screen.getByLabelText("Entregue por"), { target: { value: "João" } });
    fireEvent.change(screen.getByLabelText("Recebido Por"), { target: { value: "Maria" } });
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "52998224725" } });
    fireEvent.change(screen.getByLabelText("Data Entrega"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Entregue" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar entrega" }));
    await waitFor(() => expect(mocks.salvarEntrega).toHaveBeenCalledWith(expect.objectContaining({
      importacao_id: "termo-118", entregue_por: "João", recebido_por: "Maria", cpf: "52998224725",
      data_entrega: "2026-10-20", status: "Entregue",
    })));
    expect(mocks.atualizar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Entregue por")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("carrega os dados salvos e preserva o bloqueio de uma entrega concluída", async () => {
    mocks.termos = [termoDoBem];
    mocks.entrega = { importacao_id: "termo-118", entregue_por: "João", recebido_por: "Maria",
      cpf: "52998224725", data_entrega: "2026-10-20", status: "Entregue" };
    await abrir();
    expect(await screen.findByLabelText("Entregue por")).toHaveValue("João");
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
    expect(screen.getByLabelText("Data Entrega")).toHaveValue("2026-10-20");
    expect(screen.getByLabelText("Status")).toBeDisabled();
  });

  it("explica quando o bem ainda não possui termo", async () => {
    await abrir();
    expect(await screen.findByText(/Este bem não possui termo de responsabilidade vinculado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar descrição" })).toBeEnabled();
  });

  it("permite escolher apenas termos que contêm o bem", async () => {
    mocks.termos = [
      { ...termoDoBem, id: "outro-bem", numero: 120,
        termo_snapshot: { ...termoDoBem.termo_snapshot, bem_ids: ["bem-2"] } },
      { ...termoDoBem, id: "termo-119", numero: 119 }, termoDoBem,
    ];
    await abrir();
    const seletor = await screen.findByLabelText("Termo da entrega");
    expect(screen.queryByRole("option", { name: "Termo 120/2026" })).not.toBeInTheDocument();
    fireEvent.change(seletor, { target: { value: "termo-118" } });
    expect(await screen.findByLabelText("Entregue por")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Entregue por"), { target: { value: "João" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar entrega" }));
    await waitFor(() => expect(mocks.salvarEntrega).toHaveBeenCalledWith(expect.objectContaining({ importacao_id: "termo-118" })));
  });
});

describe("criação de termo na edição do bem", () => {
  it("cria um termo só para o bem sem termo e atualiza a entrega no formulário", async () => {
    mocks.rpc.mockImplementation(async () => {
      mocks.termos = [termoDoBem];
      return { data: termoDoBem, error: null };
    });
    await abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Criar número de termo" }));
    expect(await screen.findByText("Novo termo de responsabilidade")).toBeInTheDocument();
    expect(screen.getByText("Local Físico: Sala do bem")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Criar termo" }));
    expect(await screen.findByText("Termo criado: termo-118")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("criar_termo_bens_sala", {
      _sala: "sala-1", _itens: ["bem-1"], _pedido: expect.any(String),
    });
    fireEvent.click(screen.getByRole("button", { name: "Fechar novo termo" }));
    expect(await screen.findByText("Termo de responsabilidade 118/2026")).toBeInTheDocument();
    expect(await screen.findByLabelText("Entregue por")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar número de termo" })).not.toBeInTheDocument();
    expect(mocks.atualizar).not.toHaveBeenCalled();
  });

  it("permite cancelar a criação sem gerar número", async () => {
    await abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Criar número de termo" }));
    await screen.findByText("Novo termo de responsabilidade");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByRole("button", { name: "Criar número de termo" })).toBeEnabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("mantém a opção disponível quando a consulta da sala falha", async () => {
    mocks.carregarSala.mockResolvedValueOnce({ data: null, error: { message: "Falha" } });
    await abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Criar número de termo" }));
    await waitFor(() => expect(mocks.erro).toHaveBeenCalledWith(
      "Não foi possível carregar a sala para criar o termo. Tente novamente.",
    ));
    expect(screen.getByRole("button", { name: "Criar número de termo" })).toBeEnabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("não oferece outro termo quando o bem já possui um", async () => {
    mocks.termos = [termoDoBem];
    await abrir();
    await screen.findByLabelText("Entregue por");
    expect(screen.queryByRole("button", { name: "Criar número de termo" })).not.toBeInTheDocument();
  });

  it("orienta vincular uma sala antes de criar termo", async () => {
    render(<EditarDescricaoBem bem={{ ...bem, sala_id: null }} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar descrição do bem — 123" }));
    expect(await screen.findByText("Vincule este bem a uma sala antes de criar o termo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar número de termo" })).not.toBeInTheDocument();
  });
});

