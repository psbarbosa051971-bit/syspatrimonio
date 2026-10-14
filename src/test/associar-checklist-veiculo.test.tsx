import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({
  pesquisar: vi.fn(), rpc: vi.fn(), locais: vi.fn(), sucesso: vi.fn(), erro: vi.fn(), podeEditar: true,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: () => ({ select: () => ({ order: () => ({ range: mocks.locais }) }) }),
} }));
vi.mock("@/hooks/use-role", () => ({ useRole: () => ({ podeEditar: mocks.podeEditar, loading: false }) }));
vi.mock("@/lib/pesquisa-dinamica", () => ({ pesquisarBensEmTodasAsSalas: mocks.pesquisar }));
vi.mock("sonner", () => ({ toast: { success: mocks.sucesso, error: mocks.erro } }));
import { AssociarChecklistVeiculo } from "@/components/AssociarChecklistVeiculo";

const checklist = { id: "checklist-1", dados: { modelo_veiculo: "VEÍCULO TESTE", valor: "95000.00", nota_fiscal: "123" } } as unknown as Tables<"checklists_veiculos">;
const bem = { id: "bem-1", codigo_red: "123456", descricao: "VEÍCULO TESTE", sala_id: "sala-1", valor: 95000 } as Tables<"bens">;
const consultar = (codigo = "123.456") => {
  fireEvent.change(screen.getByLabelText("Código RED do veículo para associar"), { target: { value: codigo } });
  fireEvent.click(screen.getByRole("button", { name: "Consultar código RED" }));
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.podeEditar = true;
  mocks.pesquisar.mockResolvedValue({ termo: "123456", bens: [bem], locais: { "sala-1": "Garagem" } });
  mocks.locais.mockResolvedValue({ data: [{ id: "sala-1", nome: "Garagem", unidade: "Transportes" }], error: null });
  mocks.rpc.mockResolvedValue({ data: { bem, termo: { numero: 2, ano: 2026 } }, error: null });
});

describe("associação do checklist pelo código RED, sem HTML", () => {
  it("consulta um RED com pontos e associa usando o código normalizado", async () => {
    const onAssociated = vi.fn();
    render(<AssociarChecklistVeiculo checklist={checklist} onClose={vi.fn()} onAssociated={onAssociated} />);
    consultar();
    await screen.findByText("RED 123.456");
    fireEvent.click(screen.getByRole("button", { name: "Associar checklist ao código RED" }));
    await waitFor(() => expect(onAssociated).toHaveBeenCalledWith(bem));
    expect(mocks.pesquisar).toHaveBeenCalledWith("123456");
    expect(mocks.rpc).toHaveBeenCalledWith("associar_checklist_veiculo_por_red", {
      _checklist_id: "checklist-1", _codigo_red: "123456",
    });
  });

  it("não associa um resultado parcial e cadastra o RED exato no local escolhido", async () => {
    mocks.pesquisar.mockResolvedValue({ termo: "123456", bens: [{ ...bem, codigo_red: "1234567" }], locais: {} });
    render(<AssociarChecklistVeiculo checklist={checklist} onClose={vi.fn()} onAssociated={vi.fn()} />);
    consultar();
    const cadastrar = await screen.findByRole("button", { name: "Cadastrar RED e associar checklist" });
    expect(cadastrar).toBeDisabled();
    fireEvent.focus(screen.getByRole("combobox", { name: "Local Físico do veículo" }));
    fireEvent.click(screen.getByRole("option", { name: /Garagem/ }));
    fireEvent.click(cadastrar);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("associar_checklist_veiculo_por_red", {
      _checklist_id: "checklist-1", _codigo_red: "123456", _sala_id: "sala-1",
    }));
  });

  it("invalida a consulta ao alterar o código para impedir associação ao veículo anterior", async () => {
    render(<AssociarChecklistVeiculo checklist={checklist} onClose={vi.fn()} onAssociated={vi.fn()} />);
    consultar();
    await screen.findByText("RED 123.456");
    fireEvent.change(screen.getByLabelText("Código RED do veículo para associar"), { target: { value: "999999" } });
    expect(screen.getByRole("button", { name: "Associar checklist ao código RED" })).toBeDisabled();
    expect(screen.queryByText("RED 123.456")).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("mantém a janela e os dados quando o banco bloqueia um RED com termo existente", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Este veículo já possui um termo." } });
    const onAssociated = vi.fn();
    render(<AssociarChecklistVeiculo checklist={checklist} onClose={vi.fn()} onAssociated={onAssociated} />);
    consultar();
    await screen.findByText("RED 123.456");
    fireEvent.click(screen.getByRole("button", { name: "Associar checklist ao código RED" }));
    await waitFor(() => expect(mocks.erro).toHaveBeenCalledWith("Este veículo já possui um termo."));
    expect(onAssociated).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Código RED do veículo para associar")).toHaveValue("123.456");
  });

  it("não permite criar patrimônio para uma conta sem permissão de edição", async () => {
    mocks.podeEditar = false;
    mocks.pesquisar.mockResolvedValue({ termo: "123456", bens: [], locais: {} });
    render(<AssociarChecklistVeiculo checklist={checklist} onClose={vi.fn()} onAssociated={vi.fn()} />);
    consultar();
    await screen.findByText(/Peça a um administrador ou operador para cadastrar/);
    expect(screen.getByRole("button", { name: "Cadastrar RED e associar checklist" })).toBeDisabled();
    expect(mocks.locais).not.toHaveBeenCalled();
  });

  it("recusa texto ou múltiplos códigos RED", () => {
    render(<AssociarChecklistVeiculo checklist={checklist} onClose={vi.fn()} onAssociated={vi.fn()} />);
    consultar("123,456");
    expect(screen.getByRole("button", { name: "Consultar código RED" })).toBeDisabled();
    expect(mocks.pesquisar).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
