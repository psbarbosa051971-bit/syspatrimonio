import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChaveAcessoNfe } from "@/components/ChaveAcessoNfe";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/LeitorChaveNfe", () => ({ LeitorChaveNfe: () => null }));

function chaveValida() {
  const base = "31" + "2610" + "12345678000195" + "55" + "001" + "000045593" + "1" + "12345678";
  let soma = 0;
  for (let i = 42, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) soma += Number(base[i]) * peso;
  const resto = soma % 11;
  return base + (resto < 2 ? 0 : 11 - resto);
}

function Formulario({ fornecedor = "" }: { fornecedor?: string }) {
  const [dados, setDados] = useState<Record<string, string>>({ chave_acesso: chaveValida(), fornecedor, valor: "125.50" });
  return <>
    <ChaveAcessoNfe dados={dados} onChange={(valores) => setDados((atuais) => ({ ...atuais, ...valores }))} />
    <input aria-label="Fornecedor" value={dados.fornecedor ?? ""} onChange={(e) => setDados((atuais) => ({ ...atuais, fornecedor: e.target.value }))} />
    <input aria-label="Nota fiscal" readOnly value={dados.nota_fiscal ?? ""} />
    <input aria-label="Valor" readOnly value={dados.valor ?? ""} />
  </>;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("preenchimento da NF-e sem perder o fornecedor digitado", () => {
  it("preenche a nota e preserva fornecedor e valor ao ler somente a chave", () => {
    const consulta = vi.fn();
    vi.stubGlobal("fetch", consulta);
    render(<Formulario fornecedor="Fornecedor digitado" />);
    fireEvent.click(screen.getByRole("button", { name: "Ler chave e preencher" }));
    expect(screen.getByLabelText("Nota fiscal")).toHaveValue("45593");
    expect(screen.getByLabelText("Fornecedor")).toHaveValue("Fornecedor digitado");
    expect(screen.getByLabelText("Valor")).toHaveValue("125.50");
    expect(consulta).not.toHaveBeenCalled();
  });

  it("não substitui o fornecedor digitado enquanto a consulta está em andamento", async () => {
    let responder!: (resposta: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { responder = resolve; })));
    render(<Formulario />);
    fireEvent.click(screen.getByRole("button", { name: "Ler chave e preencher" }));
    fireEvent.change(screen.getByLabelText("Fornecedor"), { target: { value: "Nome manual" } });
    responder({ ok: true, json: async () => ({ razao_social: "Nome da consulta" }) } as Response);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ler chave e preencher" })).toBeEnabled());
    expect(screen.getByLabelText("Fornecedor")).toHaveValue("Nome manual");
  });

  it("consulta o fornecedor quando o campo está vazio", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ razao_social: "Fornecedor consultado" }) }));
    render(<Formulario />);
    fireEvent.click(screen.getByRole("button", { name: "Ler chave e preencher" }));
    await waitFor(() => expect(screen.getByLabelText("Fornecedor")).toHaveValue("Fornecedor consultado"));
    expect(screen.getByLabelText("Nota fiscal")).toHaveValue("45593");
  });
});
