import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), imprimir: vi.fn(), getSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, auth: { getSession: mocks.getSession } } }));
import { ImprimirImportacaoDialog } from "@/components/ImprimirImportacaoDialog";

const snapshot = { local: "Sala teste", responsavel: "Ana Responsável", cpf: "11144477735", bens: [{ codigo_red: "123", descricao: "Mesa", valor: 10 }] };
const registro = { id: "importacao", numero: 21, termo_ano: 2026, arquivo: "bens.html", created_at: "2026-10-13T12:00:00Z", termo_snapshot: snapshot };
const gravado = { ...snapshot, responsavel_recebimento: "Maria Recebedora", cpf_recebimento: "52998224725", entregador: "João Operador", data_termo: "13/10/2026" };
const nomeRecebedor = "Responsável pelo Recebimento";
const cpfRecebedor = "CPF do responsável pelo recebimento";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((tabela: string) => {
    const consulta: Record<string, unknown> = {};
    consulta["select"] = () => consulta;
    consulta["eq"] = () => consulta;
    consulta["single"] = async () => ({ data: tabela === "importacoes" ? registro : { nome: "João Operador", login: "joao", email: "joao@teste.com" }, error: null });
    return consulta;
  });
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "usuario" } } } });
  mocks.rpc.mockImplementation(async (nome: string) => ({ data: nome === "dados_responsavel_sala_termo" ? { responsavel: "Ana Responsável", cpf: "11144477735" } : gravado, error: null }));
  vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue({ focus: vi.fn(), print: mocks.imprimir } as unknown as Window);
});
function abrir() {
  const fechar = vi.fn();
  render(<ImprimirImportacaoDialog importacaoId="importacao" salaId="sala" usuarioId="usuario" nomeAlternativo="João" onClose={fechar} />);
  return fechar;
}
async function preencher() {
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  fireEvent.change(await screen.findByRole("textbox", { name: nomeRecebedor }), { target: { value: "Maria Recebedora" } });
  fireEvent.change(screen.getByLabelText(cpfRecebedor), { target: { value: "52998224725" } });
}
function esperarSemGravacao() {
  expect(mocks.rpc).not.toHaveBeenCalledWith("salvar_recebimento_termo", expect.anything());
}

