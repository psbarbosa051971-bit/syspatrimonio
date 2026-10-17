import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CampoValorReais } from "@/components/CampoValorReais";

function Formulario({ inicial = "" }: { inicial?: string }) {
  const [valor, setValor] = useState(inicial);
  return <>
    <CampoValorReais aria-label="Valor" value={valor} onChange={setValor} />
    <output aria-label="Valor gravado">{valor}</output>
  </>;
}

afterEach(cleanup);

describe("máscara de valor em reais", () => {
  it("formata um valor salvo sem alterar o decimal usado no banco", () => {
    render(<Formulario inicial="339000.00" />);
    expect(screen.getByLabelText("Valor")).toHaveValue("R$\u00a0339.000,00");
    expect(screen.getByLabelText("Valor gravado")).toHaveTextContent("339000.00");
  });

  it("aplica a máscara enquanto digita e permite limpar o campo", () => {
    render(<Formulario />);
    const campo = screen.getByLabelText("Valor");
    for (const [entrada, esperado] of [
      ["3", "0.03"], ["R$ 0,033", "0.33"], ["R$ 0,339", "3.39"],
      ["R$ 3,390", "33.90"], ["R$ 33,900", "339.00"],
      ["R$ 339,000", "3390.00"], ["R$ 3.390,000", "33900.00"],
      ["R$ 33.900,000", "339000.00"],
    ]) {
      fireEvent.change(campo, { target: { value: entrada } });
      expect(screen.getByLabelText("Valor gravado")).toHaveTextContent(esperado);
    }
    expect(campo).toHaveValue("R$\u00a0339.000,00");
    fireEvent.change(campo, { target: { value: "" } });
    expect(campo).toHaveValue("");
    expect(screen.getByLabelText("Valor gravado")).toBeEmptyDOMElement();
  });

  it.each(["339000", "339.000", "R$ 339.000,00", "339000.00"])("aceita colar %s", (texto) => {
    render(<Formulario />);
    fireEvent.paste(screen.getByLabelText("Valor"), { clipboardData: { getData: () => texto } });
    expect(screen.getByLabelText("Valor")).toHaveValue("R$\u00a0339.000,00");
    expect(screen.getByLabelText("Valor gravado")).toHaveTextContent("339000.00");
  });
});
