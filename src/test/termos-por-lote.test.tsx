import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), gte: vi.fn(), lt: vi.fn(), ids: vi.fn(), range: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { TermosPorLote } from "@/components/TermosPorLote";

const registros = [
  { id: "um", numero: 10, termo_ano: 2026, created_at: "2026-10-10T12:00:00Z", arquivo: "primeiro.html", local: "Sala A" },
  { id: "dois", numero: 11, termo_ano: 2026, created_at: "2026-10-11T12:00:00Z", arquivo: "segundo.html", local: "Sala B" },
];
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(() => {
    let ids: string[] | null = null;
    const query: Record<string, unknown> = {};
    for (const method of ["select", "not", "order"]) query[method] = () => query;
    query.gte = (...args: unknown[]) => { mocks.gte(...args); return query; };
    query.lt = (...args: unknown[]) => { mocks.lt(...args); return query; };
    query.range = (...args: unknown[]) => { mocks.range(...args); return query; };
    query.in = (_campo: string, valores: string[]) => { ids = valores; mocks.ids(valores); return query; };
    query.then = (resolve: (v: unknown) => unknown) => Promise.resolve({
      data: ids ? registros.filter((r) => ids!.includes(r.id)).map((r) => ({ ...r,
        termo_snapshot: { local: r.local, bens: [{ codigo_red: "123", descricao: "Mesa", valor: 20 }] },
      })) : registros, error: null,
    }).then(resolve);
    return query;
  });
});
function abrir() {
  render(<TermosPorLote />);
  fireEvent.click(screen.getByRole("button", { name: "TERMOS POR LOTE" }));
}
function datas(inicial = "2026-10-10", final = "2026-10-11") {
  fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: inicial } });
  fireEvent.change(screen.getByLabelText("Data final"), { target: { value: final } });
}

describe("termos por lote", () => {
  it("só consulta após ambas as datas e inclui todo o dia final no horário de Brasília", async () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-10-10" } });
    expect(mocks.from).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-10-11" } });
    expect(await screen.findByText("Sala A")).toBeInTheDocument();
    expect(screen.getByText("Sala B")).toBeInTheDocument();
    expect(mocks.gte).toHaveBeenCalledWith("created_at", "2026-10-10T00:00:00-03:00");
    expect(mocks.lt).toHaveBeenCalledWith("created_at", "2026-10-12T00:00:00-03:00");
    expect(mocks.range).toHaveBeenCalledWith(0, 499);
    expect(screen.getByRole("button", { name: "Imprimir", exact: true })).toBeDisabled();
  });

  it("recusa datas invertidas sem consultar", () => {
    abrir(); datas("2026-10-12", "2026-10-10");
    expect(screen.getByRole("alert")).toHaveTextContent("A data final deve ser igual ou posterior");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("imprime apenas os termos marcados e duas vias em uma folha por termo", async () => {
    abrir(); datas();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Selecionar termo 11/2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Imprimir", exact: true }));
    const iframe = await screen.findByTitle("Termos de responsabilidade por lote — duas vias") as HTMLIFrameElement;
    expect(mocks.ids).toHaveBeenCalledWith(["dois"]);
    const html = iframe.getAttribute("srcdoc")!;
    expect(html.match(/class="folha"/g)).toHaveLength(1);
    expect(html.match(/class="via"/g)).toHaveLength(2);
    expect(html).toContain("Nº 11/2026");
    expect(html).not.toContain("Nº 10/2026");
    const print = vi.spyOn(iframe.contentWindow!, "print").mockImplementation(() => {});
    vi.spyOn(iframe.contentWindow!, "focus").mockImplementation(() => {});
    fireEvent.load(iframe);
    expect(print).toHaveBeenCalledOnce();
    fireEvent.load(iframe);
    expect(print).toHaveBeenCalledOnce();
  });

  it("permite selecionar todos e limpa a seleção quando o período muda", async () => {
    abrir(); datas();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Selecionar todos os termos" }));
    expect(screen.getByRole("checkbox", { name: "Selecionar termo 10/2026" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Selecionar termo 11/2026" })).toBeChecked();
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-10-12" } });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Selecionar todos os termos" })).not.toBeChecked());
    expect(screen.getByRole("button", { name: "Imprimir", exact: true })).toBeDisabled();
  });
});