describe("impressão após a importação", () => {
  it("fecha ao escolher Não após transferência sem carregar nem alterar o recebimento", () => {
    const fechar = vi.fn();
    render(<ImprimirImportacaoDialog importacaoId="importacao" salaId="sala" origem="transferencia" onClose={fechar} />);
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Deseja preencher o formulário Dados do recebimento?");
    fireEvent.click(screen.getByRole("button", { name: "Não" }));
    expect(fechar).toHaveBeenCalledOnce();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("abre após Sim com a sala e seu CPF automáticos e o recebedor separado", async () => {
    render(<ImprimirImportacaoDialog importacaoId="importacao" salaId="sala" origem="transferencia" onClose={vi.fn()} />);
    expect(screen.queryByLabelText(nomeRecebedor)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sim" }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Dados do recebimento");
    expect(await screen.findByLabelText("Responsável pela Sala")).toHaveValue("Ana Responsável");
    expect(screen.getByLabelText("Responsável pela Sala")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("CPF do responsável pela sala")).toHaveValue("111.444.777-35");
    expect(screen.getByLabelText("CPF do responsável pela sala")).toHaveAttribute("readonly");
    expect(screen.getByLabelText(nomeRecebedor)).toHaveValue("");
    expect(screen.getByLabelText(cpfRecebedor)).toHaveValue("");
    expect(screen.getByLabelText("Data do termo")).toHaveValue(new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }));
    expect(screen.getByLabelText("Data do termo")).toHaveAttribute("readonly");
    expect(mocks.rpc).toHaveBeenCalledWith("dados_responsavel_sala_termo", { _sala_id: "sala" });
    esperarSemGravacao();
  });

  it("não consulta nem grava ao cancelar a confirmação da importação", () => {
    const fechar = abrir();
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Deseja imprimir o termo de Responsabilidade dessa importação?");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(fechar).toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("guarda o recebedor sem substituir o responsável da sala e imprime os dois", async () => {
    abrir(); await preencher();
    expect(screen.getByLabelText("Entregue por (usuário logado)")).toHaveValue("João Operador");
    expect(screen.getByLabelText("Entregue por (usuário logado)")).toHaveAttribute("readonly");
    expect(screen.getByLabelText(cpfRecebedor)).toHaveValue("529.982.247-25");
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("salvar_recebimento_termo", {
      _importacao_id: "importacao", _recebedor: "Maria Recebedora", _cpf: "52998224725",
    }));
    const frame = await screen.findByTitle("Termo desta importação");
    for (const texto of ["Ana Responsável", "111.444.777-35", "Maria Recebedora", "529.982.247-25", "Responsável pela Sala", "Responsável pelo Recebimento", "João Operador", "DATA DO TERMO:", "13/10/2026", "DATA DE RECEBIMENTO ____/____/________"]) {
      expect(frame.getAttribute("srcdoc")).toContain(texto);
    }
    fireEvent.load(frame);
    expect(mocks.imprimir).toHaveBeenCalled();
  });

  it("não grava nem abre o documento com CPF inválido", async () => {
    abrir(); await preencher();
    fireEvent.change(screen.getByLabelText(cpfRecebedor), { target: { value: "11111111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Informe um CPF válido");
    esperarSemGravacao();
    expect(screen.queryByTitle("Termo desta importação")).not.toBeInTheDocument();
  });

  it("reabre os dados salvos de quem recebe sem confundir com os da sala", async () => {
    mocks.from.mockImplementation((tabela: string) => {
      const consulta = { select: () => consulta, eq: () => consulta,
        single: async () => ({ data: tabela === "importacoes" ? { ...registro, termo_snapshot: gravado } : { nome: "João Operador" }, error: null }) };
      return consulta;
    });
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(await screen.findByLabelText(nomeRecebedor)).toHaveValue("Maria Recebedora");
    expect(screen.getByLabelText(cpfRecebedor)).toHaveValue("529.982.247-25");
    expect(screen.getByLabelText("Responsável pela Sala")).toHaveValue("Ana Responsável");
    expect(screen.getByLabelText("CPF do responsável pela sala")).toHaveValue("111.444.777-35");
    esperarSemGravacao();
  });

  it("avisa quando falta cadastro da sala sem usar o CPF de quem recebe", async () => {
    mocks.rpc.mockResolvedValue({ data: { responsavel: "", cpf: "" }, error: null });
    abrir(); await preencher();
    expect(screen.getByLabelText("Responsável pela Sala")).toHaveValue("");
    expect(screen.getByLabelText("CPF do responsável pela sala")).toHaveValue("");
    expect(screen.getByText(/Complete esse cadastro/)).toBeInTheDocument();
    expect(screen.getByLabelText(cpfRecebedor)).toHaveValue("529.982.247-25");
    esperarSemGravacao();
  });

  it("permite tentar carregar novamente quando a consulta da sala falha", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Sem conexão" } });
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível consultar o responsável pela sala");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByLabelText("Responsável pela Sala")).toHaveValue("Ana Responsável");
    esperarSemGravacao();
  });

  it("mantém o formulário preenchido se não conseguir gravar", async () => {
    abrir(); await preencher();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Não foi possível gravar" } });
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível gravar");
    expect(screen.getByLabelText(nomeRecebedor)).toHaveValue("Maria Recebedora");
    expect(screen.getByLabelText("Responsável pela Sala")).toHaveValue("Ana Responsável");
    expect(screen.queryByTitle("Termo desta importação")).not.toBeInTheDocument();
  });
});
