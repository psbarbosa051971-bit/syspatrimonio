import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeletorLocalFisico } from "@/components/SeletorLocalFisico";

const salas = [
  { id: "1", nome: "200 - Escola Alexandre", unidade: "EDUCAÇÃO" },
  { id: "2", nome: "315 - Recepção", unidade: null },
  { id: "3", nome: "410 - Almoxarifado", unidade: "CENTRAL" },
];

afterEach(cleanup);

describe("Busca de Local Físico", () => {
  it("encontra parte do número ou do nome, sem diferenciar maiúsculas ou acentos", () => {
    render(<SeletorLocalFisico salas={salas} valor={[]} onChange={vi.fn()} />);
    const campo = screen.getByRole("combobox");
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "200" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("200 - Escola Alexandre");
    fireEvent.change(campo, { target: { value: "ALEX" } });
    expect(screen.getByRole("option")).toHaveTextContent("200 - Escola Alexandre");
    fireEvent.change(campo, { target: { value: "recepcao" } });
    expect(screen.getByRole("option")).toHaveTextContent("315 - Recepção");
  });

  it("seleciona o local encontrado com o teclado", () => {
    const onChange = vi.fn();
    render(<SeletorLocalFisico salas={salas} valor={[]} onChange={onChange} />);
    const campo = screen.getByRole("combobox");
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "ALEX" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["1"]);
    expect(campo).toHaveAttribute("aria-expanded", "false");
  });

  it("não remove o vínculo existente apenas ao pesquisar outro local", () => {
    const onChange = vi.fn();
    render(<SeletorLocalFisico salas={salas} valor={["1"]} onChange={onChange} />);
    const campo = screen.getByRole("combobox");
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "315" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option"));
    expect(onChange).toHaveBeenCalledWith(["2"]);
  });

  it("limpa a seleção do cadastro quando uma nova pesquisa é digitada", () => {
    const onChange = vi.fn();
    render(<SeletorLocalFisico salas={salas} valor={["1"]} onChange={onChange} limparAoDigitar />);
    const campo = screen.getByRole("combobox");
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "inexistente" } });
    expect(onChange).toHaveBeenCalledWith([]);
    expect(screen.getByText("Nenhum local encontrado.")).toBeInTheDocument();
  });
});
