import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), carregar: vi.fn(), buscar: vi.fn(), responsavel: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.responsavel }));
vi.mock("@/lib/usuarios.functions", () => ({ responsavelDoLocal: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/transferencias", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/transferencias")>(),
  carregarSalasTransferencia: mocks.carregar, buscarBensTransferencia: mocks.buscar,
}));
import { TransferenciaBensDialog } from "@/components/TransferenciaBensDialog";

const primeiro = { id: "bem-1", sala_id: "origem", codigo_red: "123", descricao: "Mesa", valor: 10 };
const segundo = { id: "bem-2", sala_id: "origem", codigo_red: "456", descricao: "Cadeira", valor: 20 };
const termo = { id: "termo-1", numero: 12, termo_ano: 2026, arquivo: "Transferência de bens", created_at: "2026-10-10T12:00:00Z",
  termo_snapshot: { local: "Sala destino", responsavel: "Maria Silva", cpf: "12345678900", bens: [{ codigo_red: "123", descricao: "Mesa", valor: 10 }] } };

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.carregar.mockResolvedValue([
    { id: "origem", nome: "Sala origem", unidade: "CENTRAL" },
    { id: "destino", nome: "Sala destino", unidade: "EDUCAÇÃO" },
  ]);
  mocks.responsavel.mockResolvedValue({ nome: "Maria Silva", cpf: "12345678900", matricula: "98765" });
  mocks.buscar.mockResolvedValue([primeiro, segundo]);
  mocks.rpc.mockResolvedValue({ data: termo, error: null });
});

async function escolherDestino() {
  const campo = await screen.findByRole("combobox");
  fireEvent.focus(campo);
  fireEvent.click(screen.getByRole("option", { name: /Sala destino/ }));
  await screen.findByDisplayValue("Maria Silva");
}
async function filtrar() {
  fireEvent.change(screen.getByLabelText("Códigos RED separados por vírgulas"), { target: { value: "123,456" } });
  fireEvent.click(screen.getByRole("button", { name: "Filtrar" }));
  await screen.findByRole("checkbox", { name: "Selecionar RED 123 — Sala origem — Bens encontrados" });
}
async function aceitarTodos() {
  await escolherDestino(); await filtrar();
  fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos — Bens encontrados" }));
  fireEvent.click(screen.getByRole("button", { name: "Aceitar selecionados" }));
}

