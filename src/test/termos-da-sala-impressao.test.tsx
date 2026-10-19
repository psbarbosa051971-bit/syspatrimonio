import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
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
  onSelecionar: vi.fn(), onLimpar: vi.fn(), onAtualizar: vi.fn(),
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(() => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "order"]) query[method] = () => query;
    query.range = () => Promise.resolve({ data: termos, error: null });
    return query;
  });
});

describe("impressão em Termos criados da sala", () => {
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
});
