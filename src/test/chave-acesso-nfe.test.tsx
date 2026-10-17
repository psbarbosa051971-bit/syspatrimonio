import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChaveAcessoNfe } from "@/components/ChaveAcessoNfe";
import { CampoEmissaoNfe } from "@/components/CampoEmissaoNfe";
import { usePreenchimentoNfe } from "@/hooks/use-preenchimento-nfe";

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

function FormularioAutomatico() {
  const [dados, setDados] = useState<Record<string, string>>({ fornecedor: "Fornecedor manual" });
  const { emissaoRef, camposPreenchidos, registrarPreenchimento } = usePreenchimentoNfe();
  return <>
    <ChaveAcessoNfe dados={dados} onChange={(valores) => setDados((atuais) => ({ ...atuais, ...valores }))}
      onPreenchido={registrarPreenchimento} />
    <input aria-label="Nota fiscal" readOnly value={dados.nota_fiscal ?? ""}
      className={camposPreenchidos.has("nota_fiscal") ? "campo-nfe-preenchido" : ""} />
    <CampoEmissaoNfe ref={emissaoRef} value={dados.emissao ?? ""} mes={dados.emissao_mes}
      className={camposPreenchidos.has("emissao") ? "campo-nfe-preenchido" : ""}
      onChange={(emissao) => setDados((atuais) => ({ ...atuais, emissao }))} />
    <output aria-label="Data gravada">{dados.emissao ?? ""}</output>
  </>;
}

describe("leitura automática sem clicar em preencher", () => {
  it("preenche ao completar a chave e seleciona o dia sem inventar a data", async () => {
    render(<FormularioAutomatico />);
    const chave = screen.getByPlaceholderText(/Digite, cole ou leia/);
    fireEvent.change(chave, { target: { value: chaveValida().slice(0, 43) } });
    expect(screen.getByLabelText("Nota fiscal")).toHaveValue("");
    fireEvent.change(chave, { target: { value: chaveValida() } });
    expect(screen.getByLabelText("Nota fiscal")).toHaveValue("45593");
    expect(screen.getByLabelText("Nota fiscal")).toHaveClass("campo-nfe-preenchido");
    const emissao = screen.getByLabelText("Emissão") as HTMLInputElement;
    await waitFor(() => expect(emissao).toHaveFocus());
    expect(emissao).toHaveValue("__/10/2026");
    expect(emissao).toHaveClass("campo-nfe-preenchido");
    expect(emissao.selectionStart).toBe(0);
    expect(emissao.selectionEnd).toBe(2);
    expect(screen.getByLabelText("Data gravada")).toBeEmptyDOMElement();
    fireEvent.change(emissao, { target: { value: "14/10/2026" } });
    expect(screen.getByLabelText("Data gravada")).toHaveTextContent("2026-10-14");
  });

  it("permite digitar o dia um dígito por vez no mês e ano lidos", async () => {
    render(<FormularioAutomatico />);
    fireEvent.change(screen.getByPlaceholderText(/Digite, cole ou leia/), { target: { value: chaveValida() } });
    const emissao = screen.getByLabelText("Emissão") as HTMLInputElement;
    await waitFor(() => expect(emissao).toHaveFocus());
    fireEvent.click(emissao);
    expect(emissao.selectionStart).toBe(0);
    expect(emissao.selectionEnd).toBe(2);
    fireEvent.change(emissao, { target: { value: "1/10/2026" } });
    expect(emissao).toHaveValue("1_/10/2026");
    await waitFor(() => expect(emissao.selectionStart).toBe(1));
    expect(screen.getByLabelText("Data gravada")).toBeEmptyDOMElement();
    fireEvent.change(emissao, { target: { value: "14_/10/2026" } });
    expect(emissao).toHaveValue("14/10/2026");
    expect(screen.getByLabelText("Data gravada")).toHaveTextContent("2026-10-14");
  });

  it("formata a data completa ao digitar sem preencher a chave da nota", () => {
    render(<FormularioAutomatico />);
    const emissao = screen.getByLabelText("Emissão");
    for (const [entrada, esperado] of [
      ["1", "1"], ["14", "14"], ["141", "14/1"], ["14/10", "14/10"],
      ["14/102", "14/10/2"], ["14/10/20", "14/10/20"],
      ["14/10/202", "14/10/202"], ["14/10/2026", "14/10/2026"],
    ]) {
      fireEvent.change(emissao, { target: { value: entrada } });
      expect(emissao).toHaveValue(esperado);
    }
    expect(screen.getByLabelText("Data gravada")).toHaveTextContent("2026-10-14");
  });

  it("não perde a edição parcial da emissão nem grava um dia impossível", () => {
    render(<FormularioAutomatico />);
    fireEvent.change(screen.getByPlaceholderText(/Digite, cole ou leia/), { target: { value: chaveValida() } });
    const emissao = screen.getByLabelText("Emissão");
    fireEvent.change(emissao, { target: { value: "14/10/2026" } });
    fireEvent.change(emissao, { target: { value: "1/10/2026" } });
    expect(emissao).toHaveValue("1/10/2026");
    expect(screen.getByLabelText("Data gravada")).toBeEmptyDOMElement();
    fireEvent.change(emissao, { target: { value: "32/10/2026" } });
    expect(screen.getByLabelText("Data gravada")).toBeEmptyDOMElement();
  });
});

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
