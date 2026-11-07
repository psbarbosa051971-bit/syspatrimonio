import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), consultas: vi.fn(), salvar: vi.fn(), entrega: null as Record<string, unknown> | null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/entregas-termos.functions", () => ({ confirmarSenhaEntrega: vi.fn(), salvarEntregaConfirmada: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { TermosResponsabilidadeDialog } from "@/components/TermosResponsabilidadeDialog";

const registros = [
  { id: "nova", numero: 20, termo_ano: 2026, arquivo: "novo.html", created_at: "2026-10-10T12:00:00Z" },
  { id: "antiga", numero: 15, termo_ano: 2026, arquivo: "antigo.html", created_at: "2026-09-10T12:00:00Z" },
];
const snapshot = {
  local: "Sala de teste", bens: [{ codigo_red: "123", descricao: "Mesa", valor: 10 }],
};
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.entrega = null;
  mocks.salvar.mockImplementation(async (dados: Record<string, unknown>) => ({ data: dados, error: null }));
  mocks.from.mockImplementation((tabela: string) => {
    let id = "";
    let dadosSalvar: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    for (const method of ["select", "not", "order", "range"]) query[method] = () => query;
    query["eq"] = (campo: string, valor: string) => {
      if (campo === "id") id = valor;
      return query;
    };
    query["maybeSingle"] = () => Promise.resolve({ data: mocks.entrega, error: null });
    query["upsert"] = (dados: Record<string, unknown>) => { dadosSalvar = dados; return query; };
    query["single"] = () => {
      if (tabela === "entregas_termos") return mocks.salvar(dadosSalvar);
      mocks.consultas(id);
      return Promise.resolve({ data: { ...registros.find((r) => r.id === id), termo_snapshot: snapshot }, error: null });
    };
    query["then"] = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: registros, error: null }).then(resolve);
    return query;
  });
});

function abrir(ultimaImportacao = "") {
  render(<TermosResponsabilidadeDialog open onOpenChange={vi.fn()} salaId="sala" ultimaImportacao={ultimaImportacao} />);
}
function enviar(numero: string) {
  const campo = screen.getByRole("textbox", { name: "Número do termo" });
  fireEvent.change(campo, { target: { value: numero } });
  fireEvent.submit(campo.closest("form")!);
}

describe("visualização de termos recentes e anteriores", () => {
  it("mostra os campos da entrega no próprio termo e atualiza a impressão ao salvar", async () => {
    abrir("nova");
    await screen.findByTitle("Termo de responsabilidade 20/2026");
    for (const campo of ["Entregue por", "CPF", "Data Entrega", "Status"]) {
      expect(screen.getByLabelText(campo)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Entregue por"), { target: { value: "João Entregador" } });
    fireEvent.change(screen.getByLabelText("Recebido Por"), { target: { value: "Maria Recebedora" } });
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "52998224725" } });
    fireEvent.change(screen.getByLabelText("Data Entrega"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Entregue" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar entrega" }));
    await waitFor(() => expect(mocks.salvar).toHaveBeenCalledWith(expect.objectContaining({
      importacao_id: "nova", entregue_por: "João Entregador", cpf: "52998224725",
      data_entrega: "2026-10-20", status: "Entregue",
    })));
    await waitFor(() => expect(screen.getByTitle("Termo de responsabilidade 20/2026").getAttribute("srcdoc")).toContain("DATA DE RECEBIMENTO 20/10/2026"));
    expect(screen.getByTitle("Termo de responsabilidade 20/2026").getAttribute("srcdoc")).toContain("<strong>STATUS:</strong> Entregue");
    expect(screen.getByLabelText("Entregue por")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("carrega a entrega já registrada ao reabrir o termo", async () => {
    mocks.entrega = { importacao_id: "nova", entregue_por: "João", recebido_por: "Maria",
      cpf: "52998224725", data_entrega: "2026-10-20", status: "Entregue" };
    abrir("nova");
    await screen.findByTitle("Termo de responsabilidade 20/2026");
    expect(screen.getByLabelText("Entregue por")).toHaveValue("João");
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
    expect(screen.getByLabelText("Data Entrega")).toHaveValue("2026-10-20");
    expect(screen.getByLabelText("Status")).toHaveValue("Entregue");
  });

  it("mantém a visualização direta do HTML recém-importado", async () => {
    abrir("nova");
    expect(await screen.findByTitle("Termo de responsabilidade 20/2026")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Número do termo" })).not.toBeInTheDocument();
    expect(mocks.consultas).toHaveBeenCalledWith("nova");
  });

  it("pede o número antes de abrir um termo de importação anterior", async () => {
    abrir();
    await screen.findByRole("textbox", { name: "Número do termo" });
    expect(mocks.consultas).not.toHaveBeenCalled();
    expect(screen.queryByTitle(/Termo de responsabilidade/)).not.toBeInTheDocument();
    enviar("15/2026");
    expect(await screen.findByTitle("Termo de responsabilidade 15/2026")).toBeInTheDocument();
    expect(mocks.consultas).toHaveBeenCalledWith("antiga");
  });

  it("aceita somente o número quando não há ambiguidade", async () => {
    abrir();
    await screen.findByRole("textbox", { name: "Número do termo" });
    enviar("15");
    expect(await screen.findByTitle("Termo de responsabilidade 15/2026")).toBeInTheDocument();
  });

  it("informa quando o número não pertence ao local selecionado", async () => {
    abrir();
    await screen.findByRole("textbox", { name: "Número do termo" });
    enviar("999");
    expect(screen.getByRole("alert")).toHaveTextContent("Nenhum termo com esse número foi encontrado neste Local Físico.");
    expect(mocks.consultas).not.toHaveBeenCalled();
  });

  it("permite visualizar novamente o mesmo termo", async () => {
    abrir();
    await screen.findByRole("textbox", { name: "Número do termo" });
    enviar("15");
    await screen.findByTitle("Termo de responsabilidade 15/2026");
    enviar("15");
    await waitFor(() => expect(mocks.consultas).toHaveBeenCalledTimes(2));
    expect(await screen.findByTitle("Termo de responsabilidade 15/2026")).toBeInTheDocument();
  });

  it("não trata a última importação de outro local como recém-importada", async () => {
    abrir("outra-sala");
    expect(await screen.findByRole("textbox", { name: "Número do termo" })).toBeInTheDocument();
    expect(mocks.consultas).not.toHaveBeenCalled();
  });

  it("no novo botão pede o número mesmo com um HTML recém-importado", async () => {
    render(<TermosResponsabilidadeDialog open onOpenChange={vi.fn()} salaId="sala" ultimaImportacao="nova" consultarPorNumero />);
    const campo = await screen.findByRole("textbox", { name: "Número do termo" });
    expect(mocks.consultas).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Termo de responsabilidade/)).not.toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "15/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(await screen.findByTitle("Termo de responsabilidade 15/2026")).toBeInTheDocument();
    expect(mocks.consultas).toHaveBeenCalledWith("antiga");
  });

  it("permite abrir por número também o termo recém-importado", async () => {
    render(<TermosResponsabilidadeDialog open onOpenChange={vi.fn()} salaId="sala" ultimaImportacao="nova" consultarPorNumero />);
    await screen.findByRole("textbox", { name: "Número do termo" });
    enviar("20");
    expect(await screen.findByTitle("Termo de responsabilidade 20/2026")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Número do termo" })).toBeInTheDocument();
    expect(mocks.consultas).toHaveBeenCalledWith("nova");
  });
});