describe("formulário de transferência", () => {
  it("recebe códigos mascarados e só libera Filtrar após escolher o destino", async () => {
    render(<TransferenciaBensDialog codigosIniciais="60.651, 60.785, " onClose={vi.fn()} onSaved={vi.fn()} />);
    const campo = screen.getByLabelText("Códigos RED separados por vírgulas");
    expect(campo).toHaveValue("60.651, 60.785, ");
    expect(screen.queryByRole("region", { name: "Informações registradas na conferência" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filtrar" })).toBeDisabled();
    fireEvent.submit(campo.closest("form")!);
    expect(mocks.buscar).not.toHaveBeenCalled();
    await escolherDestino();
    expect(campo).toHaveValue("60.651, 60.785, ");
    expect(screen.getByRole("button", { name: "Filtrar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Filtrar" }));
    await waitFor(() => expect(mocks.buscar).toHaveBeenCalledWith(["60651", "60785"]));
  });

  it("mostra responsável/CPF, aceita sem mover e salva somente a segunda seleção", async () => {
    const onSaved = vi.fn();
    render(<TransferenciaBensDialog onClose={vi.fn()} onSaved={onSaved} />);
    await aceitarTodos();
    expect(screen.getByLabelText("CPF")).toHaveValue("123.456.789-00");
    expect(screen.getByLabelText("Matrícula")).toHaveValue("98765");
    expect(screen.getByLabelText("Matrícula")).toHaveAttribute("readonly");
    expect(mocks.buscar).toHaveBeenCalledWith(["123", "456"]);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salvar transferência" })).toBeDisabled();
    const lista = screen.getByRole("region", { name: "Bens aceitos para transferência" });
    expect(within(lista).getByText("Mesa")).toBeInTheDocument();
    expect(within(lista).getByText("Cadeira")).toBeInTheDocument();
    fireEvent.click(within(lista).getByRole("checkbox", { name: /Selecionar RED 123/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar transferência" }));
    expect(await screen.findByRole("alertdialog")).toHaveAccessibleName("Deseja preencher o formulário Dados do recebimento?");
    expect(screen.queryByRole("textbox", { name: "Nome do recebedor" })).not.toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("transferir_bens", {
      _destino: "destino", _itens: [{ id: "bem-1", sala_id: "origem" }], _pedido: expect.any(String),
    });
    expect(onSaved).toHaveBeenCalledWith("destino", "termo-1");
  });

  it("mantém a seleção quando o banco impede a transferência", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "O destino já contém um dos códigos RED selecionados" } });
    render(<TransferenciaBensDialog onClose={vi.fn()} onSaved={vi.fn()} />);
    await aceitarTodos();
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos — Bens aceitos para transferência" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar transferência" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O destino já contém");
    expect(screen.queryByTitle("Termo de responsabilidade 12/2026")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Selecionar todos — Bens aceitos para transferência" })).toBeChecked();
  });

  it("verifica o mesmo pedido após falha de conexão sem duplicar a transferência", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("Conexão interrompida"));
    const onSaved = vi.fn();
    render(<TransferenciaBensDialog onClose={vi.fn()} onSaved={onSaved} />);
    await aceitarTodos();
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos — Bens aceitos para transferência" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar transferência" }));
    const verificar = await screen.findByRole("button", { name: "Verificar transferência" });
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.click(verificar);
    expect(await screen.findByRole("alertdialog")).toHaveAccessibleName("Deseja preencher o formulário Dados do recebimento?");
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("abre os bens do alerta sem busca e transfere somente os marcados", async () => {
    const onSaved = vi.fn();
    const grupo = { chave: "origem", local: "Sala origem", tipo: "transferencia" as const,
      itens: [primeiro, segundo].map((bem, indice) => ({
        id: `solicitacao-${indice}`, bem_id: bem.id, sala_id: bem.sala_id,
        codigo_red: bem.codigo_red, descricao: bem.descricao, valor: bem.valor,
        tipo: indice ? "inservivel" : "transferencia", destino: indice ? null : "Local informado na conferência",
        observacao: indice ? "" : "Aguardar retirada do bem.\nConferir com a secretaria.", local_origem: "Sala origem", user_id: "usuario",
        ativa: true, created_at: "2026-10-10T12:00:00Z", updated_at: "2026-10-10T12:00:00Z",
      })),
    };
    render(<TransferenciaBensDialog grupo={grupo} onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.getByText("Transferir bens — Sala origem")).toBeInTheDocument();
    const informacoes = screen.getByRole("region", { name: "Informações registradas na conferência" });
    expect(within(informacoes).getByText("Origem: Sala origem")).toBeInTheDocument();
    expect(screen.queryByText(/Ao trocar o destino/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Destino e observações informados na conferência/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bens informados para transferência na conferência/)).not.toBeInTheDocument();
    expect(within(informacoes).getByRole("columnheader", { name: "Local de destino da transferência" })).toBeInTheDocument();
    expect(within(informacoes).getByRole("columnheader", { name: "Observações" })).toBeInTheDocument();
    const linhaMesa = within(informacoes).getByRole("row", { name: /123/ });
    expect(linhaMesa).toHaveTextContent("Local informado na conferência");
    expect(linhaMesa).toHaveTextContent("Aguardar retirada do bem. Conferir com a secretaria.");
    const linhaCadeira = within(informacoes).getByRole("row", { name: /456/ });
    expect(linhaCadeira).toHaveTextContent("Não informado");
    expect(linhaCadeira).toHaveTextContent("Sem observações");
    expect(screen.queryByLabelText("Códigos RED separados por vírgulas")).not.toBeInTheDocument();
    expect(screen.getByText("Mesa")).toBeInTheDocument();
    expect(screen.getByText("Cadeira")).toBeInTheDocument();
    const campo = await screen.findByRole("combobox");
    fireEvent.focus(campo);
    expect(screen.queryByRole("option", { name: /Sala origem/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Sala destino/ }));
    await screen.findByDisplayValue("Maria Silva");
    fireEvent.click(screen.getByRole("checkbox", { name: /Selecionar RED 123/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar transferência" }));
    expect(await screen.findByRole("alertdialog")).toHaveAccessibleName("Deseja preencher o formulário Dados do recebimento?");
    expect(mocks.buscar).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("transferir_bens", {
      _destino: "destino", _itens: [{ id: "bem-1", sala_id: "origem" }], _pedido: expect.any(String),
    });
    expect(onSaved).toHaveBeenCalledWith("destino", "termo-1", ["bem-1"]);
  });

  it("preenche o destino da conferência, matrícula, nome e CPF sem mover os bens", async () => {
    const grupo = { chave: "origem", local: "Sala origem", tipo: "transferencia" as const,
      itens: [primeiro, segundo].map((bem, indice) => ({
        id: `solicitacao-${indice}`, bem_id: bem.id, sala_id: bem.sala_id,
        codigo_red: bem.codigo_red, descricao: bem.descricao, valor: bem.valor,
        tipo: "transferencia", destino: "Sala destino", observacao: "",
        local_origem: "Sala origem", user_id: "usuario", ativa: true,
        created_at: "2026-10-10T12:00:00Z", updated_at: "2026-10-10T12:00:00Z",
      })),
    };
    mocks.carregar.mockResolvedValue([
      { id: "origem", nome: "Sala origem", unidade: "CENTRAL" },
      { id: "destino", nome: "Sala destino", unidade: "EDUCAÇÃO" },
      { id: "outro", nome: "Outro local", unidade: "CENTRAL" },
    ]);
    const { rerender } = render(<TransferenciaBensDialog grupo={grupo} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("Maria Silva");
    expect(screen.getByRole("combobox")).toHaveValue("Sala destino");
    expect(screen.getByLabelText("Matrícula")).toHaveValue("98765");
    expect(screen.getByLabelText("CPF")).toHaveValue("123.456.789-00");
    expect(mocks.responsavel).toHaveBeenCalledWith({ data: { salaId: "destino" } });
    expect(screen.getByRole("button", { name: "Salvar transferência" })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Selecionar RED 123/ }));
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: /Outro local/ }));
    await waitFor(() => expect(mocks.responsavel).toHaveBeenLastCalledWith({ data: { salaId: "outro" } }));
    rerender(<TransferenciaBensDialog grupo={{ ...grupo, itens: [...grupo.itens] }} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveValue("Outro local");
    expect(screen.getByRole("checkbox", { name: /Selecionar RED 123/ })).not.toBeChecked();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["Sala destino", "Outro local"],
    ["Local não cadastrado", "Local não cadastrado"],
    ["Sala origem", "Sala origem"],
    ["Sala destino", null],
  ])("não escolhe automaticamente destinos diferentes, ausentes ou inválidos (%s / %s)", async (destino1, destino2) => {
    const grupo = { chave: "origem", local: "Sala origem", tipo: "transferencia" as const,
      itens: [primeiro, segundo].map((bem, indice) => ({
        id: `solicitacao-${indice}`, bem_id: bem.id, sala_id: bem.sala_id,
        codigo_red: bem.codigo_red, descricao: bem.descricao, valor: bem.valor,
        tipo: "transferencia", destino: indice ? destino2 : destino1, observacao: "",
        local_origem: "Sala origem", user_id: "usuario", ativa: true,
        created_at: "2026-10-10T12:00:00Z", updated_at: "2026-10-10T12:00:00Z",
      })),
    };
    render(<TransferenciaBensDialog grupo={grupo} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByRole("combobox")).toHaveValue("");
    expect(mocks.responsavel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salvar transferência" })).toBeDisabled();
  });

  it("limpa as listas ao trocar a sala de destino", async () => {
    render(<TransferenciaBensDialog onClose={vi.fn()} onSaved={vi.fn()} />);
    await aceitarTodos();
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: /Sala origem/ }));
    expect(screen.queryByText("Mesa")).not.toBeInTheDocument();
    expect(screen.queryByText("Cadeira")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar transferência" })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
