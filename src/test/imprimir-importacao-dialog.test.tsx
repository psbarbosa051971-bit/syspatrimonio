import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), imprimir: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
import { ImprimirImportacaoDialog } from "@/components/ImprimirImportacaoDialog";

const snapshot = { local: "Sala teste", responsavel: "", cpf: "", bens: [{ codigo_red: "123", descricao: "Mesa", valor: 10 }] };
const registro = { id: "importacao", numero: 21, termo_ano: 2026, arquivo: "bens.html", created_at: "2026-10-13T12:00:00Z", termo_snapshot: snapshot };

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
  mocks.rpc.mockResolvedValue({ data: { ...snapshot, responsavel: "Maria Recebedora", cpf: "52998224725", entregador: "João Operador" }, error: null });
  vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue({ focus: vi.fn(), print: mocks.imprimir } as unknown as Window);
});
function abrir() {
  const fechar = vi.fn();
  render(<ImprimirImportacaoDialog importacaoId="importacao" salaId="sala" usuarioId="usuario" nomeAlternativo="João" onClose={fechar} />);
  return fechar;
}
async function preencher() {
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  const nome = await screen.findByRole("textbox", { name: "Nome do recebedor" });
  fireEvent.change(nome, { target: { value: "Maria Recebedora" } });
  fireEvent.change(screen.getByRole("textbox", { name: "CPF do recebedor" }), { target: { value: "52998224725" } });
}

describe("impressão após a importação", () => {
  it("pergunta antes de abrir o formulário e não consulta nem grava ao cancelar", () => {
    const fechar = abrir();
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Deseja imprimir o termo de Responsabilidade dessa importação?");
    expect(screen.queryByRole("textbox", { name: "Nome do recebedor" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(fechar).toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("abre o formulário com o entregador bloqueado e guarda os dados antes de imprimir", async () => {
    abrir(); await preencher();
    expect(screen.getByRole("textbox", { name: "Entregue por (usuário logado)" })).toHaveValue("João Operador");
    expect(screen.getByRole("textbox", { name: "Entregue por (usuário logado)" })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "CPF do recebedor" })).toHaveValue("529.982.247-25");
    fireEvent.click(screen.getByRole("button", { name: "Imprimir", exact: true }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("salvar_recebimento_termo", {
      _importacao_id: "importacao", _recebedor: "Maria Recebedora", _cpf: "52998224725",
    }));
    const frame = await screen.findByTitle("Termo desta importação");
    expect(frame.getAttribute("srcdoc")).toContain("Maria Recebedora");
    expect(frame.getAttribute("srcdoc")).toContain("João Operador");
    expect(frame.getAttribute("srcdoc")).toContain("DATA DE RECEBIMENTO ____/____/________");
    fireEvent.load(frame);
    expect(mocks.imprimir).toHaveBeenCalled();
  });

  it("recupera o nome e CPF já gravados no termo ao reabrir o formulário", async () => {
    mocks.from.mockImplementation((tabela: string) => {
      const consulta: Record<string, unknown> = {};
      consulta["select"] = () => consulta;
      consulta["eq"] = () => consulta;
      consulta["single"] = async () => ({ data: tabela === "importacoes"
        ? { ...registro, termo_snapshot: { ...snapshot, responsavel: "Maria Recebedora", cpf: "52998224725", entregador: "Usuário anterior" } }
        : { nome: "João Operador" }, error: null });
      return consulta;
    });
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(await screen.findByRole("textbox", { name: "Nome do recebedor" })).toHaveValue("Maria Recebedora");
    expect(screen.getByRole("textbox", { name: "CPF do recebedor" })).toHaveValue("529.982.247-25");
    expect(screen.getByRole("textbox", { name: "Entregue por (usuário logado)" })).toHaveValue("João Operador");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("não grava nem abre o documento com CPF inválido", async () => {
    abrir(); await preencher();
    fireEvent.change(screen.getByRole("textbox", { name: "CPF do recebedor" }), { target: { value: "11111111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Imprimir", exact: true }));
    expect(screen.getByRole("alert")).toHaveTextContent("Informe um CPF válido");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.queryByTitle("Termo desta importação")).not.toBeInTheDocument();
  });

  it("mantém o formulário preenchido se houver falha ao gravar", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Falha ao gravar" } });
    abrir(); await preencher();
    fireEvent.click(screen.getByRole("button", { name: "Imprimir", exact: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao gravar");
    expect(screen.getByRole("textbox", { name: "Nome do recebedor" })).toHaveValue("Maria Recebedora");
    expect(screen.queryByTitle("Termo desta importação")).not.toBeInTheDocument();
  });
});
