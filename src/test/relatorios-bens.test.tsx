import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SolicitacaoBem } from "@/lib/solicitacoes-bens";

const mocks = vi.hoisted(() => ({ carregar: vi.fn() }));
vi.mock("@/lib/solicitacoes-bens", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/solicitacoes-bens")>(),
  carregarSolicitacoes: mocks.carregar,
}));
vi.mock("@/components/TransferenciaBensDialog", () => ({
  TransferenciaBensDialog: ({ grupo, onSaved, onClose }: {
    grupo: { local: string; itens: SolicitacaoBem[] };
    onSaved: (sala: string, termo: string, ids: string[]) => void;
    onClose: () => void;
  }) => <div role="dialog" aria-label={grupo.local}>
    <button onClick={() => onSaved("destino", "termo", [grupo.itens[0]!.bem_id!])}>Salvar primeiro</button>
    <button onClick={() => onSaved("destino", "termo", grupo.itens.map((item) => item.bem_id!))}>Salvar todos</button>
    <button onClick={onClose}>Fechar formulário</button>
  </div>,
}));
import { RelatoriosBens } from "@/components/RelatoriosBens";

function item(id: string, sala: string, tipo = "transferencia"): SolicitacaoBem {
  return { id, bem_id: `bem-${id}`, sala_id: sala, local_origem: sala,
    tipo, destino: null, ativa: true, codigo_red: id, descricao: "Mesa", valor: 10,
    observacao: "", user_id: "usuario", created_at: "2026-10-10T12:00:00Z",
    updated_at: "2026-10-10T12:00:00Z" };
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.carregar.mockResolvedValue([
    item("1", "Sala A"), item("2", "Sala A", "inservivel"), item("3", "Sala B"),
  ]);
});

describe("alerta de bens para transferências", () => {
  it("conta salas distintas, reúne as situações e não remove alertas ao abrir", async () => {
    render(<RelatoriosBens administrador />);
    expect(screen.getByText("ALERTA DE BENS PARA TRANSFERÊNCIAS")).toBeInTheDocument();
    const mensagem = await screen.findByRole("button", { name: "Existe(em) 02 Salas com bens inservíveis ou para transferência de localidades." });
    fireEvent.click(mensagem);
    expect(screen.getAllByRole("button", { name: /Abrir formulário —/ })).toHaveLength(2);
    const linha = screen.getByText("Sala A").parentElement!.parentElement!;
    expect(within(linha).getByText("(Inservíveis)")).toBeInTheDocument();
    expect(within(linha).getByText("(Transferência)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir formulário — Sala A" }));
    expect(screen.getByRole("dialog", { name: "Sala A" })).toBeInTheDocument();
    expect(mensagem).toHaveTextContent("02 Salas");
    fireEvent.click(screen.getByRole("button", { name: "Fechar formulário" }));
    expect(screen.getByRole("button", { name: "Abrir formulário — Sala A" })).toBeInTheDocument();
  });

  it("mantém a sala com itens pendentes após transferência parcial", async () => {
    render(<RelatoriosBens administrador />);
    fireEvent.click(await screen.findByRole("button", { name: /Existe\(em\) 02 Salas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir formulário — Sala A" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar primeiro" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar formulário" }));
    const linha = screen.getByText("Sala A").parentElement!.parentElement!;
    expect(within(linha).getByText("1 bem(ns) pendente(s)")).toBeInTheDocument();
    expect(within(linha).getByText("(Inservíveis)")).toBeInTheDocument();
    expect(within(linha).queryByText("(Transferência)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Existe\(em\) 02 Salas/ })).toBeInTheDocument();
  });

  it("retira a sala do alerta quando todos os seus bens foram transferidos", async () => {
    render(<RelatoriosBens administrador />);
    fireEvent.click(await screen.findByRole("button", { name: /Existe\(em\) 02 Salas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir formulário — Sala A" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar todos" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Existe\(em\) 01 Salas/ })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Abrir formulário — Sala A" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir formulário — Sala B" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Sala A" })).toBeInTheDocument();
  });
});
